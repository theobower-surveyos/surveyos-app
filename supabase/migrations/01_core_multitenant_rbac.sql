-- ================================================================
-- SurveyOS Migration 01: Core Multi-Tenant Architecture & RBAC
-- ================================================================
-- Implements Pillar 2 from SurveyOS_Master_Architecture.md
--
-- Strategy: Row-Level Security on shared tables (not schema-per-tenant)
-- Roles: owner, admin, pm, party_chief, field_crew, cad, drafter, technician
--
-- IMPORTANT: Run this in a single transaction via Supabase SQL Editor
-- or `supabase db push`. Test on a staging project first.
-- ================================================================

BEGIN;

-- ================================================================
-- SECTION 1: EXPAND EXISTING TABLES (ADDITIVE, NON-BREAKING)
-- ================================================================

-- 1a. Expand firms table with business details and subscription info
-- (These columns may not exist yet; IF NOT EXISTS prevents errors)
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS slug            TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS license_number  TEXT,
  ADD COLUMN IF NOT EXISTS license_state   TEXT,
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS email           TEXT,
  ADD COLUMN IF NOT EXISTS address_line1   TEXT,
  ADD COLUMN IF NOT EXISTS address_city    TEXT,
  ADD COLUMN IF NOT EXISTS address_state   TEXT,
  ADD COLUMN IF NOT EXISTS address_zip     TEXT,
  ADD COLUMN IF NOT EXISTS subscription_tier   TEXT NOT NULL DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_prefix  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_next_seq INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_payment_terms INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS timezone        TEXT NOT NULL DEFAULT 'America/Phoenix',
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- 1b. Expand user_profiles with identity, status, and invitation tracking
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by  UUID,
  ADD COLUMN IF NOT EXISTS invited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill email from auth.users for existing profiles
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND up.email IS NULL;

