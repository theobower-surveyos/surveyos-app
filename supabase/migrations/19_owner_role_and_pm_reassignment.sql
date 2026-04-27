-- ================================================================
-- SurveyOS Migration 19: Promote theo to owner + reassign demo
-- projects to Maynard for Licensed PM dashboard testing
-- ================================================================
-- Stage 12.1 introduces the Licensed PM persona (role='pm') with a
-- dedicated dashboard scoped to projects.assigned_to = current_user.
-- This migration sets up the two pieces of test data needed:
--
--   1. Bump theo@surveyos.com to role='owner' so the firm-wide
--      CommandCenter view continues to work for the developer
--      account independent of the PM dashboard. The 'owner' value
--      is already in the valid_role CHECK constraint defined by
--      migration 04 — no schema change is needed here.
--
--   2. Re-point four demo projects at Maynard
--      (id 011aca40-d16b-426a-accf-f33f6d312c5d, role='pm'). Their
--      assigned_to currently points at Andrew (a field_crew
--      account), which is semantically wrong: assigned_to is meant
--      to be the Licensed PM responsible for the project, not a
--      crew member. With the dashboard scoped on assigned_to,
--      Maynard now sees a meaningful "My Projects" list when she
--      signs in.
--
-- Also tightens the assigned_to column comment so future PMs see
-- the canonical meaning at a glance.
--
-- User applies via Supabase SQL Editor.
-- ================================================================

BEGIN;

-- ── 1. PROMOTE theo TO OWNER ────────────────────────────────────
UPDATE public.user_profiles
SET role = 'owner'
WHERE email = 'theo@surveyos.com';

-- ── 2. REASSIGN DEMO PROJECTS ───────────────────────────────────
-- Only update rows that are currently pointed at Andrew. Filtering
-- on assigned_to keeps the migration idempotent — re-running won't
-- silently steal a project that someone has since reassigned.
UPDATE public.projects
SET assigned_to = '011aca40-d16b-426a-accf-f33f6d312c5d'
WHERE project_name IN ('400 4th Ave S', 'Loma Rd', 'DISP3', 'DISP TEST2')
  AND assigned_to = 'e0a7514f-43fe-46a0-8046-2698dcbae744';

-- ── 3. CANONICAL DOCUMENTATION ──────────────────────────────────
COMMENT ON COLUMN public.projects.assigned_to IS
    'The Licensed PM (user_profiles.id, role=pm) responsible for this project. NULL for unassigned/firm-wide projects.';

COMMIT;


-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================
-- SELECT role, COUNT(*) FROM public.user_profiles GROUP BY role;
-- Expected: owner=1, pm=4, party_chief=1, field_crew=3 (and any
-- legacy cad/drafter/technician rows untouched).
--
-- SELECT project_name, assigned_to, status
-- FROM public.projects
-- WHERE assigned_to = '011aca40-d16b-426a-accf-f33f6d312c5d';
-- Expected: 400 4th Ave S, Loma Rd, DISP3, DISP TEST2.
