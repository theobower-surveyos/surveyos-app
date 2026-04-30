# CLAUDE_JOURNAL.md

**Purpose:** This file is the authoritative, living record of SurveyOS project state for any Claude instance (chat or Claude Code) picking up work. It's committed to the repo and updated at the end of major sessions. Read this first; orient fast; execute.

**Usage at session start:**
> Read `CLAUDE_JOURNAL.md`, orient yourself, then continue from the latest session log entry.

**Usage at session end:**
> Update `CLAUDE_JOURNAL.md` with today's session log entry, state changes, new decisions, and any new known bugs. Keep it concise.

---

## ⚠️ READ THIS FIRST IF STARTING A NEW SESSION (2026-04-29)

**Latest update — 2026-04-29 (evening):** Stage 12.1.7 Session 1 shipped. Recent Invoices section added to CommandCenter. See **"2026-04-29 (evening) — Stage 12.1.7 Session 1 Shipped"** entry under `## Session Log`. Baseline tag `baseline/pre-polish-2026-04-29` created at `c6572f9` and pushed to GitHub before further polish work begins. Branch hygiene noted as a Stage 13 front-loaded task — see **"Stage 13 Branch Hygiene Runbook"** below.

**Latest shipped work:** Stage 12.1.7 Session 1 — Recent Invoices on CommandCenter. Single commit `c6572f9` on `feature/stakeout-qc`. Component renders populated state (PAID/SENT/OVERDUE pills working), empty state, error state, loading state. Click handler reuses existing DispatchProjectDrawer trigger.

**Next session:** Stage 12.1.7 Session 2 — Active Projects by Type panel on CommandCenter. Schema-free (uses existing `projects.scope` jsonb). Same surface, allows another opportunistic polish pass at section-header consistency.

**Operating rules going forward:**
- Don't ship features on top of incorrect schema or unrestricted RLS (12.1.5 closed this).
- Polish-as-we-go during planned edits. Don't open files purely to polish.
- Marketing page waits for final 2-3 weeks of pre-pilot.
- Stakeout QC remains the category-defining capability. SurveyOS is the OS for ALL surveying work.
- Tag a baseline before any major polish/architecture milestone (Stage 14, Stage 15, pre-pilot push). Cheap insurance.

---

## Who I Am

**Theo Bower.** Solo founder and developer of SurveyOS under my own business entity. 13+ years field experience in land surveying and AEC work — rod man through Crew Chief, covering boundary surveys, topographic work, construction staking, ALTA/NSPS, as-builts, federal contracting (USFS, Army Corps), and geodetic control. Associate degree in land surveying, bachelor's in economics. FAA Part 107 drone cert. Engaged to Lauren. Based in Old Town Scottsdale, Arizona.

Fluent in the surveying domain — I've run the work, read the spec, staked the curb, submitted the ALTA, gotten the client to pay. The platform I'm building solves problems I've lived.

**My W-2 exit trigger is $15K MRR.** Until then, SurveyOS is evening/weekend work built on a multi-tool AI dev architecture: Claude web chat for strategy, Claude Code CLI for autonomous coding, Gemini for research.

---

## What SurveyOS Is

**Vertical SaaS — the operating system for ALL of small-firm land surveying.** Not just construction staking. Not just dispatch. The whole back office of a 3–50-person surveying firm.

Project types span: boundary surveys, ALTA/NSPS, topographic, as-built, subdivision plat, easement, right-of-way, federal contracting, hydrographic, geodetic control, and construction staking. **Stakeout QC is one workflow within this — important and well-built — but not the center.** Drone/LiDAR complexity is deferred until customers explicitly ask.

**Current build status by capability (post-Stage 12.1.5):**

| Capability | Maturity |
|------------|----------|
| Stakeout QC (chief flow + matcher + scoreboard + narratives) | Real — Stage 10/11 shipped |
| Dispatch board (drag-drop matrix, PTO, multi-day spans) | Real — Stage 9 era, holding up |
| DeploymentModal (project creation) | Real — Lead PM selector + priority field wired in 12.1.5 |
| CommandCenter (financial dashboard, project list, map) | Real, but financial figures are simulated demo data, not real customers. Recent Invoices section added 12.1.7 S1 |
| Crew app (chief mobile experience) | Real — clean, status-driven |
| Licensed PM dashboard | Filters by `lead_pm_id` correctly post-12.1.5 |
| ProjectDetail page | Doesn't exist; DispatchProjectDrawer pulling triple duty |
| Equipment, Team Roster, Client Portal | Mocked or shallow |
| Schema correctness | Drift captured in Migration 20 (12.1.5) |
| Security (RLS) | Hardened on critical tables (Migration 21, 12.1.5) |

**Wedge for sales:** invoicing + client portal + core PM. The AR-acceleration story (50-day DSO reduction) is the headline value prop for initial design-partner conversations. Stakeout QC is the category-defining capability that no current product (Trimble Access, Leica Captivate, TBC, Carlson) provides.

---

## Pricing Framework

| Tier | Price | Seats | Notes |
|------|-------|-------|-------|
| **Entry (Starter)** | $399/mo | 3 seats | No onboarding fee |
| **Pro** | $599/mo | Up to 10 seats | Optional one-time onboarding/implementation fee of $1,500 |
| **Enterprise** | Custom (~$1,499+/mo starting) | 11+ seats | Dedicated support, custom integrations, onboarding included |

**Add-ons (Intelligence Layers):** $99–$350/mo per pack
- Monument Vision
- Staking CV
- Predictive Analytics
- Compliance Engine

**Real MRR is $0.** Any prior figures (3 design-partner firms / $2,397 MRR / 13-day DSO validated) are simulated demo data, not real customers.

---

## Architectural Constraints (Non-Negotiable)

- **Stack:** React + Vite + Supabase + Vercel. React 18. Multi-tenant by `firm_id`.
- **Repo path:** `/Users/theobower/_WORK/02_SurveyOS/code/surveyos-app`
- **Styling:** Dark-mode-first. Inline styles referencing CSS variables. No Tailwind, no CSS-in-JS libraries.
- **Brand teal:** `#0D4F4F` (primary), `#0F6E56` (highlight).
- **Topographic contour motifs** — subtle visual signature, use sparingly.
- **CSS vars in `src/index.css`:** `--brand-teal`, `--brand-teal-light`, `--brand-amber`, `--bg-dark`, `--bg-surface`, `--border-subtle`, `--text-main`, `--text-muted`, `--success`, `--error`. Utility classes: `.coordinate-data` (mono N/E/Z), `.btn-field` (52px glove-mode buttons).
- **Zero-consumer-change integration pattern** when extending shared components.
- **Layout concerns at consumer-page level only**, never in shared components.
- **Feature flag dev-only tools** with `import.meta.env.DEV` triple-layer gates (route + nav link + component render).
- **Migrations in `supabase/migrations/`** — numbered, versioned, descriptive names.
- **Role-based routing in App.jsx:** `field_crew`/`party_chief` → CrewApp, all other authenticated → CommandCenter. No viewport-width check.
- **SurveyOS owns its input formats.** SOS grammar is canonical; firms adopt or pay for custom parser. Apple-style opinionated default.
- **Canonical project terminology: "Project" (not Deployment, not Job).** Use "Project" in user-facing copy across all surfaces. "Deployment" was internal SurveyOS vocabulary; "Job" was inconsistent with the schema. Locked 2026-04-29.

---

## Revised Staging (As of 2026-04-29)

| Stage | Description | Status |
|-------|-------------|--------|
| 1–10.4.5 | Schema, parser, matcher, CSV upload, scoreboard, field-fit | ✅ Shipped |
| 11.1 | Claude-generated QC narratives (Edge Function + table) | ✅ Shipped (`9eb26ab`) |
| 11.2 | Narrative regenerate UI + visual polish | ✅ Shipped (`8106f26`) |
| 11.3 | MorningBrief integration of narratives | ⏸ Deferred — decide during 12.1.7 review |
| 12.1 | Licensed PM dashboard scaffolding | ✅ Shipped (`71f400c`) — flawed, fixed in 12.1.5 |
| 12.1.1 | LicensedPmDashboard query + routing fix | ✅ Shipped (`bc0ce16`) |
| 12.1.5 | Schema correctness + foundation fix | ✅ Shipped (`33e3419..6a529ab`, 7 commits) |
| 12.1.7 S1 | Recent Invoices section on CommandCenter | ✅ Shipped (`c6572f9`) |
| **12.1.7 S2** | **Active Projects by Type panel on CommandCenter (NEXT)** | ⏳ **Next** |
| 12.2 | Financial snapshot strip on Licensed PM dashboard | ⏳ After 12.1.7 |
| 12.3 | ProjectDetail page (scope-aware) + nav from PM dashboard | ⏳ Requires Stage 14; re-scope after 12.1.7 |
| 13 | Polish + testing backlog (UX issues, mobile fixes, terminology cleanup, branch hygiene) | ⏳ Pending |
| 14 | Project model generalization (`stakeout_assignments` → general `assignments`) | ⏳ Major architectural change; affects DispatchBoard's "project = deployment" assumption |
| 15 | ProjectDetail page rebuild (depends on Stage 14) | ⏳ Pending |
| 16 | Demo polish + onboarding flow + first-pilot prep | ⏳ Pending |
| 17 | Marketing page + landing page (deferred to final 2-3 weeks) | ⏳ Wait until pilot-ready |

**Operating principle:** Polish-as-we-go for Stitch UI items during planned edits. If a Stitch item lives in a file already being touched for functional work, do the polish in the same commit. If it's in a different file, log it. Don't open files purely to polish.

---

## Stage 12.1.7: Stitch Polish + Functional Integrations (IN PROGRESS)