-- Add indexes for firm-scoped lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_firm ON public.user_profiles(firm_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(firm_id, role);


-- ================================================================
-- SECTION 2: NEW TABLES
-- ================================================================

-- 2a. FIRM INVITATIONS — replaces the insecure "paste firm UUID" approach
CREATE TABLE IF NOT EXISTS public.firm_invitations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id     UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'field_crew',
    invite_code TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'pending',
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    accepted_by UUID,
    invited_by  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_invitation_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_invitations_code  ON public.firm_invitations(invite_code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_firm  ON public.firm_invitations(firm_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.firm_invitations(email);


-- 2b. SHARE TOKENS — secure, time-limited client portal access
CREATE TABLE IF NOT EXISTS public.share_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON public.share_tokens(token) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_share_tokens_project ON public.share_tokens(project_id);


-- 2c. PERMISSIONS — RBAC lookup table for documentation and future admin UI
CREATE TABLE IF NOT EXISTS public.permissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role       TEXT NOT NULL,
    resource   TEXT NOT NULL,
    action     TEXT NOT NULL,
    conditions JSONB DEFAULT '{}',

    UNIQUE(role, resource, action)
);


-- ================================================================
-- SECTION 3: SEED THE RBAC PERMISSION MATRIX
-- ================================================================
-- This is the authoritative source of truth for the access control model.
-- Application code and RLS policies are derived from this matrix.

INSERT INTO public.permissions (role, resource, action, conditions) VALUES
  -- ── FIRM OWNER ──
  ('owner', 'projects',       'create',  '{}'),
  ('owner', 'projects',       'read',    '{"scope": "firm"}'),
  ('owner', 'projects',       'update',  '{"scope": "firm"}'),
  ('owner', 'projects',       'delete',  '{"scope": "firm"}'),
  ('owner', 'survey_points',  'create',  '{"scope": "firm"}'),
  ('owner', 'survey_points',  'read',    '{"scope": "firm"}'),
  ('owner', 'invoices',       'create',  '{}'),
  ('owner', 'invoices',       'read',    '{"scope": "firm"}'),
  ('owner', 'invoices',       'update',  '{"scope": "firm"}'),
  ('owner', 'invoices',       'void',    '{"scope": "firm"}'),
  ('owner', 'team',           'invite',  '{}'),
  ('owner', 'team',           'read',    '{"scope": "firm"}'),
  ('owner', 'team',           'update',  '{"scope": "firm"}'),
  ('owner', 'team',           'deactivate', '{}'),
  ('owner', 'equipment',      'manage',  '{"scope": "firm"}'),
  ('owner', 'firm_settings',  'manage',  '{}'),
  ('owner', 'stripe_connect', 'manage',  '{}'),
  ('owner', 'morning_brief',  'read',    '{}'),
  ('owner', 'command_center', 'manage',  '{}'),

  -- ── ADMIN ──
  ('admin', 'projects',       'create',  '{}'),
  ('admin', 'projects',       'read',    '{"scope": "firm"}'),
  ('admin', 'projects',       'update',  '{"scope": "firm"}'),
  ('admin', 'projects',       'delete',  '{"scope": "firm"}'),
  ('admin', 'survey_points',  'create',  '{"scope": "firm"}'),
  ('admin', 'survey_points',  'read',    '{"scope": "firm"}'),
  ('admin', 'invoices',       'create',  '{}'),
  ('admin', 'invoices',       'read',    '{"scope": "firm"}'),
  ('admin', 'invoices',       'update',  '{"scope": "firm"}'),
  ('admin', 'invoices',       'void',    '{"scope": "firm"}'),
  ('admin', 'team',           'invite',  '{}'),
  ('admin', 'team',           'read',    '{"scope": "firm"}'),
  ('admin', 'team',           'update',  '{"scope": "firm"}'),
  ('admin', 'team',           'deactivate', '{}'),
  ('admin', 'equipment',      'manage',  '{"scope": "firm"}'),
  ('admin', 'firm_settings',  'manage',  '{}'),
  ('admin', 'stripe_connect', 'manage',  '{}'),
  ('admin', 'morning_brief',  'read',    '{}'),
  ('admin', 'command_center', 'manage',  '{}'),

  -- ── PROJECT MANAGER ──
  ('pm', 'projects',       'create',  '{}'),
  ('pm', 'projects',       'read',    '{"scope": "firm"}'),
  ('pm', 'projects',       'update',  '{"scope": "firm"}'),
  ('pm', 'projects',       'delete',  '{"scope": "firm"}'),
  ('pm', 'survey_points',  'create',  '{"scope": "firm"}'),
  ('pm', 'survey_points',  'read',    '{"scope": "firm"}'),
  ('pm', 'invoices',       'create',  '{}'),
  ('pm', 'invoices',       'read',    '{"scope": "firm"}'),
  ('pm', 'invoices',       'update',  '{"scope": "firm"}'),
  ('pm', 'team',           'read',    '{"scope": "firm"}'),
  ('pm', 'equipment',      'manage',  '{"scope": "firm"}'),
  ('pm', 'firm_settings',  'read',    '{}'),
  ('pm', 'morning_brief',  'read',    '{}'),
  ('pm', 'command_center', 'manage',  '{}'),

  -- ── PARTY CHIEF ──
  ('party_chief', 'projects',       'read',    '{"scope": "assigned"}'),
  ('party_chief', 'projects',       'update',  '{"scope": "assigned", "fields": ["status", "scope_checklist"]}'),
  ('party_chief', 'survey_points',  'create',  '{"scope": "assigned"}'),
  ('party_chief', 'survey_points',  'read',    '{"scope": "assigned"}'),
  ('party_chief', 'team',           'read',    '{"scope": "firm", "fields": ["first_name", "last_name"]}'),
  ('party_chief', 'equipment',      'read',    '{}'),

  -- ── FIELD CREW ──
  ('field_crew', 'projects',       'read',    '{"scope": "assigned"}'),
  ('field_crew', 'projects',       'update',  '{"scope": "assigned", "fields": ["status", "scope_checklist"]}'),
  ('field_crew', 'survey_points',  'create',  '{"scope": "assigned"}'),
  ('field_crew', 'survey_points',  'read',    '{"scope": "assigned"}'),
  ('field_crew', 'team',           'read',    '{"scope": "firm", "fields": ["first_name", "last_name"]}'),
  ('field_crew', 'equipment',      'read',    '{}'),

  -- ── CAD / DRAFTER ──
  ('cad', 'projects',       'read',    '{"scope": "assigned"}'),
  ('cad', 'projects',       'update',  '{"scope": "assigned", "fields": ["deliverables"]}'),
  ('cad', 'survey_points',  'read',    '{"scope": "assigned"}'),
  ('cad', 'team',           'read',    '{"scope": "firm", "fields": ["first_name", "last_name"]}'),

  -- ── DRAFTER (alias, same as CAD) ──
  ('drafter', 'projects',       'read',    '{"scope": "assigned"}'),
  ('drafter', 'projects',       'update',  '{"scope": "assigned", "fields": ["deliverables"]}'),
  ('drafter', 'survey_points',  'read',    '{"scope": "assigned"}'),
  ('drafter', 'team',           'read',    '{"scope": "firm", "fields": ["first_name", "last_name"]}'),

  -- ── TECHNICIAN ──
  ('technician', 'projects',       'read',    '{"scope": "assigned"}'),
  ('technician', 'survey_points',  'read',    '{"scope": "assigned"}'),
  ('technician', 'equipment',      'read',    '{}')

ON CONFLICT (role, resource, action) DO NOTHING;


-- ================================================================
-- SECTION 4: HELPER FUNCTIONS
-- ================================================================
-- These avoid repeated subqueries in every RLS policy.
-- SECURITY DEFINER ensures they run with elevated privileges
-- to read user_profiles even when RLS is active on that table.

CREATE OR REPLACE FUNCTION public.get_my_firm_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.user_profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;


-- ================================================================
-- SECTION 5: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ================================================================
-- Safe to call even if already enabled.

ALTER TABLE public.firms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_points     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_invitations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions       ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- SECTION 6: RLS POLICIES — FIRMS
-- ================================================================
-- Users can only see and modify their own firm.

DROP POLICY IF EXISTS "Users can read own firm" ON public.firms;
CREATE POLICY "Users can read own firm"
  ON public.firms FOR SELECT
  USING (id = public.get_my_firm_id());

DROP POLICY IF EXISTS "Owners and admins can update own firm" ON public.firms;
CREATE POLICY "Owners and admins can update own firm"
  ON public.firms FOR UPDATE
  USING (
    id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );


-- ================================================================
-- SECTION 7: RLS POLICIES — USER PROFILES
-- ================================================================

DROP POLICY IF EXISTS "Users can read own firm members" ON public.user_profiles;
CREATE POLICY "Users can read own firm members"
  ON public.user_profiles FOR SELECT
  USING (firm_id = public.get_my_firm_id());

DROP POLICY IF EXISTS "New users can insert own profile on signup" ON public.user_profiles;
CREATE POLICY "New users can insert own profile on signup"
  ON public.user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Owners and admins can update team members" ON public.user_profiles;
CREATE POLICY "Owners and admins can update team members"
  ON public.user_profiles FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );


-- ================================================================
-- SECTION 8: RLS POLICIES — PROJECTS
-- ================================================================
-- Office roles (owner, admin, pm) see all firm projects.
-- Field roles see only their assigned projects.
-- Anonymous users see projects via valid share tokens.

DROP POLICY IF EXISTS "Office roles read all firm projects" ON public.projects;
CREATE POLICY "Office roles read all firm projects"
  ON public.projects FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

DROP POLICY IF EXISTS "Field roles read assigned projects only" ON public.projects;
CREATE POLICY "Field roles read assigned projects only"
  ON public.projects FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('field_crew', 'party_chief', 'cad', 'drafter', 'technician')
    AND (
      -- assigned_to is a JSONB column with {id, name, ...} — check the id field
      (assigned_to->>'id')::text = auth.uid()::text
      -- Fallback: check assigned_crew text field for backward compat
      OR assigned_crew ILIKE '%' || (SELECT first_name FROM public.user_profiles WHERE id = auth.uid()) || '%'
    )
  );

