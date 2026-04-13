-- ================================================================
-- Migration 10: Notes column + time tracking + project-photos RLS
-- ================================================================
-- Fixes two blocking bugs and enables two new features:
--
-- 1) Notes save fails with "could not find the 'notes' column of
--    'projects' in the schema cache" — the column was never created.
--    Add it.
--
-- 2) Photo uploads to the 'project-photos' storage bucket silently
--    fail because the bucket has no RLS policies for INSERT. Add
--    policies mirroring migration 05's project-vault setup.
--
-- 3) Secret time tracking: started_at / completed_at timestamps
--    captured when field crews tap Start Work / Mark Complete. Not
--    exposed in the field crew UI. PMs see them via a Field Log
--    section in the drawer.
--
-- 4) PM visibility is handled by existing RLS — office roles can
--    read all firm projects, including the new columns.
-- ================================================================

-- ─── PART A: schema additions on projects ─────────────────────
alter table public.projects
  add column if not exists notes text;

alter table public.projects
  add column if not exists started_at timestamptz;

alter table public.projects
  add column if not exists completed_at timestamptz;

-- ─── PART B: ensure project-photos storage bucket exists ──────
-- Safe to re-run. If the bucket was created via the dashboard, the
-- ON CONFLICT clause makes this a no-op. If it was never created,
-- this creates it with a 50MB per-file limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-photos', 'project-photos', true, 52428800)
on conflict (id) do nothing;

-- ─── PART C: RLS policies for project-photos bucket ───────────
-- Mirrors the project-vault policy structure from migration 05 but
-- scoped to project-photos. Field crews can upload photos to any
-- project in their firm (gating by assignment is too tight — a crew
-- may need to drop a photo for a project they're helping with).

-- SELECT: any authenticated firm member can read photos for their firm's projects
drop policy if exists "Firm members can read project photos" on storage.objects;
create policy "Firm members can read project photos"
  on storage.objects for select
  using (
    bucket_id = 'project-photos'
    and auth.uid() is not null
    and exists (
      select 1 from public.projects p
      where p.id::text = (string_to_array(name, '/'))[1]
        and p.firm_id = public.get_my_firm_id()
    )
  );

-- INSERT: any authenticated firm member can upload to their firm's projects
drop policy if exists "Firm members can upload project photos" on storage.objects;
create policy "Firm members can upload project photos"
  on storage.objects for insert
  with check (
    bucket_id = 'project-photos'
    and auth.uid() is not null
    and exists (
      select 1 from public.projects p
      where p.id::text = (string_to_array(name, '/'))[1]
        and p.firm_id = public.get_my_firm_id()
    )
  );

-- UPDATE: office roles only (for overwrites)
drop policy if exists "Office roles can update project photos" on storage.objects;
create policy "Office roles can update project photos"
  on storage.objects for update
  using (
    bucket_id = 'project-photos'
    and auth.uid() is not null
    and public.get_my_role() in ('owner', 'admin', 'pm')
    and exists (
      select 1 from public.projects p
      where p.id::text = (string_to_array(name, '/'))[1]
        and p.firm_id = public.get_my_firm_id()
    )
  );

-- DELETE: office roles only
drop policy if exists "Office roles can delete project photos" on storage.objects;
create policy "Office roles can delete project photos"
  on storage.objects for delete
  using (
    bucket_id = 'project-photos'
    and auth.uid() is not null
    and public.get_my_role() in ('owner', 'admin', 'pm')
    and exists (
      select 1 from public.projects p
      where p.id::text = (string_to_array(name, '/'))[1]
        and p.firm_id = public.get_my_firm_id()
    )
  );
