-- ================================================================
-- SurveyOS Migration 13: Stakeout QC — Phase 1 refinements
-- ================================================================
-- Follow-up to migration 12. Three deliberate additions, none of
-- which introduce new tables or RLS:
--
--   1. Firm-level default tolerances. Phase 1 scope puts tolerance
--      defaults at the firm, not at a department — most SurveyOS
--      firms in the trial cohort are small enough that one horizontal
--      and one vertical baseline is the right unit of authority.
--      Departmental overrides (office / field / utility) are deferred
--      to Phase 1.5 and will layer above these.
--
--   2. Client-contact metadata and expected hours on assignments.
--      PMs have been writing this into the notes field, which is the
--      wrong column of the right shape. Breaking it out so the field
--      PWA can surface a tap-to-call row without the crew digging
--      through free text.
--
--   3. Separate vertical QC status on observations. The crew workflow
--      reality: elevation is captured on every shot, but it is only
--      meaningful as pass/fail on on-location stakes — offset stakes
--      record elevation as informational cut/fill, not as a gradeable
--      target. A single h_status conflated those cases; a nullable
--      v_status alongside effective_tolerance_v lets the QC pipeline
--      grade verticals only when the point deserves to be graded.
--
-- View alignment: the stakeout_qc_summary view gets a firm-level
-- fallback added to its tolerance COALESCE chains and the hard-coded
-- tail value is rebased from 0.020 / 0.050 to 0.060 / 0.030 to match
-- the new firm defaults.
--
-- Vertical-tolerance mirror columns (default_tolerance_v on
-- stakeout_assignments, override_tolerance_v on
-- stakeout_assignment_points) are also added here so the view's
-- vertical COALESCE has a full chain to walk. See the report at the
-- bottom of this migration's changelog for context.
-- ================================================================

BEGIN;

-- ================================================================
-- SECTION 1: FIRM-LEVEL TOLERANCE DEFAULTS
-- ================================================================
-- Baseline horizontal and vertical tolerances live on the firm so
-- every assignment, feature code, and design point inherits from a
-- single authoritative row when no more-specific value is set. NOT
-- NULL with a DEFAULT — Postgres backfills existing firm rows with
-- the default during the ALTER.
--
-- Phase 1 scope: firm-level only. Departmental (office / field /
-- utility) scopes are intentionally deferred to Phase 1.5 and will
-- slot in between the assignment and firm steps of the COALESCE.

ALTER TABLE public.firms
    ADD COLUMN IF NOT EXISTS default_tolerance_h NUMERIC(6,3) NOT NULL DEFAULT 0.060,
    ADD COLUMN IF NOT EXISTS default_tolerance_v NUMERIC(6,3) NOT NULL DEFAULT 0.030;


-- ================================================================
-- SECTION 2: FEATURE_CODES DEFAULT-TOLERANCE REBASE
-- ================================================================
-- Realign feature_codes' column-level DEFAULT clause with the new
-- firm baseline (0.060 / 0.030). This only affects FUTURE inserts —
-- existing rows keep whatever default they were inserted with.
-- Migration 12 ships feature_codes empty (no firm-specific seed),
-- so there is nothing to retro-update.

ALTER TABLE public.feature_codes
    ALTER COLUMN default_tolerance_h SET DEFAULT 0.060,
    ALTER COLUMN default_tolerance_v SET DEFAULT 0.030;


-- ================================================================
-- SECTION 3: ASSIGNMENT CLIENT CONTACT + EXPECTED HOURS
-- ================================================================
-- PMs were stuffing the on-site contact's name and phone into the
-- `notes` TEXT column, which made the field PWA unable to render a
-- dedicated call/text row. Breaking the data out into first-class
-- columns. Every field is nullable — PMs will not always estimate
-- hours, and some private jobs ship without a posted contact.

ALTER TABLE public.stakeout_assignments
    ADD COLUMN IF NOT EXISTS expected_hours        NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS client_contact_name   TEXT,
    ADD COLUMN IF NOT EXISTS client_contact_phone  TEXT,
    ADD COLUMN IF NOT EXISTS client_contact_role   TEXT,
    ADD COLUMN IF NOT EXISTS client_contact_notes  TEXT;


-- ================================================================
-- SECTION 4: VERTICAL QC STATUS + TOLERANCE MIRROR COLUMNS
-- ================================================================
-- Three related additions so the QC pipeline can grade verticals
-- independently of horizontals:
--
--   a) stakeout_qc_points gets v_status and effective_tolerance_v.
--      v_status is nullable — it stays NULL for offset stakes where
--      elevation is informational cut/fill, not a gradeable target.
--      effective_tolerance_v is likewise nullable and only populated
--      when v_status is non-null.
--
--   b) stakeout_assignments gets default_tolerance_v. Migration 12
--      shipped default_tolerance_h but not its vertical twin; the
--      view's vertical COALESCE needs this rung.
--
--   c) stakeout_assignment_points gets override_tolerance_v, the
--      per-point-in-assignment vertical twin of override_tolerance_h.

ALTER TABLE public.stakeout_qc_points
    ADD COLUMN IF NOT EXISTS v_status              TEXT,
    ADD COLUMN IF NOT EXISTS effective_tolerance_v NUMERIC(6,3);

ALTER TABLE public.stakeout_assignments
    ADD COLUMN IF NOT EXISTS default_tolerance_v   NUMERIC(6,3);

ALTER TABLE public.stakeout_assignment_points
    ADD COLUMN IF NOT EXISTS override_tolerance_v  NUMERIC(6,3);