DROP POLICY IF EXISTS "Anon can read shared projects" ON public.projects;
CREATE POLICY "Anon can read shared projects"
  ON public.projects FOR SELECT
  USING (
    auth.uid() IS NULL
    AND EXISTS (
      SELECT 1 FROM public.share_tokens st
      WHERE st.project_id = projects.id
        AND st.is_active = TRUE
        AND (st.expires_at IS NULL OR st.expires_at > now())
    )
  );

DROP POLICY IF EXISTS "Office roles can create projects" ON public.projects;
CREATE POLICY "Office roles can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

DROP POLICY IF EXISTS "Office roles can update projects" ON public.projects;
CREATE POLICY "Office roles can update projects"
  ON public.projects FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

DROP POLICY IF EXISTS "Field crew can update assigned projects" ON public.projects;
CREATE POLICY "Field crew can update assigned projects"
  ON public.projects FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('field_crew', 'party_chief')
    AND (assigned_to->>'id')::text = auth.uid()::text
  );

DROP POLICY IF EXISTS "Office roles can archive projects" ON public.projects;
CREATE POLICY "Office roles can archive projects"
  ON public.projects FOR DELETE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );


-- ================================================================
-- SECTION 9: RLS POLICIES — SURVEY POINTS
-- ================================================================
-- Points inherit access from their parent project.

DROP POLICY IF EXISTS "Users can read points for accessible projects" ON public.survey_points;
CREATE POLICY "Users can read points for accessible projects"
  ON public.survey_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = survey_points.project_id
        AND p.firm_id = public.get_my_firm_id()
    )
  );

DROP POLICY IF EXISTS "Anon can read points via share token" ON public.survey_points;
CREATE POLICY "Anon can read points via share token"
  ON public.survey_points FOR SELECT
  USING (
    auth.uid() IS NULL
    AND EXISTS (
      SELECT 1 FROM public.share_tokens st
      WHERE st.project_id = survey_points.project_id
        AND st.is_active = TRUE
        AND (st.expires_at IS NULL OR st.expires_at > now())
    )
  );

