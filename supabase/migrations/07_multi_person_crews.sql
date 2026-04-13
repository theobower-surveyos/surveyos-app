-- ================================================================
-- Migration 07: Multi-person crews + RLS hygiene fix
-- ================================================================
-- Two changes bundled:
--
-- 1) projects.assigned_crew : text  →  uuid[]
--    A survey crew is usually 2–3 people (party chief + rod/helpers).
--    The existing text column stored a single legacy name. We migrate
--    it to a uuid[] of user_profiles.id so the board can show an avatar
--    stack per card and field crews can see projects where they're in
--    the supporting role (not just the lead).
--
--    Backfill is best-effort: for each project, match the existing
--    first_name substring against user_profiles.first_name within the
--    same firm. Rows that don't match land at '{}' — PMs review them.
--
-- 2) RLS hygiene fix on `projects` and `survey_points`.
--    The existing RLS clauses reference (assigned_to->>'id')::text
--    against a column that is actually a plain uuid. Those clauses are
--    silently inert and field crews currently see nothing via the
--    assigned_to filter. We replace them with:
--        assigned_to = auth.uid() OR auth.uid() = ANY(assigned_crew)
--    Field crews will start seeing projects assigned to them via either
--    the lead uuid or the supporting crew array. This is the correct
--    behavior and the user has explicitly accepted this visible change.
-- ================================================================

-- ─── PART A: text → uuid[] migration with best-effort backfill ────
do $$
declare
  col_type text;
begin
  select udt_name into col_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and column_name = 'assigned_crew';

  -- Only migrate if the column is still the legacy text type.
  if col_type = 'text' then
    alter table public.projects add column if not exists assigned_crew_new uuid[] default '{}'::uuid[];

    update public.projects p
    set assigned_crew_new = coalesce((
      select array_agg(up.id)
      from public.user_profiles up
      where up.firm_id = p.firm_id
        and p.assigned_crew is not null
        and p.assigned_crew <> ''
        and p.assigned_crew ilike '%' || up.first_name || '%'
    ), '{}'::uuid[])
    where p.assigned_crew is not null;

    alter table public.projects drop column assigned_crew;
    alter table public.projects rename column assigned_crew_new to assigned_crew;
  end if;

  -- Ensure the final column exists as uuid[] with a default, regardless
  -- of whether the block above ran (safe re-run guard).
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'assigned_crew'
  ) then
    alter table public.projects add column assigned_crew uuid[] default '{}'::uuid[];
  end if;
end $$;

-- A GIN index makes `auth.uid() = any(assigned_crew)` cheap for RLS.
create index if not exists projects_assigned_crew_gin_idx
  on public.projects using gin (assigned_crew);

-- ─── PART B: RLS hygiene fix ──────────────────────────────────────
-- Replace the broken (assigned_to->>'id')::text clauses with proper
-- uuid equality + array membership.

drop policy if exists "Field roles read assigned projects only" on public.projects;
create policy "Field roles read assigned projects only"
  on public.projects for select
  using (
    firm_id = public.get_my_firm_id()
    and public.get_my_role() in ('field_crew', 'party_chief', 'cad', 'drafter', 'technician')
    and (
      assigned_to = auth.uid()
      or auth.uid() = any(assigned_crew)
    )
  );

drop policy if exists "Field crew can update assigned projects" on public.projects;
create policy "Field crew can update assigned projects"
  on public.projects for update
  using (
    firm_id = public.get_my_firm_id()
    and public.get_my_role() in ('field_crew', 'party_chief')
    and (
      assigned_to = auth.uid()
      or auth.uid() = any(assigned_crew)
    )
  );

-- survey_points INSERT also references the broken assigned_to shape.
drop policy if exists "Authorized users can insert points" on public.survey_points;
create policy "Authorized users can insert points"
  on public.survey_points for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = survey_points.project_id
        and p.firm_id = public.get_my_firm_id()
        and (
          public.get_my_role() in ('owner', 'admin', 'pm')
          or p.assigned_to = auth.uid()
          or auth.uid() = any(p.assigned_crew)
        )
    )
  );