-- Named CHECK constraint wrapped in a DO block that drops-if-exists
-- before adding, mirroring the valid_offset_direction_* pattern from
-- migration 12 section 9.5 so this migration is re-runnable.
DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_v_status_qc_points;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_v_status_qc_points CHECK (
            v_status IN ('in_tol','out_of_tol','field_fit','built_on','pending')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_v_status_qc_points: %', SQLERRM;
END;
$$;

-- Partial-style index, matching the existing h_status index from
-- migration 12 section 6 so the "out-of-tol verticals" filter has
-- the same access plan as its horizontal twin.
CREATE INDEX IF NOT EXISTS idx_stakeout_qc_points_v_status
    ON public.stakeout_qc_points(v_status);


-- ================================================================
-- SECTION 5: REBUILD stakeout_qc_summary WITH FIRM FALLBACK + V COLUMNS
-- ================================================================
-- Drop-and-recreate (same treatment migration 12 gave it) so the
-- view picks up the new columns and the extended tolerance chain.
-- Changes vs migration 12:
--
--   • New LEFT JOIN onto public.firms f via proj.firm_id, so firm-
--     level tolerance defaults can participate in the COALESCE.
--   • effective_tolerance_h COALESCE extended with f.default_tolerance_h
--     and the hard-fallback tail rebased from 0.020 to 0.060.
--   • New v_status column projected.
--   • New effective_tolerance_v column with the full COALESCE chain
--     (observation → assignment-point override → design-point override
--     → assignment default → feature-code default → firm default →
--     0.030 fallback).
--
-- Everything else (join shape, horizontal columns, LEFT JOINs on qp
-- and fc, column order) is preserved verbatim from migration 12.

DROP VIEW IF EXISTS public.stakeout_qc_summary;
CREATE VIEW public.stakeout_qc_summary AS
SELECT
    a.id                          AS assignment_id,
    a.project_id                  AS project_id,
    a.assignment_date             AS assignment_date,
    a.party_chief_id              AS party_chief_id,
    dp.id                         AS design_point_id,
    qp.id                         AS observation_id,
    dp.point_id                   AS point_id,
    dp.feature_code               AS design_feature_code,
    dp.feature_description        AS feature_description,
    dp.northing                   AS design_n,
    dp.easting                    AS design_e,
    dp.elevation                  AS design_z,
    qp.observed_northing          AS staked_n,
    qp.observed_easting           AS staked_e,
    qp.observed_elevation         AS staked_z,
    qp.raw_code                   AS raw_code,
    qp.parsed_feature             AS parsed_feature,
    qp.declared_offset_distance   AS declared_offset_distance,
    qp.declared_offset_direction  AS declared_offset_direction,
    qp.actual_offset_distance     AS actual_offset_distance,
    qp.actual_offset_direction    AS actual_offset_direction,
    qp.offset_variance            AS offset_variance,
    qp.delta_n                    AS delta_n,
    qp.delta_e                    AS delta_e,
    qp.delta_z                    AS delta_z,
    qp.delta_h                    AS delta_h,
    COALESCE(
        qp.effective_tolerance_h,
        ap.override_tolerance_h,
        dp.tolerance_h_override,
        a.default_tolerance_h,
        fc.default_tolerance_h,
        f.default_tolerance_h,
        0.060
    )                             AS effective_tolerance_h,
    qp.h_status                   AS h_status,
    qp.v_status                   AS v_status,
    COALESCE(
        qp.effective_tolerance_v,
        ap.override_tolerance_v,
        dp.tolerance_v_override,
        a.default_tolerance_v,
        fc.default_tolerance_v,
        f.default_tolerance_v,
        0.030
    )                             AS effective_tolerance_v,
    qp.field_fit_reason           AS field_fit_reason,
    qp.field_fit_note             AS field_fit_note,
    qp.built_on_status            AS built_on_status
FROM public.stakeout_assignments a
JOIN public.stakeout_assignment_points ap
    ON ap.assignment_id = a.id
JOIN public.stakeout_design_points dp
    ON dp.id = ap.design_point_id
LEFT JOIN public.stakeout_qc_points qp
    ON qp.assignment_id = a.id
   AND qp.design_point_id = dp.id
LEFT JOIN public.projects proj
    ON proj.id = a.project_id
LEFT JOIN public.firms f
    ON f.id = proj.firm_id
LEFT JOIN public.feature_codes fc
    ON fc.firm_id = proj.firm_id
   AND fc.code = dp.feature_code;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify the migration:
--
-- -- Firm defaults landed with the expected DEFAULT values
-- SELECT column_name, data_type, numeric_precision, numeric_scale,
--        column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'firms'
--     AND column_name IN ('default_tolerance_h','default_tolerance_v')
--   ORDER BY column_name;
--
-- -- Assignment client-contact + expected_hours columns exist
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_assignments'
--     AND column_name IN (
--       'expected_hours','client_contact_name','client_contact_phone',
--       'client_contact_role','client_contact_notes','default_tolerance_v'
--     )
--   ORDER BY column_name;
--
-- -- qc_points v_status column + constraint + index
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_qc_points'
--     AND column_name IN ('v_status','effective_tolerance_v');
--
-- SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname = 'stakeout_qc_points'
--     AND conname = 'valid_v_status_qc_points';
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND tablename = 'stakeout_qc_points'
--     AND indexname = 'idx_stakeout_qc_points_v_status';
--
-- -- assignment_points override_tolerance_v exists
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_assignment_points'
--     AND column_name = 'override_tolerance_v';
--
-- -- Updated view surfaces both tolerance columns and the v_status
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_qc_summary'
--     AND column_name IN (
--       'effective_tolerance_h','effective_tolerance_v',
--       'h_status','v_status'
--     )
--   ORDER BY column_name;

COMMIT;
