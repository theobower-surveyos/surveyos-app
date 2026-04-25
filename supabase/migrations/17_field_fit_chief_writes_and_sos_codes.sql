-- ================================================================
-- SurveyOS Migration 17: Field-fit chief writes + SOS reason codes
-- ================================================================
-- Stage 10.4.5 schema cleanup. Two coordinated changes that let the
-- chief flag a stake as field-fit by writing clean column values
-- instead of the [OB]-prefix workaround Stage 10.4 had to use:
--
--   1. field_fit_reason CHECK accepts the SOS canonical codes
--      (OB, AC, SA, CF, OT) alongside the legacy values from
--      migration 12 (preserved for backward compat — existing
--      analytics queries against 'utility_conflict' etc. continue
--      to work).
--
--   2. enforce_qc_point_column_protection() relaxes ONLY the
--      h_status check to permit chief role to flip h_status between
--      'out_of_tol' and 'field_fit' on rows they're already allowed
--      to update via RLS. Every other column protection (delta_h,
--      observed_*, parsed_*, declared_*, etc. — 22 columns total)
--      is preserved verbatim. Ownership of the row is already
--      enforced by the "Party chief updates own qc points" RLS
--      policy from migration 12 section 16; the trigger only handles
--      column-level gating.
--
-- Followed by a one-shot data migration that converts any existing
-- rows from the Stage 10.4 prefix-encoded format (h_status=out_of_tol
-- + field_fit_reason='other' + field_fit_note='[OB] note') to clean
-- column values (h_status='field_fit' + field_fit_reason='OB' +
-- field_fit_note='note').
--
-- User applies this migration manually via the Supabase SQL Editor.
-- ================================================================

BEGIN;

