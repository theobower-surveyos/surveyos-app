-- ================================================================
-- SurveyOS Migration 05: Project Vault Storage Bucket & RLS
-- ================================================================
-- Creates a secure storage bucket for project documents (deeds,
-- control sheets, DWG exports, etc.) with firm-scoped RLS.
--
-- Files are stored at: project-vault/{project_id}/{filename}
--
-- IMPORTANT: Storage bucket creation must be done via Supabase
-- Dashboard or the Management API — it cannot be done via SQL.
-- Run the bucket creation step in the Dashboard first, then
-- apply the RLS policies below.
-- ================================================================

-- ================================================================
-- STEP 1: CREATE THE BUCKET (run in Supabase Dashboard)
-- ================================================================
-- Go to: Supabase Dashboard → Storage → New Bucket
--   Name: project-vault
--   Public: false (private bucket — access via signed URLs or RLS)
--   File size limit: 50MB
--   Allowed MIME types: (leave blank for all, or restrict to):
--     application/pdf, image/*, text/csv, text/plain,
--     application/dxf, application/dwg, application/acad,
--     application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
--     application/vnd.openxmlformats-officedocument.wordprocessingml.document

-- Alternatively, via SQL (Supabase internal schema):
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-vault', 'project-vault', false, 52428800)
ON CONFLICT (id) DO NOTHING;


-- ================================================================
-- STEP 2: RLS POLICIES ON storage.objects
-- ================================================================
-- These policies scope file access to the project's firm_id.
-- The folder structure is: project-vault/{project_id}/{filename}
-- We extract the project_id from the path and verify firm membership.

-- Helper: extract project_id (first folder segment) from storage path
-- storage.objects.name = '{project_id}/{filename}'
-- We split on '/' and take the first segment.

-- ── SELECT (download/view) ──
-- Authenticated users can read files if they belong to the project's firm.
DROP POLICY IF EXISTS "Firm members can read vault files" ON storage.objects;
CREATE POLICY "Firm members can read vault files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-vault'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (string_to_array(name, '/'))[1]
        AND p.firm_id = public.get_my_firm_id()
    )
  );

-- ── INSERT (upload) ──
-- Authenticated users can upload to projects in their firm.
DROP POLICY IF EXISTS "Firm members can upload vault files" ON storage.objects;
CREATE POLICY "Firm members can upload vault files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-vault'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (string_to_array(name, '/'))[1]
        AND p.firm_id = public.get_my_firm_id()
    )
  );

-- ── UPDATE (overwrite/upsert) ──
-- Only office roles can overwrite existing files.
DROP POLICY IF EXISTS "Office roles can update vault files" ON storage.objects;
CREATE POLICY "Office roles can update vault files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-vault'
    AND auth.uid() IS NOT NULL
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (string_to_array(name, '/'))[1]
        AND p.firm_id = public.get_my_firm_id()
    )
  );

-- ── DELETE ──
-- Only office roles can delete files from the vault.
DROP POLICY IF EXISTS "Office roles can delete vault files" ON storage.objects;
CREATE POLICY "Office roles can delete vault files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-vault'
    AND auth.uid() IS NOT NULL
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (string_to_array(name, '/'))[1]
        AND p.firm_id = public.get_my_firm_id()
    )
  );