DROP POLICY IF EXISTS "Authorized users can insert points" ON public.survey_points;
CREATE POLICY "Authorized users can insert points"
  ON public.survey_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = survey_points.project_id
        AND p.firm_id = public.get_my_firm_id()
        AND (
          public.get_my_role() IN ('owner', 'admin', 'pm')
          OR (p.assigned_to->>'id')::text = auth.uid()::text
        )
    )
  );


-- ================================================================
-- SECTION 10: RLS POLICIES — EQUIPMENT
-- ================================================================

DROP POLICY IF EXISTS "Users can read firm equipment" ON public.equipment;
CREATE POLICY "Users can read firm equipment"
  ON public.equipment FOR SELECT
  USING (firm_id = public.get_my_firm_id());

DROP POLICY IF EXISTS "Office roles manage equipment" ON public.equipment;
CREATE POLICY "Office roles manage equipment"
  ON public.equipment FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- Field crew can update equipment status (check-out/check-in)
DROP POLICY IF EXISTS "Field crew can update equipment status" ON public.equipment;
CREATE POLICY "Field crew can update equipment status"
  ON public.equipment FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('field_crew', 'party_chief')
  );


-- ================================================================
-- SECTION 11: RLS POLICIES — FIRM INVITATIONS
-- ================================================================

DROP POLICY IF EXISTS "Owners and admins manage invitations" ON public.firm_invitations;
CREATE POLICY "Owners and admins manage invitations"
  ON public.firm_invitations FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- Anyone can read a pending, non-expired invitation (needed to accept it during sign-up)
DROP POLICY IF EXISTS "Anyone can read pending invitations" ON public.firm_invitations;
CREATE POLICY "Anyone can read pending invitations"
  ON public.firm_invitations FOR SELECT
  USING (
    status = 'pending'
    AND expires_at > now()
  );


-- ================================================================
-- SECTION 12: RLS POLICIES — SHARE TOKENS
-- ================================================================

DROP POLICY IF EXISTS "Office roles manage share tokens" ON public.share_tokens;
CREATE POLICY "Office roles manage share tokens"
  ON public.share_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = share_tokens.project_id
        AND p.firm_id = public.get_my_firm_id()
        AND public.get_my_role() IN ('owner', 'admin', 'pm')
    )
  );

-- Anon users can read active share tokens (needed for portal validation)
DROP POLICY IF EXISTS "Anon can validate share tokens" ON public.share_tokens;
CREATE POLICY "Anon can validate share tokens"
  ON public.share_tokens FOR SELECT
  USING (
    is_active = TRUE
    AND (expires_at IS NULL OR expires_at > now())
  );


-- ================================================================
-- SECTION 13: RLS POLICIES — PERMISSIONS TABLE
-- ================================================================
-- Read-only for authenticated users (reference table)

DROP POLICY IF EXISTS "Authenticated users can read permissions" ON public.permissions;
CREATE POLICY "Authenticated users can read permissions"
  ON public.permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ================================================================
-- SECTION 14: UTILITY — AUTO-UPDATE updated_at TRIGGER
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to all tables with an updated_at column
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND table_name IN ('firms', 'user_profiles', 'projects')
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I; ' ||
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I ' ||
      'FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;


-- ================================================================
-- SECTION 15: INVITE CODE GENERATOR FUNCTION
-- ================================================================
-- Generates human-readable invite codes: PREFIX-XXXXX

CREATE OR REPLACE FUNCTION public.generate_invite_code(p_firm_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  -- Get the firm's invoice prefix, or default to first 3 chars of name
  SELECT COALESCE(invoice_prefix, UPPER(LEFT(name, 3)))
  INTO v_prefix
  FROM public.firms
  WHERE id = p_firm_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'SOS';
  END IF;

  -- Generate unique 5-char alphanumeric code
  LOOP
    v_code := v_prefix || '-' || UPPER(SUBSTRING(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 5));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.firm_invitations WHERE invite_code = v_code
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique invite code after 10 attempts';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;


-- ================================================================
-- SECTION 16: VALIDATE SHARE TOKEN RPC
-- ================================================================
-- Called by the ClientPortal to securely load project data.
-- Returns project data only if the token is valid, active, and not expired.

CREATE OR REPLACE FUNCTION public.validate_share_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share RECORD;
  v_project RECORD;
BEGIN
  -- Find and validate the token
  SELECT * INTO v_share
  FROM public.share_tokens
  WHERE token = p_token
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired share link');
  END IF;

  -- Fetch the project
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = v_share.project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Project not found');
  END IF;

  RETURN jsonb_build_object(
    'project_id', v_project.id,
    'project_name', v_project.project_name,
    'status', v_project.status,
    'token_id', v_share.id,
    'valid', TRUE
  );
END;
$$;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify the migration:
--
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- SELECT table_name, row_security
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
--
-- SELECT * FROM public.permissions ORDER BY role, resource, action;

COMMIT;