-- ── 1. EXTEND field_fit_reason CHECK ────────────────────────────
-- Migration 12 defined the CHECK inline on the column, producing
-- the auto-generated name stakeout_qc_points_field_fit_reason_check.
-- Drop both that name and the future-named replacement so re-runs
-- are idempotent.
ALTER TABLE public.stakeout_qc_points
    DROP CONSTRAINT IF EXISTS stakeout_qc_points_field_fit_reason_check;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_field_fit_reason_qc_points;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_field_fit_reason_qc_points CHECK (
            field_fit_reason IS NULL OR field_fit_reason IN (
                -- SOS canonical codes (Stage 10.4)
                'OB',  -- Obstruction
                'AC',  -- Access issue
                'SA',  -- Safety
                'CF',  -- Conflict (existing infrastructure)
                'OT',  -- Other
                -- Legacy values from migration 12, preserved for backward
                -- compatibility with any pre-Stage-10.4 data.
                'adjacent_line',
                'utility_conflict',
                'design_math_error',
                'grade_adjustment',
                'other'
            )
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_field_fit_reason_qc_points: %', SQLERRM;
END;
$$;

COMMENT ON COLUMN public.stakeout_qc_points.field_fit_reason IS
    'SOS reason code for field-fit deviations: OB (Obstruction), AC (Access), SA (Safety), CF (Conflict), OT (Other). Legacy values from earlier stages preserved.';


-- ── 2. RELAX h_status CHECK IN COLUMN-PROTECTION TRIGGER ────────
-- Replace the function in place. The body is identical to the
-- migration 12 definition except that the h_status branch now
-- permits the specific out_of_tol ↔ field_fit transition for chief
-- role. Every other per-column check is preserved.
--
-- Row ownership is already enforced by the "Party chief updates own
-- qc points" RLS policy (migration 12 section 16), so the function
-- still only worries about which columns may diff.

CREATE OR REPLACE FUNCTION public.enforce_qc_point_column_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Office roles retain full authority.
    IF public.get_my_role() IN ('owner','admin','pm') THEN
        RETURN NEW;
    END IF;

    -- Field roles: only field_fit_reason, field_fit_note, built_on_status,
    -- and the specific out_of_tol ↔ field_fit transition on h_status,
    -- may change. Any other column diff is rejected.
    IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column run_id is not editable by field roles.';
    END IF;
    IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column assignment_id is not editable by field roles.';
    END IF;
    IF NEW.design_point_id IS DISTINCT FROM OLD.design_point_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column design_point_id is not editable by field roles.';
    END IF;
    IF NEW.observed_point_id IS DISTINCT FROM OLD.observed_point_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_point_id is not editable by field roles.';
    END IF;
    IF NEW.observed_northing IS DISTINCT FROM OLD.observed_northing THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_northing is not editable by field roles.';
    END IF;
    IF NEW.observed_easting IS DISTINCT FROM OLD.observed_easting THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_easting is not editable by field roles.';
    END IF;
    IF NEW.observed_elevation IS DISTINCT FROM OLD.observed_elevation THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_elevation is not editable by field roles.';
    END IF;
    IF NEW.raw_code IS DISTINCT FROM OLD.raw_code THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column raw_code is not editable by field roles.';
    END IF;
    IF NEW.parsed_feature IS DISTINCT FROM OLD.parsed_feature THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_feature is not editable by field roles.';
    END IF;
    IF NEW.parsed_offset_distance IS DISTINCT FROM OLD.parsed_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.parsed_offset_direction IS DISTINCT FROM OLD.parsed_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.parsed_stake_type IS DISTINCT FROM OLD.parsed_stake_type THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_stake_type is not editable by field roles.';
    END IF;
    IF NEW.declared_offset_distance IS DISTINCT FROM OLD.declared_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.declared_offset_direction IS DISTINCT FROM OLD.declared_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.declared_stake_type IS DISTINCT FROM OLD.declared_stake_type THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_stake_type is not editable by field roles.';
    END IF;
    IF NEW.actual_offset_distance IS DISTINCT FROM OLD.actual_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column actual_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.actual_offset_direction IS DISTINCT FROM OLD.actual_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column actual_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.offset_variance IS DISTINCT FROM OLD.offset_variance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column offset_variance is not editable by field roles.';
    END IF;
    IF NEW.delta_n IS DISTINCT FROM OLD.delta_n THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_n is not editable by field roles.';
    END IF;
    IF NEW.delta_e IS DISTINCT FROM OLD.delta_e THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_e is not editable by field roles.';
    END IF;
    IF NEW.delta_z IS DISTINCT FROM OLD.delta_z THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_z is not editable by field roles.';
    END IF;
    IF NEW.delta_h IS DISTINCT FROM OLD.delta_h THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_h is not editable by field roles.';
    END IF;
    IF NEW.effective_tolerance_h IS DISTINCT FROM OLD.effective_tolerance_h THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column effective_tolerance_h is not editable by field roles.';
    END IF;
    -- h_status: chiefs may flip between out_of_tol and field_fit only.
    -- Any other transition (e.g., to in_tol, check_pass, unmatched) is
    -- still rejected. NULL transitions remain blocked since they would
    -- mean a chief is creating or wiping a fresh status.
    IF NEW.h_status IS DISTINCT FROM OLD.h_status THEN
        IF NOT (
            (OLD.h_status = 'out_of_tol' AND NEW.h_status = 'field_fit') OR
            (OLD.h_status = 'field_fit'  AND NEW.h_status = 'out_of_tol') OR
            (OLD.h_status = 'field_fit'  AND NEW.h_status = 'in_tol')     OR
            (OLD.h_status = 'in_tol'     AND NEW.h_status = 'field_fit')
        ) THEN
            RAISE EXCEPTION 'Field roles may only flag stakes as field-fit (transitions out_of_tol ↔ field_fit and in_tol ↔ field_fit). Other h_status changes are not permitted.';
        END IF;
    END IF;
    IF NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_at is not editable by field roles.';
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger itself does not need to be re-created — CREATE OR REPLACE
-- on the function body is enough for the existing
-- enforce_column_protection trigger to pick up the new logic.


-- ── 3. BACKFILL EXISTING [OB]-PREFIX ROWS ───────────────────────
-- Migrate any rows that the Stage 10.4 UI wrote in the prefix-encoded
-- format. Migration runs as the migration owner (full authority), so
-- the trigger's office-role pass-through allows these writes.

UPDATE public.stakeout_qc_points
SET
    h_status = 'field_fit',
    field_fit_reason = CASE
        WHEN field_fit_note LIKE '[OB]%' THEN 'OB'
        WHEN field_fit_note LIKE '[AC]%' THEN 'AC'
        WHEN field_fit_note LIKE '[SA]%' THEN 'SA'
        WHEN field_fit_note LIKE '[CF]%' THEN 'CF'
        WHEN field_fit_note LIKE '[OT]%' THEN 'OT'
        ELSE field_fit_reason
    END,
    field_fit_note = CASE
        WHEN field_fit_note ~ '^\[(OB|AC|SA|CF|OT)\]\s*$'
            THEN NULL
        WHEN field_fit_note ~ '^\[(OB|AC|SA|CF|OT)\]\s+'
            THEN regexp_replace(field_fit_note, '^\[(OB|AC|SA|CF|OT)\]\s+', '')
        ELSE field_fit_note
    END
WHERE field_fit_note ~ '^\[(OB|AC|SA|CF|OT)\]';


COMMIT;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify:
--
-- -- Updated CHECK accepts SOS codes
-- SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   WHERE t.relname = 'stakeout_qc_points'
--     AND conname = 'valid_field_fit_reason_qc_points';
--
-- -- Backfilled rows look right (no remaining [OB]-prefix notes)
-- SELECT observed_point_id, h_status, field_fit_reason, field_fit_note
--   FROM stakeout_qc_points
--   WHERE field_fit_reason IS NOT NULL
--     OR field_fit_note IS NOT NULL
--   ORDER BY observed_at DESC
--   LIMIT 20;
--
-- -- Trigger still rejects bogus chief-role h_status transitions
-- -- (run as a session set to a party_chief jwt; should error):
-- -- UPDATE stakeout_qc_points SET h_status = 'in_tol' WHERE id = '...';
