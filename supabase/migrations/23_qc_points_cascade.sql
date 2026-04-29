-- ================================================================
-- SurveyOS Migration 23: QC point cleanup on assignment_point delete
-- ================================================================
-- Bug context (Stage 7b.1, journal):
--   PM "edit points" workflow deletes rows from
--   stakeout_assignment_points to remove a design point from an
--   assignment. Existing FK on stakeout_qc_points uses ON DELETE
--   SET NULL for design_point_id, so the qc_points row survives
--   with a nullified design reference. The result is a stale
--   qc_point row pointing at no design intent — a real bug noted
--   in the 2026-04-28 audit.
--
-- Step 0.9 confirmed there is NO direct FK between
-- stakeout_qc_points and stakeout_assignment_points. The link is
-- a composite (assignment_id + design_point_id) — so a CASCADE
-- via FK is not available. Migration 23 uses an AFTER DELETE
-- trigger on stakeout_assignment_points instead.
--
-- Decision (per prompt 5.2): clean deletion. The edit-points
-- workflow treats this as "redo this assignment"; preserving stale
-- qc_points across point removal would mislead the QC scoreboard.
--
-- Scope: matches qc_points by `assignment_id = OLD.assignment_id
-- AND design_point_id = OLD.design_point_id`. Line-stake-between
-- qc_points where the deleted point sits in `design_point_id_b`
-- continue to use the existing SET NULL FK action — they're
-- preserved in a half-defined state rather than removed, which is
-- acceptable for the rare line-stake edge case and avoids a wider
-- scope expansion. If line-stake B-end orphans become a problem,
-- expand the trigger in a follow-up.
-- ================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cleanup_qc_points_on_assignment_point_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.stakeout_qc_points
    WHERE assignment_id    = OLD.assignment_id
      AND design_point_id  = OLD.design_point_id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_qc_points_after_assignment_point_delete
    ON public.stakeout_assignment_points;

CREATE TRIGGER cleanup_qc_points_after_assignment_point_delete
    AFTER DELETE ON public.stakeout_assignment_points
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_qc_points_on_assignment_point_delete();

COMMIT;

-- ================================================================
-- VERIFICATION (manual — destructive on a non-critical test row)
-- ================================================================
-- 1. Pick a non-critical assignment with qc_points (NOT
--    8.5A_TESTING). Step 0 surfaced two `StakeoutTest` candidates:
--    b332b841-0ad1-4de7-bb8f-6ca155f11563 (6 asgn_pts, 6 qc_pts)
--    d7c0a52c-7cc5-4900-bfc7-01cda7889510 (4 asgn_pts, 4 qc_pts).
--
-- 2. Snapshot:
--    SELECT count(*) FROM stakeout_qc_points
--    WHERE assignment_id = '<test_assignment_uuid>';
--    SELECT count(*) FROM stakeout_assignment_points
--    WHERE assignment_id = '<test_assignment_uuid>';
--
-- 3. Pick one assignment_point and capture its design_point_id:
--    SELECT id, design_point_id FROM stakeout_assignment_points
--    WHERE assignment_id = '<test_assignment_uuid>' LIMIT 1;
--
-- 4. Delete it:
--    DELETE FROM stakeout_assignment_points WHERE id = '<id>';
--
-- 5. Confirm the corresponding qc_points were removed:
--    SELECT count(*) FROM stakeout_qc_points
--    WHERE assignment_id = '<test_assignment_uuid>'
--      AND design_point_id = '<captured_design_point_id>';
--    Expected: 0.
