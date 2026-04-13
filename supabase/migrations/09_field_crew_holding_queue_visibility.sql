-- ================================================================
-- Migration 09: Field crew visibility into the holding queue
-- ================================================================
-- Supabase Realtime evaluates RLS against the OLD row when delivering
-- UPDATE events. When a PM drags an unassigned project (assigned_to
-- NULL) onto a field crew's row, the OLD row has no assigned crew, so
-- the previous "Field roles read assigned projects only" policy
-- rejected it. That caused every dispatch-from-holding-queue event to
-- be silently dropped for field crews — the iPhone never lit up.
--
-- Fix: widen the SELECT policy to also allow reading firm projects
-- where assigned_to IS NULL. Field crews can now see their own firm's
-- holding queue as context, and realtime UPDATE events pass RLS on
-- both the old and new row versions, so delivery succeeds.
--
-- Scope stays locked to the firm via get_my_firm_id() — no cross-firm
-- leakage. Only unassigned (null) rows are newly visible. UPDATE/
-- INSERT/DELETE policies are unchanged — field crews still cannot
-- write to projects they are not assigned to.
-- ================================================================

drop policy if exists "Field roles read assigned projects only" on public.projects;
drop policy if exists "Field roles read firm projects" on public.projects;

create policy "Field roles read firm projects"
  on public.projects for select
  using (
    firm_id = public.get_my_firm_id()
    and public.get_my_role() in ('field_crew', 'party_chief', 'cad', 'drafter', 'technician')
    and (
      assigned_to = auth.uid()
      or auth.uid() = any(assigned_crew)
      or assigned_to is null
    )
  );
