-- ================================================================
-- Migration 06: Crew unavailability (PTO blocking)
-- ================================================================
-- Blocks the dispatch board from accepting drops on days when a crew
-- member is out (vacation, sick, training, conference, etc.). PMs can
-- mark days off either from the dispatch board (right-click a cell)
-- or from the Roster view's new Time Off section.
--
-- Firm-scoped via the existing public.get_my_firm_id() helper, with
-- write access limited to owner/admin/pm via public.get_my_role().
-- Field crews can READ their firm's PTO (so the board shows blocked
-- days correctly in view-only mode) but cannot insert/update/delete.
-- ================================================================

create table if not exists public.crew_unavailability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  firm_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz default now(),
  created_by uuid references public.user_profiles(id),
  check (end_date >= start_date)
);

create index if not exists crew_unavailability_user_range_idx
  on public.crew_unavailability (user_id, start_date, end_date);

create index if not exists crew_unavailability_firm_start_idx
  on public.crew_unavailability (firm_id, start_date);

alter table public.crew_unavailability enable row level security;

-- READ: any firm member can see their firm's PTO rows
drop policy if exists "Firm members read crew unavailability" on public.crew_unavailability;
create policy "Firm members read crew unavailability"
  on public.crew_unavailability for select
  using (firm_id = public.get_my_firm_id());

-- WRITE: owner/admin/pm only
drop policy if exists "Office roles manage crew unavailability" on public.crew_unavailability;
create policy "Office roles manage crew unavailability"
  on public.crew_unavailability for all
  using (
    firm_id = public.get_my_firm_id()
    and public.get_my_role() in ('owner', 'admin', 'pm')
  )
  with check (
    firm_id = public.get_my_firm_id()
    and public.get_my_role() in ('owner', 'admin', 'pm')
  );

-- Enable realtime so the dispatch board receives postgres_changes events for this table.
-- New tables are NOT added to the supabase_realtime publication by default, so this is
-- required for the PTO popover's realtime subscription to actually fire across sessions.
-- Wrapped in DO block so it's safe to re-run (alter publication ... add ... errors if present).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crew_unavailability'
  ) then
    execute 'alter publication supabase_realtime add table public.crew_unavailability';
  end if;
end $$;