Foundation is correct (12.1.5 shipped). This stage builds functional integrations on top while incrementally improving visual polish during the same edits.

### Session 1 — SHIPPED 2026-04-29 (evening): Recent Invoices section

Single commit `c6572f9` on `feature/stakeout-qc`. See Session Log entry for details.

### Functional integration candidates remaining (pick based on session priority):

1. **Active Projects by Type panel on CommandCenter** — uses existing `projects.scope` jsonb. Horizontal bar list grouped by scope value. Communicates "OS for ALL surveying" message at a glance. **Highest-leverage candidate for Session 2.**

2. **Improved financial header on CommandCenter** — replace current Revenue/Costs/Profit/Margin/Projects with surveyor-relevant metrics: Revenue YTD, WIP (Unbilled), AR > 30 Days, Crew Utilization. Bloomberg-grade signals owners actually scan for. **Will naturally relocate Recent Invoices to its eventual full-width position when this lands.**

3. **Map marker labels** — show crew + project ID on dispatch map markers. Highlight alert markers in amber. Uses existing project + assignment data.

4. **Phase-aware status pills** — phase-aware terminology (FIELD WORK / IN QC / DRAFTING / READY FOR REVIEW / INVOICED / ARCHIVED) instead of generic SaaS statuses. Will lift the local Recent Invoices pill pattern to a shared component when this lands. May require status enum extension.

**Stitch polish items to apply during the above edits:**

- Hero stat treatment for QC scoreboards (1,204 in / 18 out — bigger numbers, dramatic)
- Recent Shot Log pattern for AssignmentDetail (monospace coordinate columns + status icons)
- Continuous multi-day span bars on dispatch matrix (vs. separate compact cards)
- Crew row metadata on dispatch (truck designation, member count, certs)
- Overtime / labor risk indicator on crew rows
- Maintenance / training block visualization alongside PTO
- Financial health bar per project card on Projects list view

**What to skip:**
- Anything on the Stakeout QC sidebar nav (Stitch missed this; SurveyOS keeps it as top-level)
- Mon-Fri reduction (SurveyOS uses Mon-Sat — industry standard)
- Generic sidebar terminology (keep Command Center / Stakeout QC / Dispatch Board / etc.)
- Generic user identity ("sys_admin" etc.) — keep named operator personality
- Removal of greeting line (keep "Good evening, theo")

### Definition of done for Stage 12.1.7

To be defined at session start. Likely 2-3 functional integrations (Recent Invoices shipped Session 1; Active Projects by Type and financial-strip overhaul are the strongest remaining candidates) plus opportunistic polish on touched files.

---

## Stage 13 Branch Hygiene Runbook (planned)

**Why this is needed.** `feature/stakeout-qc` was created as a feature branch for the Stakeout QC build (Stage 8 era). Stakeout QC shipped (Stages 10–11), but the branch was never merged back to `main`. Stage 12.1.5 (schema work) and Stage 12.1.7 Session 1 (Recent Invoices) both shipped onto the same feature branch despite not being StakeoutQC-scoped. The branch is now the de facto trunk; `main` is months behind. The misleading name and stale `main` are tech debt that compounds over time.

**Status as of 2026-04-29:**
- `main` is at the pre-Stakeout-QC state (last commit before Stage 11.1)
- `feature/stakeout-qc` is the working branch, contains everything from Stage 11.1 forward through Stage 12.1.7 Session 1 (`c6572f9`)
- `feature/stakeout-qc-85b-polish-wip` is an abandoned WIP branch from Stage 8.5b
- Tag `baseline/pre-polish-2026-04-29` at `c6572f9` is pushed and durable

**When to do this work.** Front-load it as the first task of Stage 13. Schedule for a morning session with at least 90 min of clean runway. Do not do this at end-of-session, late at night, or alongside other Stage 13 polish work. It's a focused mechanical task that benefits from fresh attention and earns nothing if rushed.

**Estimated time:** 45 min – 1 hr without surprises. Add 30+ min if merge conflicts appear (unlikely since `main` hasn't moved since the branch diverged).

**Pre-flight checks:**
1. Working tree clean (`git status` returns nothing to commit)
2. All recent work pushed (`git push origin feature/stakeout-qc` returns "up to date")
3. `npm run build` passes
4. The most recent baseline tag is in place and pushed

**Procedure:**

1. Sync local main with remote: `git checkout main && git pull origin main`
2. Verify what's on main vs. feature: `git log --oneline main..feature/stakeout-qc | wc -l` (shows count of commits being merged in)
3. Merge with `--no-ff` to preserve branch history: `git merge feature/stakeout-qc --no-ff -m "Merge feature/stakeout-qc into main: Stages 11–12.1.7 Session 1"`
4. Resolve any conflicts (unlikely)
5. Verify build still passes on merged main: `npm run build`
6. Push main: `git push origin main`

**Branch decision after merge — pick one:**

- **Option A (recommended): rename feature branch to `develop`.** Continues to be the working trunk for ongoing Stage 12.1.7+ work. Commands: `git branch -m feature/stakeout-qc develop`, then `git push origin develop`, then `git push origin --delete feature/stakeout-qc`, then update upstream tracking with `git push --set-upstream origin develop`.

- **Option B: delete feature branch, work directly on main going forward.** Simplest model for solo dev. Commands: `git checkout main && git branch -d feature/stakeout-qc && git push origin --delete feature/stakeout-qc`.

- **Option C: keep feature branch, accept the misleading name.** Lowest effort, but the name remains tech debt. Not recommended.

**Cleanup of abandoned branch:**
- Delete `feature/stakeout-qc-85b-polish-wip` locally: `git branch -D feature/stakeout-qc-85b-polish-wip`
- Delete remote: `git push origin --delete feature/stakeout-qc-85b-polish-wip`

**Verify final state:**
- `git branch -a` should show only `main` plus the chosen working branch (`develop` if Option A)
- `git log main --oneline -5` should show recent shipped work
- Tags survive branch operations — verify with `git tag -l`

**Update journal post-merge:** add a "Stage 13 Branch Hygiene — Done" entry to Session Log noting the option taken and the new branch model.

**Risks:**
- Merge conflicts: low probability since `main` hasn't moved
- GitHub branch protection on `main`: if enabled, the direct push fails and a PR is required (5 min friction, no functional issue)
- Forgetting to push tags: tags don't push by default with `git push`. Run `git push origin --tags` after the merge to be safe.

---

## Stage 12.1.5: Schema Correctness + Foundation Fix (SHIPPED 2026-04-28)

Reference doc preserved in case future schema work needs to revisit decisions.

### Six migrations applied (idempotent against production):

- **20** schema sync — captured 23 columns of drift on `projects` (IF NOT EXISTS, no-op against prod), added `lead_pm_id`, `address`, `priority`, `client_contact_name`, `client_contact_phone` on `projects`, `pm_site_notes` on `stakeout_assignments`, folded in 2-column drift on `user_profiles` (`certifications`, `assigned_equipment` text[]). Reversed Migration 19's `assigned_to` comment back to "Party Chief, NOT Licensed PM."
- **20a** backfill — restored `assigned_to = Andrew` (Party Chief, field_crew) and set `lead_pm_id = Maynard` (Licensed PM, pm) on the four ex-Migration-19 projects. Corrected the 5th misassigned project surfaced during Step 0 (TEST_260402, theo as owner) to `assigned_to = NULL, lead_pm_id = theo`.
- **21** RLS hardening — dropped `Sandbox Master Projects` and `Sandbox Master Profile Policy` (would have rendered RLS useless if simply enabled), dropped legacy inline-subquery policies, added `Office roles manage firm projects` (owner/admin/pm) and `Firm mates read profiles`, enabled RLS on `projects` and `user_profiles`, applied `security_invoker = true` to `crew_utilization` and `stakeout_qc_summary` views.
- **22** party_chief write whitelist — BEFORE UPDATE trigger restricting chief writes (party_chief + field_crew) to `status, submitted_at, chief_field_notes` only. 25 column checks enumerated explicitly.
- **23** qc_points CASCADE fix — AFTER DELETE trigger on `stakeout_assignment_points` cleans matching qc_points by composite key (no direct FK exists). Verified destructively on a StakeoutTest assignment (asgn 6→5, qc 6→5, target qc 1→0).
- **24** test data archive — preserved 8.5A_TESTING (gold-standard fixture: 513 design pts, 488 asgn pts, 1 run, 6 qc pts), StakeoutTest (10 / 9 / 41 / 2 / 9), Kimley Marketing (real client name kept for future demo, no fixture data). Archived 15 sloppy fixtures.

### Code updates:

- `LicensedPmDashboard.jsx` — query filters `lead_pm_id` instead of `assigned_to`. Maynard's portfolio rendering verified via smoke test (4 backfilled projects appear).
- `DeploymentModal.jsx` — Lead PM selector added. Filtered to `role IN ('owner','pm')`, firm-scoped via `teamMembers`. Defaults to current user when their role is owner/pm; otherwise explicit pick required (no chief is silently written into `lead_pm_id`). Priority swapped from 2-option toggle (standard/critical) to 3-option select (low/standard/high). Both fields persist into projects insert. Removed orphaned `Zap` import + `PriorityButton` sub-component.
- `CommandCenter.jsx` — passes `profile` to DeploymentModal so Lead PM default can evaluate.
- `App.jsx` — `handleCreateProject` now forwards `lead_pm_id` and `priority` from modal payload into projects insert. The wire that was previously silently dropping priority is now connected.
- `DispatchBoard.jsx` — semantic comments at `getCrewId`, drag-drop handler, mobile assign/unschedule editor, and CrewAvatarStack header. `project?.address` references verified null-safe via existing `|| project?.location` fallback; no functional change.
- `MorningBrief.jsx` — semantic comment at `getCrewId` helper.
- Skipped `TodaysWork.jsx` and `EquipmentLogistics.jsx` per the rule — both reference `equipment.assigned_to` (text first-name string), not `projects.assigned_to`.

### Discovered during 12.1.5, deferred to Stage 13:

- `user_profiles.role` lacks a CHECK constraint — accepts any string.
- 3 remaining `Sandbox Master *` policies on `stakeout_*_points` / time / consumables tables.
- Orphaned `assigned_to = c340c25a-5f8e-4445-8bef-8452c00a7a27` (deleted user) on Project1_Test and Verrado_260330 — both now archived, off active surfaces.
- Dead-file confirmation: `TodaysWork.jsx`, `MobileCrewView.jsx` are unreachable for `field_crew` users.
- Assignment-level `client_contact_name` and `client_contact_phone` columns (Migration 13) are now duplicated by project-level columns added in Migration 20 — should migrate any assignment-level data up to project and drop the assignment columns.

### Discovered during 12.1.5, deferred to Stage 14:

- **Dispatch / CrewToday architectural gap.** Dispatch Matrix writes to `projects.assigned_to` and `projects.assigned_crew`; CrewToday + CrewUpcoming read from `stakeout_assignments.party_chief_id`. The two surfaces operate on different tables. Pre-Stakeout-QC, dispatch chief flow worked because chief surfaces queried `projects` directly. Post-Stakeout-QC, the new architecture left dispatch behind. Andrew has zero `stakeout_assignments` rows because dispatch never creates them — confirmed via diagnostic SQL during Step 0 + post-Migration-21 audit. This is the architectural gap Stage 14's `assignments` generalization is designed to resolve.
- **Potential RLS gap (no current victims).** `Field roles read firm projects` policy doesn't allow read when user is `party_chief_id` on an assignment whose project's `assigned_to` is a different user. Currently zero misalignment victims (Andrew diagnostic returned zero rows). Policy expansion (additive OR clause checking `party_chief_id` on assignments under that project) should land when Stage 14 unifies the assignment model.

### Decisions locked during 12.1.5:

- Migration 22 trigger fires on `user_role IN ('party_chief', 'field_crew')` — restricts the chiefs that exist in production data.
- Migration 23 used trigger approach (not FK CASCADE) because no direct FK exists between qc_points and assignment_points.
- Migration 21 reused existing `get_my_firm_id()` instead of creating a duplicate.
- **PM role has firm-wide project write access** via `Office roles manage firm projects` — Phase 1 acceptable for small firms (PMs cover for each other). **Phase 2 evolution: scope to `lead_pm_id = auth.uid()` OR explicit cross-PM permission, when multi-PM firms become paying customers.**
- Lead PM selector defaults to current user only when `role IN ('owner', 'pm')`; otherwise explicit pick required.
- Priority field exposed as 3-option select (low / standard / high) with `standard` as default.
- Test data: archived 15 of 18 dev firm projects; preserved 8.5A_TESTING (gold-standard), StakeoutTest (secondary), Kimley Marketing.

---

## UI Audit Findings (2026-04-29 — Stitch Design Exercise)

Used Google Stitch to generate alternative UI designs for SurveyOS. Reviewed against current build to identify polish wins worth porting. Tonight's session was audit only — no code shipped. Findings sorted into "steal these" (worth porting) and "keep ours" (don't regress).

