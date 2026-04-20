-- ================================================================
-- SurveyOS Migration 14: Reconciliation note on assignments
-- ================================================================
-- Follow-up to migration 13. Adds a single nullable TEXT column to
-- stakeout_assignments so PMs can attach a written note at the moment
-- they flip status → reconciled. Captures things like "crew reported
-- two field-fit stakes due to utility conflict; OK to proceed" that
-- don't fit the per-point field_fit_note surface.
--
-- The note is displayed on AssignmentDetail and included in the
-- report export metadata. No RLS changes — inherits the existing
-- stakeout_assignments policies from migration 12.
-- ================================================================

BEGIN;

ALTER TABLE public.stakeout_assignments
    ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;

-- ================================================================
-- VERIFICATION (uncomment to check after apply)
-- ================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_assignments'
--     AND column_name = 'reconciliation_note';

COMMIT;
