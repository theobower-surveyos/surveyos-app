-- ================================================================
-- Migration 11: Project review workflow
-- ================================================================
-- Adds `reviewed_at` so the PM can sign off on a completed project
-- and move it out of the Ready-for-Review queue.
--
-- Drives three UI surfaces:
--   1) Morning Brief "Ready for Review" section shows any project
--      where completed_at is set and reviewed_at is null (or older
--      than completed_at — re-completed after edits).
--   2) Command Center Project Queue segmented control splits by
--      status into Active / Review / Done.
--   3) Completed-but-not-reviewed projects stay visible on the
--      Dispatch Board as muted cards for the rest of the day.
-- ================================================================

alter table public.projects
  add column if not exists reviewed_at timestamptz;

-- Partial index speeds up the "review queue" query:
--   where completed_at is not null and reviewed_at is null
create index if not exists projects_review_queue_idx
  on public.projects (completed_at desc)
  where completed_at is not null and reviewed_at is null;
