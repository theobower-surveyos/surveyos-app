-- ================================================================
-- SurveyOS Migration 24: Test data hygiene — archive sloppy fixtures
-- ================================================================
-- Stage 12.1.5 test-data cleanup. The dev firm
-- (bc486f63-3249-4587-94b6-2ab6f861b2a4) accumulated 18 projects
-- across exploratory builds; most are throwaways from earlier
-- stages and clutter dispatch + dashboard views.
--
-- Survivors (3):
--   • 8.5A_TESTING     — gold-standard fixture (513 design points,
--                        488 assignment_points, 1 QC run, 6 qc_points)
--   • StakeoutTest     — secondary fixture for non-gold-standard
--                        workflows (10 design pts, 9 assignments)
--   • Kimley Marketing — recognizable real-client name kept for
--                        future demo data (no fixture data attached)
--
-- Archived (15):
--   400 4th Ave S, DISP3, DISP TEST, DISP TEST2, Dispatch_TEST,
--   FIELD_test, LocationTest, Loma Rd, MODAL_TEST_DELETE_ME,
--   Project1_Test, TEST_20260401, TEST_260402, Texting,
--   VERADO_FRI_TEST, Verrado_260330.
--
-- Of these, two carry an orphaned `assigned_to` reference to user
-- c340c25a-5f8e-4445-8bef-8452c00a7a27 (deleted user — pre-existing
-- tech debt; deferred to Stage 13).
--
-- Idempotency: filtered on the firm UUID + project_name NOT IN
-- (survivors) + status != 'archived'. On a fresh DB rebuilt from
-- migrations these test rows don't exist; the UPDATE matches zero
-- rows and the migration is a no-op. On any DB where the firm has
-- been re-seeded since, it only acts on un-archived non-survivor
-- rows.
-- ================================================================

BEGIN;

UPDATE public.projects
SET    status = 'archived'
WHERE  firm_id = 'bc486f63-3249-4587-94b6-2ab6f861b2a4'
  AND  project_name NOT IN ('8.5A_TESTING', 'StakeoutTest', 'Kimley Marketing')
  AND  status != 'archived';

COMMIT;

-- ================================================================
-- VERIFICATION (manual — already run during Stage 12.1.5)
-- ================================================================
-- 1. Survivors only:
--    SELECT project_name, status FROM projects
--    WHERE firm_id = 'bc486f63-3249-4587-94b6-2ab6f861b2a4'
--      AND status != 'archived'
--    ORDER BY project_name;
--    Expected: 8.5A_TESTING, Kimley Marketing, StakeoutTest.
--
-- 2. Fixture data intact:
--    SELECT p.project_name, count(DISTINCT dp.id) AS design_pts,
--           count(DISTINCT a.id) AS assignments,
--           count(DISTINCT ap.id) AS assignment_pts,
--           count(DISTINCT qr.id) AS qc_runs,
--           count(DISTINCT qp.id) AS qc_pts
--    FROM projects p
--    LEFT JOIN stakeout_design_points dp ON dp.project_id = p.id
--    LEFT JOIN stakeout_assignments a ON a.project_id = p.id
--    LEFT JOIN stakeout_assignment_points ap ON ap.assignment_id = a.id
--    LEFT JOIN stakeout_qc_runs qr ON qr.assignment_id = a.id
--    LEFT JOIN stakeout_qc_points qp ON qp.assignment_id = a.id
--    WHERE p.project_name IN ('8.5A_TESTING','StakeoutTest','Kimley Marketing')
--    GROUP BY p.project_name ORDER BY p.project_name;
--    Expected: 8.5A_TESTING 513/1/488/1/6 ; StakeoutTest 10/9/41/2/9 ;
--              Kimley Marketing 0/0/0/0/0.
--
-- 3. Role integrity on remaining non-archived projects:
--    SELECT p.id, p.project_name, p.assigned_to, up.role
--    FROM projects p
--    LEFT JOIN user_profiles up ON p.assigned_to = up.id
--    WHERE p.assigned_to IS NOT NULL
--      AND p.status != 'archived'
--      AND (up.role IS NULL OR up.role NOT IN ('party_chief', 'field_crew'));
--    Expected: 0 rows.
