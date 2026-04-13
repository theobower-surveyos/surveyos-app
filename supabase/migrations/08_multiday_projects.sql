-- ================================================================
-- Migration 08: Multi-day project spans
-- ================================================================
-- Boundary surveys, topos, and ALTAs typically take 2–5 days. Until
-- now every project occupied exactly one day cell. Adding a nullable
-- `scheduled_end_date` column lets a project span a range of days in
-- a single crew row.
--
-- Backward compatible: when scheduled_end_date IS NULL, the project
-- is a single-day job on scheduled_date (existing behavior). No data
-- migration needed — all existing rows remain single-day.
-- ================================================================

alter table public.projects
  add column if not exists scheduled_end_date date;

-- Consistency check: if end is set, it must be >= start.
-- Using a validated check rather than a NOT VALID constraint because
-- we know no existing rows have the column set (it was just added).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_scheduled_end_after_start'
  ) then
    alter table public.projects
      add constraint projects_scheduled_end_after_start
      check (scheduled_end_date is null or scheduled_date is null or scheduled_end_date >= scheduled_date);
  end if;
end $$;

-- Index for range queries. Dispatch board fetches projects per firm and
-- iterates, so this isn't performance-critical yet — but cheap and correct.
create index if not exists projects_scheduled_range_idx
  on public.projects (scheduled_date, scheduled_end_date);