### Steal these from Stitch

**CommandCenter:**
- Replace generic financial header (Revenue/Costs/Profit/Margin/Projects) with surveyor-relevant metrics: Revenue YTD, WIP (Unbilled), AR > 30 Days, Crew Utilization
- Add "Active Projects by Type" panel using `projects.scope` jsonb — horizontal bar list grouped by scope, communicates "OS for all surveying"
- Add "Recent Invoices" section using `projects.invoice_status` and `projects.invoice_amount` — status pills (PAID / SENT / OVERDUE / DRAFT). Makes the FinTech wedge visible. ✅ Shipped 12.1.7 S1.
- Add map marker labels (crew + project ID, alert highlights in amber)
- Phase-aware status pills (ACTIVE / FIELD WORK / IN QC / DRAFTING / READY FOR REVIEW / INVOICED / ARCHIVED)

**Dispatch Board:**
- Crew row metadata: truck designation, member count, certifications (e.g., "UAV Cert")
- Overtime / labor risk indicator on crew rows
- Continuous multi-day project bars (vs. current separate compact cards)
- Maintenance / training block visualization alongside PTO

**Stakeout QC Detail (PM view):**
- Hero stat treatment: large numbers (1,204 in-tolerance / 18 out-of-tolerance) front and center
- Recent Shot Log table with monospace Northing/Easting/Elevation columns
- Tolerance readout (H: 0.045 ft / V: 0.022 ft) anchored next to the stat
- Slide-over panel pattern (consistent with existing drawer pattern)

**Projects List:**
- Phase-aware status pills (FIELD WORK / IN QC / DRAFTING)
- Financial health bar per project card (uses existing `budget_allocated` / `budget_spent` / `invoice_amount`)
- Type-based filter chips (uses `scope` jsonb)
- Client name as primary card metadata

### Keep ours, don't regress

- Sidebar items with surveying-domain language (Command Center / Stakeout QC / Dispatch Board / etc.) — Stitch reverted to generic SaaS naming; don't follow
- Greeting line ("Good evening, theo") — warmer than Stitch's "SYS STATUS: NOMINAL"
- Operator footer with named user — Stitch shows "Owner Admin / sys_admin" which is colder
- Active/Review/Done tab pattern on project list — useful workflow-state filtering Stitch dropped
- Mon-Sat working week (Stitch dropped Saturday — incorrect for industry)
- Drag-and-drop dispatch interaction (Stitch is static)
- PTO with realtime + visual treatment
- Equipment conflict detection
- Mobile branch for dispatch (Stitch only designed desktop)

### Universal Stitch misses

- Stakeout QC missing from sidebar in every Stitch surface — Stitch doesn't grasp it as a top-level capability
- No mobile crew experience designed at all — Stitch only built desktop surfaces
- Generic user identity throughout
- Mon-Fri working week instead of Mon-Sat

### Implementation rules

**Polish-as-we-go discipline:** During planned feature work in Stage 12.1.7+, if a Stitch polish item lives in a file you're already editing, apply it in the same commit. If it's in a different file, log it as a follow-up. Don't open files purely to polish — that's a time sink that delays shipping.

**Don't half-implement:** If you commit to applying a Stitch polish item (e.g., financial strip overhaul), do the whole strip, not three of four metrics. Half-done UI ages worse than untouched legacy.

**Schema-free stage:** All Stitch polish items above use existing schema columns. No new migrations required. The data already exists.

---

## Audit Findings (2026-04-28 — Surface + Schema Audit)

Captured during a session that paused all builds to audit existing surfaces. Reviewed: CommandCenter, DeploymentModal, DispatchBoard, DispatchProjectDrawer, CrewApp, CrewAssignmentDetail, plus full schema introspection.

### Surface-by-surface findings

**CommandCenter:**
- ✅ Works: greeting header, tab toggle, search bar, financial header, map with pulsing markers, project list with active/review/done sub-tabs, "+ New Project" → DeploymentModal, Recent Invoices section (added 12.1.7 S1)
- ⚠️ Hollow: `onProjectSelect` prop destructured but never called; `isAdminOrOwner` actually includes `pm` role (misleading naming)
- ❌ Wrong: two competing drawer patterns (DispatchProjectDrawer for project rows, IntelligenceDrawer for map markers) — code smell

**DeploymentModal:**
- ✅ Works: scope as multi-select array (correct semantics for real surveying); CSV upload to project-photos storage on dispatch; required-field gating; Lead PM selector + priority field wired in 12.1.5
- ⚠️ Hollow: CSV uploaded but no downstream parser into `stakeout_design_points` (separate flow handles design point import)

**DispatchBoard + DispatchProjectDrawer:**
- ✅ Works (matrix): drag-drop with optimistic updates, week/month views, multi-day spans, PTO with realtime + visual treatment, equipment conflict detection (with drag-preview occupancy), mobile branch (separate layout), drawer mode logic (active/review/archive)
- ✅ Works (drawer): three-mode rendering, Approve decoupled from Generate Invoice, hidden time tracking surfaced as PM-only Field Log, end-of-day summary modal with hours framing, photo capture
- ⚠️ Hollow: drawer is ~1500 lines doing 4 personas' work; assumes "project = field deployment" which doesn't fit non-staking project types; `displayCrews` filter inconsistent between DispatchBoard and CommandCenter; mobile schedule editor doesn't preserve span length
- ❌ Wrong: `EndOfDaySummary` uses scope items as "tasks completed" (semantic miss — scope is project type categories, not daily tasks); `displayCrews` includes `pm` role as fallback when no field_crew exists

