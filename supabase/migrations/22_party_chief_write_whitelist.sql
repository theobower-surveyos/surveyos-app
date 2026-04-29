-- ================================================================
-- SurveyOS Migration 22: Tighten chief write surface on stakeout_assignments
-- ================================================================
-- The existing "Field roles update own assignments" policy
-- (Migration 12) lets a party_chief or field_crew chief UPDATE
-- *any column* on their own assignments — far broader than the
-- product allows. Chiefs only need to set status + submitted_at +
-- chief_field_notes when submitting a QC run.
--
-- Step 0.4 confirmed there are no `party_chief` rows in
-- user_profiles in production today; the de-facto chief role is
-- `field_crew` (Andrew is the canonical example). This trigger
-- therefore fires for BOTH 'party_chief' and 'field_crew' so it
-- actually restricts the chiefs that exist in data — not just the
-- aspirational role from CLAUDE.md.
--
-- Service role and Supabase SQL Editor calls bypass this trigger
-- naturally: auth.uid() returns NULL in those contexts, the
-- role lookup yields NULL, and the IF block is skipped — so backend
-- jobs (Edge Functions, migrations, manual fixes) still work.
--
-- Whitelist: status, submitted_at, chief_field_notes.
-- Everything else: enumerate explicitly. 25 column checks below
-- (every column on stakeout_assignments after Migration 20 except
-- the 3 whitelisted).
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_party_chief_write_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role
    FROM public.user_profiles
    WHERE id = auth.uid();

    IF user_role IN ('party_chief', 'field_crew') THEN
        -- Enumerate every column except status, submitted_at, chief_field_notes.
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: id';
        END IF;
        IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: project_id';
        END IF;
        IF NEW.assignment_date IS DISTINCT FROM OLD.assignment_date THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: assignment_date';
        END IF;
        IF NEW.title IS DISTINCT FROM OLD.title THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: title';
        END IF;
        IF NEW.notes IS DISTINCT FROM OLD.notes THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: notes';
        END IF;
        IF NEW.default_offset_distance IS DISTINCT FROM OLD.default_offset_distance THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: default_offset_distance';
        END IF;
        IF NEW.default_offset_direction IS DISTINCT FROM OLD.default_offset_direction THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: default_offset_direction';
        END IF;
        IF NEW.default_stake_type IS DISTINCT FROM OLD.default_stake_type THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: default_stake_type';
        END IF;
        IF NEW.default_tolerance_h IS DISTINCT FROM OLD.default_tolerance_h THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: default_tolerance_h';
        END IF;
        IF NEW.default_tolerance_v IS DISTINCT FROM OLD.default_tolerance_v THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: default_tolerance_v';
        END IF;
        IF NEW.party_chief_id IS DISTINCT FROM OLD.party_chief_id THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: party_chief_id';
        END IF;
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: created_by';
        END IF;
        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: created_at';
        END IF;
        IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: updated_at';
        END IF;
        IF NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: sent_at';
        END IF;
        IF NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: reconciled_at';
        END IF;
        IF NEW.reconciled_by IS DISTINCT FROM OLD.reconciled_by THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: reconciled_by';
        END IF;
        IF NEW.expected_hours IS DISTINCT FROM OLD.expected_hours THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: expected_hours';
        END IF;
        IF NEW.client_contact_name IS DISTINCT FROM OLD.client_contact_name THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: client_contact_name';
        END IF;
        IF NEW.client_contact_phone IS DISTINCT FROM OLD.client_contact_phone THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: client_contact_phone';
        END IF;
        IF NEW.client_contact_role IS DISTINCT FROM OLD.client_contact_role THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: client_contact_role';
        END IF;
        IF NEW.client_contact_notes IS DISTINCT FROM OLD.client_contact_notes THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: client_contact_notes';
        END IF;
        IF NEW.reconciliation_note IS DISTINCT FROM OLD.reconciliation_note THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: reconciliation_note';
        END IF;
        IF NEW.scope_checklist IS DISTINCT FROM OLD.scope_checklist THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: scope_checklist';
        END IF;
        IF NEW.pm_site_notes IS DISTINCT FROM OLD.pm_site_notes THEN
            RAISE EXCEPTION 'party_chief/field_crew cannot modify column: pm_site_notes';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS party_chief_write_whitelist ON public.stakeout_assignments;

CREATE TRIGGER party_chief_write_whitelist
    BEFORE UPDATE ON public.stakeout_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_party_chief_write_whitelist();

COMMIT;

-- ================================================================
-- VERIFICATION
-- ================================================================
-- 1. Trigger present:
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.stakeout_assignments'::regclass
--      AND tgname = 'party_chief_write_whitelist';
--    Expected: 1 row.
--
-- 2. Function enumerates exactly the right columns:
--    SELECT count(*) FROM regexp_matches(
--      pg_get_functiondef('public.enforce_party_chief_write_whitelist'::regproc),
--      'IS DISTINCT FROM', 'g'
--    );
--    Expected: 25.
--
-- 3. UI regression — log in as Andrew (field_crew), submit a QC run.
--    status, submitted_at, chief_field_notes update should succeed.
--
-- 4. Write-block — log in as Andrew, attempt to UPDATE party_chief_id
--    or notes via a manual SQL call. Should RAISE EXCEPTION.
--    (Cannot test via Supabase SQL Editor directly — editor uses
--    service role and bypasses auth.uid(). Test via supabase-js
--    client in the browser console.)
