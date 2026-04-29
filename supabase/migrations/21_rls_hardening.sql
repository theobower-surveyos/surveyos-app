-- ================================================================
-- SurveyOS Migration 21: RLS hardening — projects + user_profiles + views
-- ================================================================
-- Pre-pilot security must-fix from the 2026-04-28 audit.
--
-- Step 0 discovery for Stage 12.1.5 surfaced four facts that shape
-- this migration:
--
-- 1. RLS is OFF on `projects` and `user_profiles` — even though both
--    tables already have policies attached. Existing policies are
--    inert until the table is enabled.
-- 2. Both tables carry a sandbox-permissive policy that would render
--    RLS useless if simply enabled:
--       projects:       "Sandbox Master Projects"          qual = true
--       user_profiles:  "Sandbox Master Profile Policy"    qual = (auth.role() = 'authenticated')
--    These must be dropped before/at the same time as enabling RLS.
-- 3. `firms`, `crew_unavailability`, and `permissions` are already
--    RLS-enabled with non-permissive policies (verified post-step-3
--    via pg_policies). Migration 21 does not touch them.
--    `permissions` is the global RBAC matrix and has no `firm_id`
--    column — its existing "any authenticated user can read" policy
--    is correct.
-- 4. The prompt called for a new `user_firm_id()` SECURITY DEFINER
--    helper to avoid recursive RLS when user_profiles policies
--    reference user_profiles. The existing `public.get_my_firm_id()`
--    (defined in Migration 01) is already SECURITY DEFINER with
--    search_path locked — function calls bypass RLS during execution,
--    so no recursion occurs. Skipping the duplicate helper; using
--    the existing one keeps consistency with migrations 04, 06, 12.
--
-- Field-role chief-scoping is preserved by leaving the two existing
-- policies in place:
--   "Field crew can update assigned projects" — chief UPDATE if
--     assigned_to = auth.uid() OR in assigned_crew
--   "Field roles read firm projects"          — field-role SELECT
--     scoped to assigned/null-assigned rows
-- A new office-role policy adds INSERT/SELECT/UPDATE/DELETE for
-- owner/admin/pm without weakening the chief-scoped restrictions.
-- ================================================================

BEGIN;

-- ── 1. DROP SANDBOX-PERMISSIVE POLICIES ─────────────────────────
DROP POLICY IF EXISTS "Sandbox Master Projects"        ON public.projects;
DROP POLICY IF EXISTS "Sandbox Master Profile Policy"  ON public.user_profiles;

-- ── 2. DROP LEGACY POLICIES THAT USE INLINE user_profiles SUBQUERIES ──
-- These predate the get_my_firm_id() helper and re-implement the
-- same firm-scoping inline. Replaced by the new office-role policy
-- (projects) and the firm-mates SELECT policy (user_profiles).
DROP POLICY IF EXISTS "Firm isolated projects"          ON public.projects;
DROP POLICY IF EXISTS "Firm members can view colleagues" ON public.user_profiles;

-- ── 3. PROJECTS — OFFICE-ROLE FULL ACCESS ──────────────────────────
-- owner/admin/pm get firm-scoped CRUD on projects. Field-role chief
-- access is preserved by the existing "Field crew can update assigned
-- projects" + "Field roles read firm projects" policies (kept as-is).
DROP POLICY IF EXISTS "Office roles manage firm projects" ON public.projects;
CREATE POLICY "Office roles manage firm projects"
  ON public.projects
  FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  )
  WITH CHECK (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- ── 4. USER_PROFILES — FIRM MATES READ ─────────────────────────────
-- Existing self-policies are kept:
--   "Users can view own profile"   (SELECT, id = auth.uid())
--   "Users can update own profile" (UPDATE, id = auth.uid())
-- Add: any firm member may read other profiles in their firm.
DROP POLICY IF EXISTS "Firm mates read profiles" ON public.user_profiles;
CREATE POLICY "Firm mates read profiles"
  ON public.user_profiles
  FOR SELECT
  USING (firm_id = public.get_my_firm_id());

-- INSERT and DELETE on user_profiles intentionally have no policy —
-- only the service role (used by the auth/provisioning backend) may
-- create or delete profile rows. Authenticated users with no
-- matching policy get DENIED on those operations once RLS is enabled.

-- ── 5. ENABLE RLS ──────────────────────────────────────────────────
ALTER TABLE public.projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ── 6. VIEWS — SECURITY INVOKER ───────────────────────────────────
-- Postgres 17.6 (verified Step 0.3) supports security_invoker on
-- views. Without this, views run as the view owner (postgres) and
-- bypass the underlying-table RLS — a cross-firm leak vector.
ALTER VIEW public.crew_utilization    SET (security_invoker = true);
ALTER VIEW public.stakeout_qc_summary SET (security_invoker = true);

COMMIT;

-- ================================================================
-- VERIFICATION (manual)
-- ================================================================
-- 1. Sandbox policies gone:
--    SELECT policyname FROM pg_policies
--    WHERE schemaname = 'public' AND policyname ILIKE 'Sandbox Master%';
--    Expected: 0 rows.
--
-- 2. RLS active:
--    SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN ('projects', 'user_profiles');
--    Expected: rowsecurity = true on both.
--
-- 3. Existing firm/crew_unavailability policies confirmed firm-scoped:
--    SELECT policyname, qual FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('firms', 'crew_unavailability')
--    ORDER BY tablename, policyname;
--    Expected: every qual references get_my_firm_id() or
--    get_my_role() — no `qual = true` and no `auth.role()` checks.
--
-- 4. View security:
--    SELECT relname, reloptions FROM pg_class
--    WHERE relname IN ('crew_utilization', 'stakeout_qc_summary');
--    Expected: reloptions includes 'security_invoker=true'.
--
-- 5. Cross-firm leak smoke test:
--    Log into the UI as a user from one firm; try to fetch a project
--    from another firm by id. Should return zero rows / 404.
--
-- 6. Edge Function regression: trigger generate-qc-narrative from the
--    chief UI. Edge Functions use service role and bypass RLS, so the
--    narrative should still generate (~40s end-to-end).
