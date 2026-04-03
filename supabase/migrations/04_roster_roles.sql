-- ================================================================
-- SurveyOS Migration 04: Roster & Role Enforcement
-- ================================================================
-- Ensures user_profiles handles all role types and adds a
-- CHECK constraint for data integrity.
-- Run AFTER migrations 01-03.
-- ================================================================

BEGIN;

-- Add columns if they don't exist yet (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS email       TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invited_by  UUID,
  ADD COLUMN IF NOT EXISTS invited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- Enforce valid roles via CHECK constraint
-- Drop if it exists first (safe re-run)
DO $$
BEGIN
  ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS valid_role;
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT valid_role CHECK (
      role IN ('owner', 'admin', 'pm', 'party_chief', 'field_crew', 'cad', 'drafter', 'technician')
    );
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Role constraint already exists or could not be added: %', SQLERRM;
END;
$$;

-- Backfill email from auth.users where missing
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND (up.email IS NULL OR up.email = '');

-- Index for active roster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_active
  ON public.user_profiles(firm_id, is_active)
  WHERE is_active = TRUE;

-- RLS: ensure owners/admins can deactivate team members
-- (This policy may already exist from migration 01, DROP IF EXISTS for safety)
DROP POLICY IF EXISTS "Owners and admins can update team members" ON public.user_profiles;
CREATE POLICY "Owners and admins can update team members"
  ON public.user_profiles FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- Ensure the firm_invitations table exists (for the invite flow)
-- This is a no-op if migration 01 already created it
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
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.firm_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins manage invitations" ON public.firm_invitations;
CREATE POLICY "Owners and admins manage invitations"
  ON public.firm_invitations FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "Anyone can read pending invitations" ON public.firm_invitations;
CREATE POLICY "Anyone can read pending invitations"
  ON public.firm_invitations FOR SELECT
  USING (status = 'pending' AND expires_at > now());

COMMIT;
