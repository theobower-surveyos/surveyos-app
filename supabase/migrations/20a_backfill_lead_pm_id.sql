-- ================================================================
-- SurveyOS Migration 20a: Backfill lead_pm_id and restore Party
-- Chief semantics on assigned_to (reverses Migration 19's data move)
-- ================================================================
-- Migration 19 set `assigned_to = Maynard.id` on four demo projects
-- on the assumption that `assigned_to` was the Licensed PM column.
-- The 2026-04-28 audit corrected that: `assigned_to` is the Party
-- Chief; Licensed PM ownership belongs on `lead_pm_id` (added by
-- Migration 20).
--
-- Step 0 discovery for Stage 12.1.5 also surfaced a 5th misassigned
-- project (TEST_260402, assigned_to = theo / owner). theo is the firm
-- owner, not a field-eligible role; setting `assigned_to = NULL` and
-- moving theo to `lead_pm_id` matches the corrected semantic.
--
-- Idempotency: each UPDATE filters on the post-Migration-19 state, so
-- re-running this migration after a future reassignment is a no-op.
--
-- This migration applied directly to production via `supabase db
-- query --linked` on 2026-04-28; the file is committed as the
-- canonical record of what was changed in the database.
-- ================================================================

BEGIN;

-- ── 1. RESTORE PARTY CHIEF SEMANTICS ON THE 4 MIGRATION-19 PROJECTS ──
-- assigned_to: back to Andrew (field_crew, original chief in pre-19 state)
-- lead_pm_id: forward to Maynard (pm, Licensed PM owner)
-- Filter: only rows still pointed at Maynard via assigned_to.
UPDATE public.projects
SET lead_pm_id  = '011aca40-d16b-426a-accf-f33f6d312c5d',  -- Maynard, pm
    assigned_to = 'e0a7514f-43fe-46a0-8046-2698dcbae744'   -- Andrew, field_crew
WHERE assigned_to = '011aca40-d16b-426a-accf-f33f6d312c5d';

-- ── 2. CORRECT TEST_260402 (5th misassigned project) ───────────────
-- TEST_260402 had `assigned_to = theo (owner)` — owner is not a Party
-- Chief role. Move theo to `lead_pm_id` and clear `assigned_to`.
-- Filter on the project id AND the specific user id so this is a no-op
-- if the row has since been reassigned.
UPDATE public.projects
SET lead_pm_id  = 'bb5310da-2a18-463d-8b78-f680986942ea',  -- theo, owner
    assigned_to = NULL
WHERE id          = '97f3c8cd-d69d-473b-b4ef-35e4dbac66c3'
  AND assigned_to = 'bb5310da-2a18-463d-8b78-f680986942ea';

COMMIT;

-- ================================================================
-- VERIFICATION QUERY (manual)
-- ================================================================
-- SELECT p.project_name, p.assigned_to, ac.first_name AS chief, ac.role AS chief_role,
--        p.lead_pm_id, pm.first_name AS pm_name, pm.role AS pm_role
-- FROM projects p
-- LEFT JOIN user_profiles ac ON p.assigned_to = ac.id
-- LEFT JOIN user_profiles pm ON p.lead_pm_id  = pm.id
-- WHERE p.lead_pm_id IS NOT NULL OR p.assigned_to IS NOT NULL
-- ORDER BY p.project_name;
--
-- Expected: 4 ex-Maynard projects show chief=Andrew(field_crew),
-- pm=Maynard(pm); TEST_260402 shows chief=NULL, pm=theo(owner).
