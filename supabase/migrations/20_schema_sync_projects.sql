-- ================================================================
-- SurveyOS Migration 20: Schema sync for `projects` and stitch-prep
-- ================================================================
-- Captures schema drift on `projects` (~23 columns added directly to
-- production over time without an accompanying migration), introduces
-- the new columns Stage 12.1.5 needs (`lead_pm_id`, `address`,
-- `priority`, project-level client contact), adds `pm_site_notes` on
-- stakeout_assignments, and folds in the 2 columns of drift on
-- user_profiles (text[] arrays).
--
-- Also reverses Migration 19's column comment: `projects.assigned_to`
-- is the Party Chief, NOT the Licensed PM. Licensed PM ownership now
-- lives on `lead_pm_id`. The 2026-04-28 audit found that 19's
-- repurpose collided with how DispatchBoard, DeploymentModal, and
-- DispatchProjectDrawer all use `assigned_to`.
--
-- All ADD COLUMN statements are IF NOT EXISTS so this migration is
-- safe to apply against the existing production database (existing
-- columns are no-ops; types/defaults are not altered).
--
-- Equipment table-level drift is intentionally deferred to Stage 14
-- (planned bigint→uuid + assigned_to text→uuid cleanup).
-- ================================================================

BEGIN;

-- ── 1. PROJECTS DRIFT CAPTURE ──────────────────────────────────────
-- Columns present in production schema that no prior migration
-- declares. Types and defaults match the production definitions
-- exactly (verified via information_schema on 2026-04-28) so a fresh
-- DB rebuilt from migrations matches the production shape.
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS client_name        text             DEFAULT 'Internal',
    ADD COLUMN IF NOT EXISTS budget_allocated   numeric          DEFAULT 0,
    ADD COLUMN IF NOT EXISTS budget_spent       numeric          DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hours_estimated    numeric          DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hours_actual       numeric          DEFAULT 0,
    ADD COLUMN IF NOT EXISTS crew_name          text             DEFAULT '',
    ADD COLUMN IF NOT EXISTS scheduled_day      text             DEFAULT '',
    ADD COLUMN IF NOT EXISTS started_at         timestamptz,
    ADD COLUMN IF NOT EXISTS completed_at       timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_at        timestamptz,
    ADD COLUMN IF NOT EXISTS assigned_crew      uuid[]           DEFAULT '{}'::uuid[],
    ADD COLUMN IF NOT EXISTS scheduled_end_date date,
    ADD COLUMN IF NOT EXISTS notes              text,
    ADD COLUMN IF NOT EXISTS location           text             DEFAULT '',
    ADD COLUMN IF NOT EXISTS hide_financials    boolean,
    ADD COLUMN IF NOT EXISTS scope_checklist    jsonb            DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS scope              jsonb            DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS actual_start_time  timestamptz,
    ADD COLUMN IF NOT EXISTS actual_end_time    timestamptz,
    ADD COLUMN IF NOT EXISTS invoice_status     text             DEFAULT 'unbilled',
    ADD COLUMN IF NOT EXISTS invoice_amount     numeric          DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS fee_type           text,
    ADD COLUMN IF NOT EXISTS required_equipment jsonb;

-- ── 2. PROJECTS NEW COLUMNS ────────────────────────────────────────
-- Stage 12.1.5 adds Licensed PM ownership, project address, priority
-- (DeploymentModal sends this; it was being silently dropped), and
-- project-level client contact for surfacing on chief assignment
-- detail via the assignment→project join.
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS lead_pm_id            uuid REFERENCES public.user_profiles(id),
    ADD COLUMN IF NOT EXISTS address               text,
    ADD COLUMN IF NOT EXISTS priority              text DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS client_contact_name   text,
    ADD COLUMN IF NOT EXISTS client_contact_phone  text;

-- ── 3. STAKEOUT_ASSIGNMENTS NEW COLUMN ─────────────────────────────
-- PM-authored notes shown to the chief on the assignment detail
-- screen. Distinct from `chief_field_notes` which is chief-authored.
ALTER TABLE public.stakeout_assignments
    ADD COLUMN IF NOT EXISTS pm_site_notes text;

-- ── 4. USER_PROFILES DRIFT CAPTURE ─────────────────────────────────
-- Two arrays added directly to production (not in any migration).
-- Below the >3-column drift threshold but trivial to fold in.
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS certifications     text[] DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS assigned_equipment text[] DEFAULT '{}'::text[];

-- ── 5. COLUMN COMMENTS (CANONICAL DOCUMENTATION) ───────────────────
-- Reverses Migration 19's `assigned_to` comment. The 2026-04-28 audit
-- confirmed `assigned_to` is the Party Chief in DispatchBoard,
-- DeploymentModal, and DispatchProjectDrawer. Licensed PM ownership
-- lives on `lead_pm_id`.
COMMENT ON COLUMN public.projects.assigned_to IS
    'Party Chief assigned to project. NOT the Licensed PM. See lead_pm_id for PM ownership.';

COMMENT ON COLUMN public.projects.lead_pm_id IS
    'Licensed PM who owns the client relationship and project deliverables.';

COMMENT ON COLUMN public.projects.client_contact_name IS
    'Primary client-side point of contact name. Surfaced in chief assignment detail via the assignment→project join.';

COMMENT ON COLUMN public.projects.client_contact_phone IS
    'Primary client-side point of contact phone. Surfaced in chief assignment detail for field calls.';

COMMENT ON COLUMN public.stakeout_assignments.pm_site_notes IS
    'PM-authored site notes shown to chief on assignment detail. Distinct from chief_field_notes which is chief-authored.';

-- Note: stakeout_assignments.client_contact_name and client_contact_phone
-- (added in Migration 13) are now considered DEPRECATED in favor of the
-- project-level columns added above. Stage 13 or 14 will migrate any
-- assignment-level data up to the project and drop the assignment columns.

COMMIT;

-- ================================================================
-- VERIFICATION QUERIES (manual)
-- ================================================================
-- SELECT column_name, data_type, col_description('public.projects'::regclass, ordinal_position)
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'projects'
--   AND column_name IN ('assigned_to', 'lead_pm_id', 'client_contact_name',
--                       'client_contact_phone', 'priority', 'address');
--
-- SELECT column_name, col_description('public.stakeout_assignments'::regclass, ordinal_position)
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'stakeout_assignments'
--   AND column_name = 'pm_site_notes';
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'user_profiles'
--   AND column_name IN ('certifications', 'assigned_equipment');
