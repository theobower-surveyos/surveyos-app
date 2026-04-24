-- ================================================================
-- SurveyOS Migration 16: QC Points shot_type + line endpoint B
-- ================================================================
-- Stage 10.2 (matching engine) companion schema change. Three kinds
-- of additions:
--
--   1. Two new columns on stakeout_qc_points:
--        • shot_type        — classifier for the kind of observation
--                             (point_stake, line_stake, check_shot,
--                              control_check, unmatched_bonus,
--                              parse_error, unmatched_check).
--        • design_point_id_b — second endpoint for line_stake rows.
--                              Null for every other shot_type.
--
--   2. Extensions to the existing h_status / v_status CHECK
--      constraints so they accept the new classifier values emitted
--      by the Stage 10.2 matcher (check_pass, check_fail, unmatched,
--      parse_error, unmatched_check). Existing values (in_tol,
--      out_of_tol, field_fit, built_on, pending) are preserved so
--      rows written before this migration remain valid.
--
--   3. Relaxed value whitelists on three legacy-grammar columns so
--      the matcher's SOS-grammar output can be persisted without
--      translation:
--        • actual_offset_direction — now carries decimal-degree
--          bearings as text (e.g., "45.2") for point and check
--          shots, "perpendicular" for line stakes.
--        • parsed_stake_type / declared_stake_type — now carry the
--          canonical SOS stake types (HUB, LATHE, NAIL, ...) rather
--          than the older single-letter codes.
--      The assignment-points and assignment-defaults stake-type
--      columns are left alone; those are still authored via the
--      legacy grammar in PM-facing UI.
--
-- User applies this migration manually via the Supabase SQL Editor
-- before running the Stage 10.2 dev tester matcher commit path.
-- ================================================================

BEGIN;

-- ── 1. NEW COLUMNS ──────────────────────────────────────────────
ALTER TABLE public.stakeout_qc_points
    ADD COLUMN IF NOT EXISTS shot_type          TEXT,
    ADD COLUMN IF NOT EXISTS design_point_id_b  UUID REFERENCES public.stakeout_design_points(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stakeout_qc_points.shot_type IS
    'Classifier for the kind of observation. Values: point_stake, line_stake, check_shot, control_check, unmatched_bonus, parse_error, unmatched_check.';

COMMENT ON COLUMN public.stakeout_qc_points.design_point_id_b IS
    'Second endpoint for line_stake shots (references stakeout_design_points). Null for all other shot_type values.';


-- ── 2. EXTEND h_status ──────────────────────────────────────────
-- Migration 12 defined the h_status CHECK inline, producing a
-- Postgres auto-generated name (stakeout_qc_points_h_status_check).
-- Drop both that name and the future-named form this migration
-- installs, so re-runs are clean.
ALTER TABLE public.stakeout_qc_points
    DROP CONSTRAINT IF EXISTS stakeout_qc_points_h_status_check;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_h_status_qc_points;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_h_status_qc_points CHECK (
            h_status IN (
                'in_tol', 'out_of_tol', 'field_fit', 'built_on', 'pending',
                'check_pass', 'check_fail', 'unmatched', 'parse_error', 'unmatched_check'
            )
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_h_status_qc_points: %', SQLERRM;
END;
$$;


-- ── 3. EXTEND v_status ──────────────────────────────────────────
-- Named in migration 13 as valid_v_status_qc_points; drop by name.
DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_v_status_qc_points;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_v_status_qc_points CHECK (
            v_status IN (
                'in_tol', 'out_of_tol', 'field_fit', 'built_on', 'pending',
                'check_pass', 'check_fail'
            )
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_v_status_qc_points: %', SQLERRM;
END;
$$;


-- ── 4. RELAX LEGACY WHITELISTS ──────────────────────────────────
-- actual_offset_direction now stores decimal-degree bearings as text,
-- or the literal "perpendicular" for line-stake projections. The old
-- CHECK (IN 'N','S','E','W','perpendicular') is dropped without a
-- replacement — all free text is valid, and nulls remain permitted.
DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_offset_direction_qc_points_actual;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'drop valid_offset_direction_qc_points_actual: %', SQLERRM;
END;
$$;

-- parsed_stake_type now carries SOS canonical codes (HUB, LATHE, ...).
DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_stake_type_qc_points_parsed;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'drop valid_stake_type_qc_points_parsed: %', SQLERRM;
END;
$$;

-- declared_stake_type now carries either SOS canonical codes (from
-- the matcher) or legacy single-letter codes (from pre-existing
-- assignment defaults / overrides). Accept both by dropping the
-- value whitelist.
DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_stake_type_qc_points_declared;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'drop valid_stake_type_qc_points_declared: %', SQLERRM;
END;
$$;


-- ── 5. INDEX ────────────────────────────────────────────────────
-- Composite index to power QC dashboards grouping by shot_type
-- within a single assignment.
CREATE INDEX IF NOT EXISTS idx_qc_points_shot_type
    ON public.stakeout_qc_points(assignment_id, shot_type);


COMMIT;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify the migration:
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_qc_points'
--     AND column_name IN ('shot_type','design_point_id_b');
--
-- SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname = 'stakeout_qc_points'
--     AND conname IN ('valid_h_status_qc_points','valid_v_status_qc_points');
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND tablename = 'stakeout_qc_points'
--     AND indexname = 'idx_qc_points_shot_type';