**CrewApp + CrewAssignmentDetail:**
- ✅ Works (shell): three-tab layout, sticky bottom nav, detail-overlay pattern, safe-area inset handling, field-first routing regardless of viewport
- ✅ Works (detail): three status modes (sent/in_progress/submitted), soft out-of-tol warning on submit (not blocking), QC scoreboard integration, persistent QC results, plan view explicitly removed (chiefs use Trimble Access — correct)
- ⚠️ Hollow: no photo capture on staking assignment (dispatch drawer has it; this doesn't); no equipment readout for chief; no `started_at` timestamp on assignment Start (parity gap with dispatch drawer)
- ❌ Wrong: "reconciled" terminology lingers (Stage 13 cleanup known); no undo path from submitted state; submitted state has no action footer

**LicensedPmDashboard (post-12.1.5):**
- ✅ Works: greeting, projects list correctly filtered by `lead_pm_id`, narrative feed scaffolding, multi-query fetch (assignments → runs → narratives, joined in JS)

### Schema findings (from production introspection)

Confirmed by SQL on 2026-04-28:

**Drift on `projects`:** ~17 columns existed in production not in any migration file. Captured in Migration 20 (12.1.5).

**`stakeout_assignments` uses correct naming:** `party_chief_id` (not `assigned_to`). The semantic confusion was **local to `projects` table only**, not propagated.

**`firms` has rich subscription/billing infrastructure** already: `subscription_tier`, `subscription_status`, `trial_ends_at`, `invoice_prefix`, `invoice_next_seq`, `default_payment_terms`, `default_tolerance_h`/`v`, `license_number`, `license_state`. Most not wired to UI yet.

**`equipment` inconsistency:** `id` is `bigint` (everything else is uuid); `assigned_to` is `text` (everything else is `uuid`). Stage 14+ cleanup.

**`stakeout_qc_points.design_point_id_b` exists** for the line-stake-between-two-points feature. Confirms Stage 10.2 line-stake architecture.

**Status enums are text, not Postgres enums:** `projects.status`, `qc_points.h_status`/`v_status`/`built_on_status`. Typos won't error. Stage 13 cleanup.

### Architectural realizations

1. **`stakeout_assignments` should generalize to `assignments` for all project types.** A boundary survey has many field days; an ALTA has many client checkpoints; a topo has many days of fieldwork. The dispatch board should operate on assignments (deployments), not projects directly. The PM dashboard should show projects + their rolled-up assignments. This is Stage 14 — major change, but the foundation already exists.

2. **DispatchProjectDrawer needs to split into focused surfaces.** It's currently:
   - Field crew workflow (Start Work, Mark Complete, photos, notes)
   - PM editing (crew, duration, equipment)
   - PM review (Approve, Generate Invoice)
   - Archive viewing
   Splitting these is part of Stage 14/15 ProjectDetail rebuild.

3. **`scope` multi-select replaces `project_type` enum.** Don't add a project_type field. Drive UI behavior from scope contents. CrewAssignmentDetail's status-driven mode pattern is the model — apply same to ProjectDetail with scope-driven contextual sections.

4. **Review hero pattern (in DispatchProjectDrawer review mode) is genuinely good UX.** Photos + Field Log + Notes + Tasks rendered focus-first. Whatever ProjectDetail becomes should adopt this pattern.

5. **CrewAssignmentDetail is the cleaner model than DispatchProjectDrawer.** ~400 focused lines vs ~1500 trying to do everything. Let CrewAssignmentDetail be the template for future per-workflow detail pages.

---

## Backlog Reconciliation (Updated 2026-04-29)

Sorted into three buckets. Items move between buckets as priorities shift.

### Pre-pilot must-fix (Stage 13 + remaining 12.x)

**Schema correctness:** ✅ MOSTLY COMPLETE via 12.1.5
- ✅ Migration 20: schema drift on `projects` captured
- ✅ Migration 21: RLS active on critical tables
- ✅ Migration 22: party_chief write whitelist
- ✅ Migration 23: qc_points CASCADE
- ⏳ `user_profiles.role` CHECK constraint
- ⏳ Remaining `Sandbox Master *` policies on stakeout_*_points / time / consumables tables
- ⏳ Drop duplicated assignment-level `client_contact_*` columns (Migration 13 cruft now superseded by project-level cols)

**Branch hygiene:** ⏳ Stage 13 front-loaded task. See Stage 13 Branch Hygiene Runbook above.

**Stakeout QC completion:**
- Real-data testing pass (chiefs uploading actual SOS-format CSVs from real projects)
- Stage 10.5 (PM manual-match) — decide if Phase 1 needs it
- Stage 11.3 (MorningBrief integration of narratives) — decide if Phase 1 needs it

### Pre-demo polish (Stage 13)

**Stitch polish (apply opportunistically during 12.1.7+):**
- ✅ Recent Invoices section with status pills (12.1.7 S1)
- Improved CommandCenter financial strip (Revenue YTD / WIP / AR > 30 / Crew Utilization)
- Active Projects by Type panel
- Map marker labels (crew + project ID, alert highlights)
- Phase-aware status pills throughout (lift local Recent Invoices pill pattern to shared)
- Hero stat treatment for QC scoreboards
- Recent Shot Log table pattern for AssignmentDetail
- Continuous multi-day span bars on dispatch
- Crew row metadata (truck, member count, certs)
- Financial health bar per project card on Projects list

**Dispatch board:**
- Network Ops deletion (file + nav + route — confirmed dead)
- Test data cleanup visible to anyone clicking around (mostly done in 12.1.5)

**Mobile UX:**
- Bottom nav `env(safe-area-inset-bottom)` over-reserving
- Submit button height reduction (~50% on mobile)
- Tab nav button height reduction
- Labels invisible at extreme zoom in Safari (sub-pixel text rendering)

**AssignmentDetail:**
- Pagination on design points table (currently renders all 488 rows)
- Stacked points UX (control + check shots same location)
- Controls off-view indicator
- Control points non-selectable for assignment

**Run Summary visual:**
- Stronger visual emphasis on QC narrative block (teal accent border or heavier card background)

**Crew assignment detail gaps:**
- Photo capture on staking assignment (chiefs can't currently attach photos)
- Equipment readout for chief (so they know what gear is on the job)
- `started_at` capture on assignment Start (parity with dispatch drawer)

**Project navigation:**
- Make project rows clickable from LicensedPmDashboard — but route TO ProjectDetail (after Stage 15), not Stakeout QC

**Terminology:**
- "Reconcile" → "Reviewed" migration (column + enum). Disruptive but clean.

**Dead file cleanup:**
- `src/views/NetworkOps.jsx` — confirmed dead Stage 8 PWA scaffolding
- `src/views/LiveView.jsx` — likely Stage 8 dead
- `src/views/FieldLogs.jsx` — possibly superseded by drawer's Field Log section
- `src/views/ProfitAnalytics.jsx` — possibly mocked Stage 8 work
- `src/views/EquipmentLogistics.jsx` — possibly the original Equipment page
- `src/views/ProjectVault.jsx` AND `src/components/ProjectVault.jsx` — duplicate names, drift
- `src/views/TodaysWork.jsx` — confirmed unreachable for field_crew users (per 12.1.5 audit)
- `src/views/MobileCrewView.jsx` — same
- `consumables_log.material` reference in some dead view — surfaced in 12.1.7 S1 console errors

### Phase 2 (post-pilot, real new work)

**Architecture:**
- Stage 14: Generalize `stakeout_assignments` → `assignments` for all project types. Resolves Dispatch / CrewToday gap discovered in 12.1.5.
- Stage 15: ProjectDetail page (scope-aware, replaces or supplements DispatchProjectDrawer)
- Split DispatchProjectDrawer's 4 personas into focused surfaces
- URL-based deep linking (chief assignment URLs, project URLs)

**PM features:**
- Financial snapshot strip on Licensed PM dashboard (Stage 12.2)
- Per-project budget tracking using `budget_allocated` / `budget_spent` (already in schema)
- AssignmentBuilder CSV upload (PM exports daily staking points)
- Scope checklist authoring (PM creates day-of items)
- PM RLS scope evolution: `lead_pm_id = auth.uid()` OR explicit cross-PM permission, when multi-PM firms become paying customers (Phase 1 currently grants firm-wide PM project access)

**Subscription / billing wiring:**
- Wire `firms.subscription_*` columns to plan management surface
- Use `firms.invoice_prefix` and `invoice_next_seq` for real invoicing
- `firms.default_payment_terms`, `default_tolerance_h/v` similarly unused

**Equipment:**
- Real Equipment page (currently mocked)
- Fix `equipment.assigned_to text` → `uuid` reference
- Fix `equipment.id bigint` to UUID for consistency
- Equipment calibration tracking + alerts

**Team Roster:**
- Real Team Roster page (currently mocked)
- Use `user_profiles.certifications` and `assigned_equipment` arrays already in schema

**Status enums:**
- Convert text status columns (`projects.status`, `qc_points.h_status`/`v_status`/`built_on_status`) to Postgres enum types with CHECK constraints
- Add `user_profiles.role` CHECK constraint

**Field experience:**
- PDF attachment for plan sheets / easement docs (replacing the removed plan view)
- Photo capture on staking assignment
- Equipment readout for chief
- GPS lat/lon on Start Work taps (privacy/consent UX needed)

**AI / Intelligence Layer:**
- Per-crew accuracy aggregation → AI dispatch matching (most defensible IP angle)
- Predictive staking CV
- Direction inference UX for point-feature offsets
- Excel bidirectional sync
- AI portfolio advisory (natural language queries, weekly margin summaries)

**Firm-level customization:**
- Firm-level feature code libraries (CSV upload + override layer)
- Firm-level custom SOS parser for legacy as-staked formats (~2 days/firm)

**Marketing / launch:**
- Marketing page + landing page (Stage 17, deferred to final 2-3 weeks of pre-pilot)
- Onboarding flow + first-pilot prep (Stage 16)

---

## Phase 1 Roadmap: Stakeout QC (Historical, retained for context)

| Stage | Description | Status |
|-------|-------------|--------|
| 1-5 | Schema, utility functions, export utilities, PM-facing design points import | ✅ Shipped |
| 6 | PM assignment builder | ✅ Shipped (`dd8db0b`) |
| 7a | List + detail + QC dashboard | ✅ Shipped (`91f88a0`) |
| 7b.1 | Inline edit metadata, edit points, per-point tolerance | ✅ Shipped (`9966470`) |
| 7b.2 | Reconciliation workflow, exports, status progression, re-send | ✅ Shipped (`73da530`) |
| 8 | Crew PWA infrastructure | ✅ Shipped (`3d7b794`) |
| 8.5a | Plan view production-scale | ✅ Shipped (`9438d45`) |
| 8.5b-core | Feature-code color palette, shape differentiation | ✅ Shipped (`9cb8dfc`) |
| 8.5b-polish | Filter chips, legend, zoom-to-point, label collision | ✅ Shipped (`5418c8f`) |
| 9 (minus 9.5 push) | Crew field view UI (mobile-first) | ✅ Shipped (`b2e545c`) |
| 9.5 | Push notifications | ⏸ Deferred indefinitely |
| 10.1 | SOS grammar spec + parser + dev tester | ✅ Shipped (`2b5a276`) |
| 10.2 | Matching engine + migration 16 | ✅ Shipped (`3be2b37`) |
| 10.3 | CSV upload UI (chief mobile + PM desktop) | ✅ Shipped (`ca2d61a`) |
| 10.3.5 | Stakeout QC sidebar nav | ✅ Shipped (`b1152bd`) |
| 10.4 | Chief QC scoreboard + field-fit UX | ✅ Shipped (`6746151`) |
| 10.4.5 | Migration 17 + clean field-fit schema | ✅ Shipped (`52de61f`) |
| 10.5 | PM manual-match | ⏸ Deferred — decide during 12.1.7 |
| 11.1 | Claude-generated QC narratives | ✅ Shipped (`9eb26ab`) |
| 11.2 | Narrative regenerate UI + visual polish | ✅ Shipped (`8106f26`) |
| 11.3 | MorningBrief integration | ⏸ Deferred — decide during 12.1.7 |
| 12.1 | Licensed PM dashboard scaffolding | ✅ Shipped (`71f400c`) — flawed, fixed in 12.1.5 |
| 12.1.1 | Routing + query fixes | ✅ Shipped (`bc0ce16`) |
| 12.1.5 | Schema correctness + foundation fix | ✅ Shipped (`33e3419..6a529ab`) |
| 12.1.7 S1 | Recent Invoices on CommandCenter | ✅ Shipped (`c6572f9`) |
| **12.1.7 S2** | **Active Projects by Type panel (NEXT)** | ⏳ **NEXT** |
| 12.2 | Financial snapshot strip | ⏳ After 12.1.7 |
| 12.3 | ProjectDetail nav | ⏳ Re-scope after 12.1.7; depends on Stage 14 |
| 13 | Polish + testing backlog (incl. branch hygiene) | ⏳ Pending |
| 14 | Project model generalization | ⏳ Major architectural change |
| 15 | ProjectDetail page rebuild | ⏳ After Stage 14 |
| 16 | Demo polish + onboarding + first-pilot prep | ⏳ Pending |
| 17 | Marketing + landing page | ⏳ Final 2-3 weeks of pre-pilot |

---

## Stage 11 Architecture (Shipped)

### Path 3 (async + cached) for Claude QC narratives

Chief submits → frontend fire-and-forget call to Edge Function `generate-qc-narrative` → Edge Function fetches run + qc_points + assignment + project + chief context → calls Anthropic API (claude-sonnet-4-6, ~$0.005/call) → upserts narrative to `stakeout_qc_narratives` table → frontend polls for result. PM and chief both see same narrative (PM with regenerate button, chief with retry-on-error only). 30s client-side cooldown. Visual: 4px teal left-border + subtle teal background tint on Run Summary block.

### Files shipped in Stage 11

**Migration:**
- `18_stakeout_qc_narratives.sql` — table with `run_id` FK CASCADE, `narrative_type`, `body`, `model`, `prompt_version='v1'`, `generated_at`, `error` column. RLS: office full access, chief read/insert/update for own runs.

**Edge Function:**
- `supabase/functions/generate-qc-narrative/index.ts` — 353 lines, Deno

**Frontend:**
- `src/lib/qcNarrative.js` — `triggerNarrativeGeneration` (fire-and-forget) + `regenerateNarrative` (awaited)
- `src/hooks/useQcNarrative.js` — polls every 2.5s, max 16 attempts (~40s)
- `src/components/qc/QcNarrativeBlock.jsx` — display component, accepts `canRegenerate` + `compact` props

**Deployment:**
- Anthropic API key created/rotated as "SurveyOS Production" (initial leaked key revoked)
- Stored as `ANTHROPIC_API_KEY` in Supabase Edge Function Secrets
- Supabase CLI installed via brew, linked to project ref `dhvnquuvfspnwayqmqtu`
- Function deployed via `supabase functions deploy generate-qc-narrative`

**Cost engineering:**
- Tokens ≈ 0.75 words. Input $3/1M, output $15/1M. Per narrative ~$0.005.
- Light firm 110/mo = $0.55. Heavy firm 660/mo = $3.30. 100 firms = $165/mo. 1000 firms = $3,300/mo.
- Cost controls: auto-on-submit (not on-view), fire-and-forget, capped concerns array at 8 rows, single-run only, 80-150 word output target, no streaming, no prompt caching yet.

---

## Stage 10 Architecture (Complete)

### SurveyOS Stake Code Standard (SOS) v1

Industry's existing as-staked code formats are parser-hostile. SurveyOS publishes its own canonical grammar; firms adopt for SurveyOS compatibility; legacy formats become per-firm Phase 2 custom parsers.

Grammar:
<code> := <point_stake> | <line_stake> | <check_shot> | <control_check>
<point_stake>    := <design_id> "-" <offset> "-" <stake_type>        e.g. 4007-5-HUB
<line_stake>     := <design_id> ":" <design_id> "-" <offset> "-" <stake_type>  e.g. 4003:4002-11-NAIL
<check_shot>     := <design_id> "-" "CHK"                             e.g. 4007-CHK
<control_check>  := "CP" "-" "CHK"                                    e.g. CP-CHK

Stake types: `HUB, LATHE, NAIL, PK, MAG, PAINT, CP, WHISKER`.
Field-fit reason codes: `OB` (Obstruction), `AC` (Access), `SA` (Safety), `CF` (Conflict), `OT` (Other).

Spec: `docs/sos-stake-code-standard.md`.

### Stage 10 files (summary)

Modules: `sosParser`, `sosMatcher`, `sosProcessRun`, `csvParser` (all in `src/lib/`).
Migrations: 16 (qc_points columns + dropped legacy CHECKs), 17 (chief field-fit writes).
Components: `CrewUploadButton`, `CrewQcScoreboard`, `CrewQcPointSheet`, `PmUploadButton`, `PmUploadDropZone`.
Hooks: `useCrewQcRun`.

### Data flow end-to-end

1. PM creates assignment with design points (Stage 6+)
2. PM sends to chief, status `sent` → `in_progress`
3. Chief stakes work in field, exports CSV from Trimble Access
4. Chief opens crew app, taps "Check my work", picks CSV
5. CSV parsed → SOS codes parsed → matcher computes deltas with offset transformation
6. `sosProcessRun` deletes prior run, creates new run, batch-inserts qc_points
7. Crew app fetches via `useCrewQcRun()` hook, scoreboard renders
8. Out-of-tol rows tap → bottom sheet → field-fit reason picker
9. Submit visual adapts to out_of_tol count
10. Chief taps Submit → status `submitted`
11. Stage 11 Edge Function fires, narrative generates, polled into UI
12. PM sees populated dashboard with narrative on AssignmentDetail

### Key product decisions (locked across Stages 10-11)

- Dash separator + colon for line-stake "between"
- No direction hint in codes; perpendicular distance only for line features
- Most-recent-wins duplicate handling
- Re-upload overwrites cleanly (CASCADE on delete)
- Field-fit flagged in app post-upload, NOT in code string
- Adaptive Submit button visual weight (60% opacity if any out_of_tol)
- Chief sees scoreboard from DB, persisted across navigation
- Trimble data collectors are primary device target (TSC5/iPhone+DA2/TSC7)
- Plan view removed from chief experience — Trimble Access owns field navigation
- Narrative cost ~$0.005/call, scales linearly; gating logic on submit only
- Per-chief accuracy intelligence is the most defensible IP angle (Phase 2+)

---

## Deferred Stages

### Stage 9.5 — Push notifications
Deferred indefinitely. Build push when we know what real events to notify about.

### Stage 10.5 — PM manual-match + field-fit reconciliation UI
Deferred. Field-fit is now chief-side flagged; PM gets that data automatically. Decide during Stage 12.1.7 whether Phase 1 needs the manual-match UI.

### Stage 11.3 — MorningBrief integration of narratives
Deferred. Decide during Stage 12.1.7 whether Phase 1 needs this.

### Stage 17 — Marketing page + landing page
Deferred to final 2-3 weeks of pre-pilot work. Marketing pages need product proof points, testimonials, and final positioning that don't exist yet. Premature to build.

---

## Key Design Decisions (Locked)

- **Tolerance defaults:** horizontal 0.060 ft, vertical 0.030 ft (firm-level configurable; columns exist on `firms` table)
- **Feature-code grammar (design side):** `FEATURE-OFFSET-STAKETYPE` (PM intent)
- **As-staked code grammar (field side):** SOS v1 (chief input)
- **PM sets WHAT to stake; chief decides HOW in field**
- **Vertical QC populated** for offset shots (Stage 10.2 onward)
- **Status enum at DB:** draft → sent → in_progress → submitted → reconciled (eventual rename to `reviewed`)
- **UX vocabulary:** "reconcile" dropped in crew-facing copy; codebase has drift
- **Pricing positioning:** Stakeout QC is premium feature of top tier
- **Layout concerns at consumer-page level only**
- **Crew UX principle: incognito time tracking** — DB captures timestamps; UI hides them from chiefs
- **Crew detail plan view removed** — Trimble Access owns field navigation
- **Role-based routing (not viewport-based)**
- **SurveyOS defines its own input formats** — SOS grammar, future per-firm custom parsers as paid implementations
- **Adaptive Submit button visual weight** based on out_of_tol count
- **Chief field-fit flagging is post-upload, in app** — never in code string
- **`projects.assigned_to` is Party Chief, not Lead PM** — `lead_pm_id` added in 12.1.5 for Licensed PM ownership
- **`scope` is multi-select jsonb, not project_type enum** — UI behavior derives from scope contents
- **Stakeout QC is one workflow within SurveyOS, not the center** — SurveyOS is the OS for ALL of small-firm surveying
- **Real MRR is $0** — no real customers; all "design partner" figures were simulated demo data
- **Canonical project terminology: "Project" (not Deployment, not Job)** — locked 2026-04-29
- **Polish-as-we-go for UI improvements** — Stitch polish items applied opportunistically during planned feature edits, not in dedicated polish-only stages until Stage 13
- **Marketing page deferred to final 2-3 weeks** — premature optimization until product is real
- **PM role has firm-wide project write access** in Phase 1 — small-firm friendly; will scope to lead_pm_id-based when multi-PM firms become paying customers (Phase 2)
- **Tag a baseline before any major polish/architecture milestone** — `git tag -a baseline/<name>` is cheap insurance against UI/UX regressions you can't easily roll back

---

## Lessons Banked (Technical)

- **Wheel zoom + React + Safari:** `onWheel` is passive by default; attach via `useEffect` + `addEventListener` with `{ passive: false }`
- **Ancestor scroll containers fight for wheel events.** Use `overscroll-behavior: contain`
- **Overlay UI inside a canvas needs scroll bypass** via `data-canvas-scroll-region` + `closest()`
- **Empty-state early return breaks refs.** Always mount wrapper, conditionally render content inside
- **Functional setState calling callbacks during render = infinite loop.** Use imperative setState
- **Empty `useEffect` deps + ref-based reads = correct pattern for once-per-mount listeners**
- **React 18 StrictMode mounts twice in dev.** Cleanup handlers matter
- **Zero-consumer-change integration pattern** when extending shared components
- **Layout concerns don't belong inside shared components**
- **Find-point parent toggle pattern** (re-capture anchorRect every click)
- **Log-scale zoom-responsive sizing** with floor at 1x
- **Label AABB collision, first-render-wins** sorted by point_id
- **SVG text at deep zoom is a Safari trap** (sub-pixel text refusal)
- **Supabase silent UPDATE failure under RLS** (no UPDATE policy → returns null/0 rows)
- **Optimistic list UI + parent refresh = flicker.** Local state alone if child handles persistence
- **env() safe-area padding requires `viewport-fit=cover`**
- **Incognito time tracking principle for field users**
- **Define the input format, don't accommodate the mess**
- **Parser grammar design: single separator + colon for "between"**
- **Dev-mode gating discipline: triple-layer gate**
- **Legacy CHECK constraints from earlier stages can block new schema.** Migration 16 dropped CHECKs incompatible with new column semantics.
- **Schema introspection beats guessing.** Run `information_schema.columns` query to know what's really in the DB.
- **Trigger functions can be modified additively via CREATE OR REPLACE FUNCTION.** Migration 17 preserved every existing protection while adding a permissive case.
- **Workarounds for schema constraints become tech debt.** Prefer immediate schema fixes over UI-layer workarounds when the constraint conflicts with new product requirements.
- **Supabase SQL Editor runs as service role.** Triggers don't fire for editor queries; UI-driven testing is the only definitive trigger validation path.
- **Schema drift is silent and compounding.** Production columns added directly without migrations create reproducibility gaps. Audit periodically with `information_schema.columns`.
- **Multi-tenant RLS is non-negotiable for pilot.** Tables without policies are cross-firm leaks waiting to happen.
- **Single column carrying two meanings is a bug, not a feature.** `projects.assigned_to` doing double duty as Party Chief AND Lead PM created Stage 12.1's flaw. Add a separate column rather than overload an existing one.
- **One persona per detail surface.** DispatchProjectDrawer's 1500-line, 4-persona drawer is a code smell. CrewAssignmentDetail's focused 400-line surface is the model.
- **Specs that already capture multi-select reality (like scope) shouldn't be replaced with single-select enums.** Real surveying projects span multiple scopes; the schema correctly represents this. Routing logic should consume the array, not require a separate type field.
- **Sandbox RLS policies that grant ALL to authenticated can render RLS useless if simply enabled.** Drop them before adding restrictive policies, or the new policies provide no security.
- **`SECURITY DEFINER` helper functions with locked search_path bypass RLS during execution.** Reuse them in policies instead of writing inline subqueries that risk RLS recursion.
- **Composite-key cascade requires a trigger, not FK constraint.** When child table refers to parent by `(a, b)` rather than direct FK, ON DELETE CASCADE doesn't fire. Use AFTER DELETE trigger.
- **Don't half-implement UI polish.** Half-done UI broadcasts "in transition" and creates inconsistency debt worse than untouched legacy. Either do the full surface or log it for later.
- **Polish-as-we-go works only with the discipline NOT to open files purely to polish.** If touching for functional reason, polish in same commit. Otherwise log and move on.
- **Tag a baseline before any major polish/architecture milestone.** `git tag -a baseline/<name>` before Stage 14 (assignments generalization), Stage 15 (ProjectDetail rebuild), pre-pilot polish pushes, or any change that touches >5 files visually. Tags are free, durable, and let any future "I liked the old version of X" moment resolve via `git diff baseline/<name> -- <file>` instead of git archaeology. Push tags explicitly with `git push origin <tagname>` — `git push` does not push tags by default.
- **Branch hygiene compounds.** A feature branch that doesn't get merged back becomes the de facto trunk over time. Stage 8 → Stage 12 was 4+ months on `feature/stakeout-qc` because no merge gate existed. Schedule branch hygiene at stage transitions, not as a side task.
- **Schema field name mismatches surface at the SQL level, not the build level.** Claude Code can write a component that builds clean and runs against the wrong column name. The build passes; the component errors at runtime. `information_schema.columns` queries upfront prevent this. Always verify column names against the live schema, not against migration intent.

---

## Intellectual Property Strategy

Reviewed during Stage 10 scoping. **Patents not pursued during Phase 1.** Real moat is execution velocity + domain expertise + customer relationships. Most defensible angle is the per-chief-accuracy → AI-crew-dispatch pipeline; consider provisional patent when that algorithm crystallizes in Stage 14+. Journal acts as prior-use evidence.

---

## Known Bugs / Tech Debt (Tracked for Stage 13)

### Bugs (post-12.1.5)

- **[BUG]** Mobile schedule editor in DispatchProjectDrawer doesn't preserve span length when start date changes (desktop drag uses `shiftSpan`; mobile editor doesn't).
- **[BUG]** `EndOfDaySummary` modal uses `project.scope` (project-type categories) as "tasks completed today" — semantic miss.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`.
- **[BUG]** Orphaned `assigned_to = c340c25a-5f8e-4445-8bef-8452c00a7a27` (deleted user) on Project1_Test and Verrado_260330 — both archived in 12.1.5, off active surfaces.
- **[BUG]** Console error `column consumables_log.material does not exist` from a dead view (likely NetworkOps, FieldLogs, EquipmentLogistics, or similar). Surfaced during Stage 12.1.7 S1 smoke test. Logged to dead-file cleanup backlog.

### Tech debt

- **[TECH DEBT]** `feature/stakeout-qc` branch is the de facto trunk despite the StakeoutQC-scoped name; `main` is stale. See Stage 13 Branch Hygiene Runbook for cleanup procedure.
- **[TECH DEBT]** `feature/stakeout-qc-85b-polish-wip` is an abandoned branch from Stage 8.5b. Delete during Stage 13 branch hygiene.
- **[TECH DEBT]** `AssignmentDetail.jsx` at ~1570 lines. `DesignPointsPlanView.jsx` at ~1500 lines. `DispatchProjectDrawer` (inside DispatchBoard.jsx) at ~1500 lines. Refactor candidates.
- **[TECH DEBT]** `DispatchProjectDrawer` serves 4 personas in one component — split as part of Stage 14/15 ProjectDetail rebuild.
- **[TECH DEBT]** Two Supabase client import patterns coexist (direct vs prop-drilled).
- **[TECH DEBT]** Two `parseStakeCode` functions — different domains, no collision but worth unifying.
- **[TECH DEBT]** `displayCrews` filter inconsistent between DispatchBoard and CommandCenter.
- **[TECH DEBT]** Hand-rolled test harnesses (parser, matcher, csv) — Vitest wrapper deferred.
- **[TECH DEBT]** AssignmentDetail design points table renders all rows (488 in test data). Add pagination ~50/page.
- **[TECH DEBT]** Two competing drawer patterns in CommandCenter (DispatchProjectDrawer vs IntelligenceDrawer).
- **[TECH DEBT]** `CommandCenter.isAdminOrOwner` includes `pm` role — misleading naming.
- **[TECH DEBT]** `equipment.id` is `bigint`, everything else uuid. `equipment.assigned_to` is `text`, not uuid FK.
- **[TECH DEBT]** Status columns are text, not Postgres enums. Typos won't error.
- **[TECH DEBT]** `user_profiles.role` lacks a CHECK constraint — accepts any string.
- **[TECH DEBT]** Assignment-level `client_contact_name` and `client_contact_phone` (Migration 13) duplicated by project-level columns added in Migration 20. Migrate up + drop assignment-level cols.
- **[TECH DEBT]** Recent Invoices status pill pattern (Stage 12.1.7 S1) is intentionally local to RecentInvoicesPanel. Lift to a shared phase-aware status pill component when the next 12.1.7 surface needs the same pattern.

### Deferred UX/visual polish (Stage 13)

- **[DEFERRED VISUAL]** Crew bottom nav has gap below tab buttons. `env(safe-area-inset-bottom)` over-reserving.
- **[DEFERRED VISUAL]** Grid styling tiered-line evaluation
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom in Safari (sub-pixel text)
- **[DEFERRED VISUAL]** QC narrative block needs more visual emphasis
- **[DEFERRED VISUAL]** Recent Invoices placement (currently below map in left column) will move to its eventual full-width position when the financial-strip overhaul session ships.
- **[DEFERRED UX]** Stacked points UX (control + check shots at same location)
- **[DEFERRED UX]** "Controls off-view" indicator
- **[DEFERRED UX]** Control points non-selectable for assignment
- **[DEFERRED UX]** Submitted state in CrewAssignmentDetail has no action footer (Back button only via top nav)
- **[DEFERRED UX]** Recent Invoices click opens DispatchProjectDrawer in dispatch-PM mode. For invoice-stage projects, the dispatch-shaped fields are largely irrelevant. Resolves naturally when Stage 15 ProjectDetail rebuild ships. Don't route invoice clicks elsewhere until then — every project entry point hits the same drawer.

### Deferred features (Stage 13 / Phase 2)

- **[DEFERRED FEATURE]** "Export controls to CSV" button
- **[DEFERRED FEATURE]** Project snapshot PNG export on chief submit (timesheet + disguised time log)
- **[DEFERRED FEATURE]** PM-side scope checklist authoring in AssignmentBuilder
- **[DEFERRED FEATURE]** PDF attachment area on crew assignment detail (replacing removed plan view)
- **[DEFERRED FEATURE]** Photo capture on chief staking assignment detail
- **[DEFERRED FEATURE]** Equipment readout for chief on assignment detail
- **[DEFERRED FEATURE]** `started_at` timestamp on assignment Start (parity with dispatch drawer)
- **[DEFERRED FEATURE]** GPS lat/lon tracking of "Start work" tap
- **[DEFERRED FEATURE]** Direction inference / confirmation UX for point-feature offsets
- **[DEFERRED FEATURE]** Undo path from `submitted` state in CrewAssignmentDetail
- **[DEFERRED FEATURE]** AssignmentBuilder CSV upload (PM exports daily staking points)
- **[DEFERRED FEATURE]** "View All" affordance on Recent Invoices section (depends on Stage 15 ProjectDetail to have somewhere worth navigating to)

### Deferred security

- **[SECURITY DEFERRED]** 3 remaining `Sandbox Master *` policies on `stakeout_*_points` / time / consumables tables. Scope or remove before first paying pilot.

### Dead file cleanup (Stage 13)

- `src/views/NetworkOps.jsx` — confirmed dead Stage 8 PWA scaffolding
- `src/views/LiveView.jsx` — likely Stage 8 dead
- `src/views/FieldLogs.jsx` — possibly superseded by drawer's Field Log section
- `src/views/ProfitAnalytics.jsx` — possibly mocked Stage 8 work
- `src/views/EquipmentLogistics.jsx` — possibly the original Equipment page
- `src/views/ProjectVault.jsx` AND `src/components/ProjectVault.jsx` — duplicate names, drift
- `src/views/TodaysWork.jsx` — confirmed unreachable for field_crew users
- `src/views/MobileCrewView.jsx` — confirmed unreachable
- Whichever view references `consumables_log.material` (a column that doesn't exist) — surfaced as a console error during 12.1.7 S1

---

## Phase 2 Feature Requests

- **Firm-level custom feature code libraries**
- **Firm-level custom SOS parser** for legacy as-staked conventions (~2 days per firm)
- **Role-scoped dashboards** (PM persona work continues post-Stage-12.1.5)
- **Feature-code color visibility in QC view**
- **Per-chief accuracy intelligence + AI crew-to-project matching** — most defensible IP angle
- **Predictive staking CV** — Intelligence Layer add-on
- **Direction inference / confirmation UX for point-feature offsets**
- **Stage 14: `assignments` generalization** — extend `stakeout_assignments` concept beyond staking
- **Stage 15: ProjectDetail page** — scope-aware, replaces DispatchProjectDrawer's PM-detail role
- **Subscription billing wiring** — `firms.subscription_*` columns exist but unused
- **Real Equipment + Team Roster pages** — currently mocked
- **Excel bidirectional sync**
- **AI portfolio advisory**
- **Per-PM RLS scoping** — replace firm-wide PM project access with `lead_pm_id = auth.uid()` OR explicit cross-PM permission, when multi-PM firms become paying customers

---

## PM Persona Gap (Resolved as of 12.1.5; Phase 2 evolution noted)

Stage 12.1 built scaffolding on a flawed `assigned_to` foundation. Stage 12.1.5 fixed via `lead_pm_id` column + RLS hardening. Stage 12.2 (after 12.1.7) adds financial snapshot. Stage 12.3 (post-Stage-14) adds ProjectDetail navigation. Phase 2 evolution: scope PM project access from firm-wide to `lead_pm_id`-based when multi-PM firms become paying customers.

---

## Key People & Resources

**Drew — CEO of Focus School Software.** SaaS operator. Recommends sell-now; Theo committed to Phase 1 MVP first. Strategic counterweight for sales/timing tradeoffs.

---

## AI Dev Workflow

**Multi-tool architecture:** Claude web chat (strategy + prompt-writing), Claude Code CLI (autonomous coding), Gemini (research), Google Stitch (UI design exploration).

**Prompt discipline:** what to read first, what to deliver, specific constraints, explicit regression checks, report-when-done structure. One prompt = one paste; embedded code fences are instructions.

**Partner-mode (not tutor-mode):** direct pushback both ways, concise responses, surface counterweights.

**Commit discipline:** smaller increments, descriptive messages naming stage + what shipped, push at sub-stage boundaries, revert cleanly when cross-view regressions appear.

**Verification per build step:** Every commit ships with its verification artifact. Schema changes verify via SQL queries on the linked DB. Code changes verify via `npm run build` plus a smoke check (DB readback or scoped UI exercise). Edge Functions verify via end-to-end trigger from a real auth context. RLS changes verify via cross-firm leak attempt or auth-context regression test. No commit lands without its verification result captured in the commit body or the session log.

**Options-then-recommendation for non-trivial decisions:** When suggesting an architectural decision, feature scoping, migration approach, UX pattern, or refactor strategy, present 2–4 options with explicit tradeoffs, then recommend one with reasoning. Mechanical execution is exempt — direct action is fine for known-shape edits.

**UI design exploration via Stitch:** Use Google Stitch as a third-party design check for major surfaces. Run with explicit SurveyOS context (surveying-domain language, Stakeout QC as category-defining, Mon-Sat working week, named operator personality). Compare output to current build, identify "steal these" vs "keep ours" items, log polish work to apply opportunistically during planned edits.

---

## Session Log

### 2026-04-29 (evening) — Stage 12.1.7 Session 1 Shipped (Recent Invoices)

**What shipped:** Recent Invoices section on CommandCenter. Single commit `c6572f9` on `feature/stakeout-qc`, pushed.

**Component:** `RecentInvoicesPanel` (defined inline in CommandCenter.jsx, lines ~107). Fetches 5 most recent projects where `invoice_status IN ('paid','sent','overdue','draft')`, ordered by `created_at DESC`. Renders project name (truncated), USD-formatted amount (right-aligned), and a status pill below in mono caps with semantic accent colors (PAID teal, SENT white, OVERDUE amber, DRAFT muted gray).

**States verified:** populated state with three test rows (8.5A_TESTING $12,450 PAID, StakeoutTest $8,200 SENT, Kimley Marketing $4,750 OVERDUE), empty state ("No invoices yet."), loading skeleton, error state.

**Click handler:** reuses `setDrawerProject` — same setter project list rows use to open DispatchProjectDrawer. Confirmed visually that clicking an invoice row opens the drawer with the matching project.

**Polish applied opportunistically:** local instrument-feel pill pattern (3px radius, mono caps, transparent fill, accent-colored 1px border + text). Intentionally local to RecentInvoicesPanel for now; will be lifted to a shared phase-aware status pill component when the next 12.1.7 surface needs the same pattern.

**Deviations from spec:**
- Filter is `.in('invoice_status', ['paid','sent','overdue','draft'])` instead of `IS NOT NULL`. Migration 20 sets `invoice_status DEFAULT 'unbilled'`, so `IS NOT NULL` would surface every project. The whitelist is the correct semantic.
- Order by `created_at DESC` (`updated_at` doesn't exist on `projects`).
- Section placement: deferred. Currently renders below the map in the left column. Will move to its eventual full-width position near the financial strip when the financial-strip overhaul session ships (planned 12.1.7 follow-up).

**Pre-existing bug surfaced (not Session 1's responsibility):** console error `column consumables_log.material does not exist` from one of the dead views (likely NetworkOps, FieldLogs, EquipmentLogistics, or similar Stage 13 cleanup target). Logged to Stage 13 dead-file cleanup backlog.

**UX gap surfaced (not Session 1's responsibility):** clicking a Recent Invoices row opens DispatchProjectDrawer in dispatch-PM mode (Crew/Equipment/Scope/Generate Invoice). For invoice-stage projects (Kimley Marketing, overdue), the dispatch-shaped fields are largely irrelevant. This is the existing app behavior — every project click on CommandCenter and every holding-queue card click on Dispatch Board lands in the same legacy drawer. Resolution path: Stage 14 (`assignments` generalization) retires the drawer's daily-scheduling role; Stage 15 (ProjectDetail rebuild) provides the scope-aware destination invoice clicks should eventually land on. Don't route invoice clicks elsewhere until Stage 15.

**Build pass:** `✓ built in 5.04s`, zero new warnings.

**Baseline tag created:** `baseline/pre-polish-2026-04-29` at `c6572f9`, pushed to origin. Captures the UI/UX state before Stage 12.1.7 polish-as-we-go work begins to accumulate. Allows future `git diff baseline/pre-polish-2026-04-29 -- <file>` for any "I liked the old version" recovery without git archaeology.

**Branch hygiene noted:** `feature/stakeout-qc` is the de facto trunk; `main` is stale. Stage 13 Branch Hygiene Runbook added to journal as a front-loaded Stage 13 task.

**Next session opens with:** Stage 12.1.7 Session 2. Highest-leverage candidate is Active Projects by Type panel on CommandCenter (schema-free, uses existing `projects.scope` jsonb, communicates "OS for ALL surveying" message at a glance). Same surface as Session 1, allows section-header consistency polish in the same neighborhood.

---

### 2026-04-29 — Stitch UI Audit (NO CODE SHIPPED)

**What this session was:** Used Google Stitch to generate alternative UI designs for major SurveyOS surfaces (CommandCenter, Dispatch, Projects list, Project Detail with QC scoreboard). Reviewed against current build. Identified specific polish wins worth porting and patterns to keep.

**Stitch v1 surfaces reviewed:**
- CommandCenter
- Dispatch Board (Weekly Dispatch Matrix)
- Project Detail with QC scoreboard (slide-over panel pattern)
- Projects list view

**Key takeaways:**

1. **Stitch's financial header is sharper than current.** Replace generic Revenue/Costs/Profit/Margin/Projects with Revenue YTD / WIP / AR > 30 Days / Crew Utilization. Bloomberg-grade signals owners actually care about.

2. **"Active Projects by Type" panel is a strategic win.** Horizontal bar list grouped by `scope` jsonb. Communicates "OS for ALL surveying" at a glance — exactly the message Stage 12.1.5 audit revealed was missing.

3. **Recent Invoices section makes the FinTech wedge visible.** Status pills (PAID / SENT / OVERDUE / DRAFT) using existing `invoice_status` and `invoice_amount` columns. ✅ Shipped 12.1.7 S1.

4. **Hero stat treatment for QC scoreboards.** Big dramatic numbers (1,204 in / 18 out) with tolerance readout next to it. More visceral than current treatment.

5. **Stitch missed Stakeout QC universally.** Across all surfaces, never put Stakeout QC in the sidebar nav. Prompt didn't emphasize it strongly enough; v2 prompt would correct this.

6. **Stitch reverted to generic SaaS terminology** (Dashboard / Projects / Dispatch / Financials / Crew Management / Settings) when the prompt didn't pin specifics. Keep SurveyOS's surveying-domain sidebar.

7. **Stitch designed only desktop surfaces.** No mobile crew app. v2 prompt would specify the field-first chief experience as a separate persona.

**Decisions locked:**

- **Canonical project terminology: "Project" (not "Deployment", not "Job").** Use across all user-facing copy.
- **Polish-as-we-go strategy.** Apply Stitch polish items opportunistically during planned feature edits in Stage 12.1.7+. Don't open files purely to polish. Don't half-implement.
- **Marketing page deferred to final 2-3 weeks of pre-pilot work** (Stage 17). Premature optimization until product is real and proof points exist.
- **Stage 12.1.7 = Stitch polish + functional integrations.** Foundation correct (12.1.5 shipped), ready to build functional integrations on top while applying polish opportunistically.

**Drafted but not used:**

- Stitch v2 prompt (full ~1200-word brief with surveying-domain emphasis, Stakeout QC prominence, mobile crew persona, Mon-Sat week, named operator). Lives in chat history; can rerun in a fresh Stitch session if desired.
- "Brief context" version for Grok / other LLM use. Lives in chat history.

**No commits this session.** Audit and planning only.

**Open for next session:** Stage 12.1.7. Pick functional integration target (highest-leverage candidates: Recent Invoices section + Active Projects by Type panel, both schema-free). Apply opportunistic Stitch polish on touched files. Marketing/landing page work waits for Stage 17.

---

### 2026-04-28 — Stage 12.1.5 Shipped (Schema Correctness + Foundation Fix)

**What this session was:** Executed the full Stage 12.1.5 plan from the earlier 2026-04-28 audit. Six numbered migration files (four schema/policy, two data-record) plus code updates and test-data hygiene. Foundation work complete; Phase 1 unblocked for Stage 12.1.7+ feature work.

**Migrations applied:** See Stage 12.1.5 reference doc above for full breakdown of Migrations 20, 20a, 21, 22, 23, 24.

**Manual UI verification:**
- Lead PM dropdown rendering, role filter, firm scoping, default-to-current-user, and priority dropdown all confirmed via UI exercise. Throwaway project MODAL_TEST_DELETE_ME submitted cleanly with `lead_pm_id` populated by a real PM UUID and `priority='standard'`. Multi-PM firms first-class supported.
- Edge Function regression test for Migration 21: theo regenerated narrative on 8.5A_TESTING / "8.5_TESTING" run; returned 200, body content changed (real Anthropic regeneration), zero RLS errors. Office-role auth context verified. Chief-side path deferred — Andrew has zero `stakeout_assignments` rows because dispatch never creates them; chief-side regression check waits on Stage 14.

**Schema findings from Step 0 audit:** See Stage 12.1.5 reference doc for full breakdown.

**Commits this session (7 total, `33e3419..6a529ab`):**
- `d0b89ef` Migration 20 schema sync
- `c7b477a` Migration 20a backfill
- `14eb13c` Migration 21 RLS hardening
- `d0cb8d6` Migration 22 party_chief write whitelist
- `908c6c2` Migration 23 qc_points CASCADE fix
- `a611100` Step 6 code updates (LicensedPmDashboard, DeploymentModal, comments)
- `6a529ab` Step 7 test data hygiene

---

### 2026-04-28 — Audit + Replan (NO CODE SHIPPED)

**What this session was:** Paused all builds. Audited every major surface in the app + ran SQL introspection on production schema. Goal was to know exactly what's built, what's broken, what's hollow, and what the real path to "Phase 1 ready for design partner" looks like.

**Surfaces audited:**
- CommandCenter
- DeploymentModal
- DispatchBoard + DispatchProjectDrawer
- CrewApp + CrewAssignmentDetail
- LicensedPmDashboard (referenced from prior session)

**Schema audited:** Full `information_schema.columns` query on `projects`, `user_profiles`, `firms`, `stakeout_assignments`, `stakeout_design_points`, `stakeout_qc_runs`, `stakeout_qc_points`, `stakeout_qc_narratives`, `crew_unavailability`, `equipment`.

**Critical findings:**
1. `projects.assigned_to` is the Party Chief column, not Lead PM.
2. ~17 columns drift on `projects` table.
3. `priority` value sent by DeploymentModal silently dropped.
4. `address` referenced by DispatchProjectDrawer; no DB column.
5. RLS unrestricted on critical tables.
6. `party_chief` UPDATE permission too broad.
7. DispatchProjectDrawer is 1500 lines doing 4 personas' work.
8. `scope` correctly multi-select.
9. `stakeout_assignments` already uses correct `party_chief_id` naming.
10. `firms` has rich subscription/billing infrastructure already.

**Decisions locked:**
- Add `lead_pm_id` column for Licensed PM ownership; keep `assigned_to` as Party Chief.
- Don't add `project_type` enum; use `scope` array contents to drive routing.
- Generalize `stakeout_assignments` → `assignments` for all project types (Stage 14).
- Stage 12.1.5 (Schema Correctness Pass) is the next stage. Don't ship features until it lands.

**No commits this session.**

---

### 2026-04-27 / 2026-04-25 — Stages 11.1, 11.2, 12.1, 12.1.1

(Earlier sessions — see prior journal entries and commits `9eb26ab`, `8106f26`, `71f400c`, `bc0ce16` for full detail.)

---

### 2026-04-25 (late evening) — Stage 10.4 + 10.4.5 functionally complete

(Stages 10.1 through 10.4.5 shipped. Phase 1 Stakeout QC core loop functionally complete.)

---

### 2026-04-24 — Stage 10.1, 10.2, 10.3, 10.3.5

(Earlier sessions — see prior journal entries for full detail.)

---

### 2026-04-23 / 2026-04-22 — Stage 8.5b-polish + earlier

(See prior journal entries for full detail.)

---

## End-of-Session Protocol

When closing a chat session, before starting a new one, update this file with:

1. **Session Log entry** — dated, what shipped, what was attempted, what's open
2. **Current State** section — branch, commit, environment, next action
3. **Phase 1 Roadmap** table — update status column for any stages completed
4. **Known Bugs** — add any new bugs discovered
5. **Phase 2 Feature Requests** — add any new deferred features
6. **Key Design Decisions** — add any new locked decisions
7. **Lessons Banked** — add any new technical insights
8. **Pricing Framework** — update if tiers, add-ons, or strategy evolve
9. **Baseline tag check** — if this session began a major polish/architecture milestone, confirm `baseline/<name>` was tagged before changes started. If not, tag the parent commit retroactively.

Keep entries concise. Link to commits. Don't duplicate git-captured info; this is for intent, context, deferred decisions, relationship details. Commit the journal update alongside code changes.