# CLAUDE_JOURNAL.md

**Purpose:** This file is the authoritative, living record of SurveyOS project state for any Claude instance (chat or Claude Code) picking up work. It's committed to the repo and updated at the end of major sessions. Read this first; orient fast; execute.

**Usage at session start:**
> Read `CLAUDE_JOURNAL.md`, orient yourself, then continue from the latest session log entry.

**Usage at session end:**
> Update `CLAUDE_JOURNAL.md` with today's session log entry, state changes, new decisions, and any new known bugs. Keep it concise.

---

## ⚠️ READ THIS FIRST IF STARTING A NEW SESSION (2026-04-28)

**Update — late 2026-04-28:** Stage 12.1.5 has now shipped (7 commits ahead of `33e3419`). All six migration files applied, code updates landed, test data archived to three survivors. See **"2026-04-28 — Stage 12.1.5 Shipped"** entry under `## Session Log` for the full picture and decisions. The audit context below is preserved as history. Next session: Stage 12.1.7 (Stitch polish + functional integrations) — foundation is correct, build on it.

---

**Tonight's session was an audit + replan, not a build session.** No code shipped. The audit revealed real foundational issues that change what comes next.

**Critical findings:**
1. `projects.assigned_to` is semantically the **Party Chief**, not the Lead PM. Migration 19 (Stage 12.1) repurposed it for Licensed PM ownership, which conflicts with how DispatchBoard, DeploymentModal, and DispatchProjectDrawer all use it. The Licensed PM dashboard "works" only because test data has the same value in both meanings.
2. **Schema drift on `projects` is real and confirmed** via SQL introspection. ~17 columns exist in production that aren't in any migration file. Production schema is the source of truth; migration files are out of sync.
3. **`scope` is multi-select jsonb, not a project_type enum.** That's correct — real surveying projects span multiple scopes. Routing should derive from scope contents, not from a separate type field.
4. **DispatchProjectDrawer is doing 4 personas' work in one component** and is the de-facto ProjectDetail page. It assumes "project = field deployment," which doesn't fit non-staking project types (boundary, ALTA, topo, etc.).
5. **`stakeout_assignments` already has clean naming** (`party_chief_id`, not `assigned_to`). The semantic confusion is local to the `projects` table.
6. **RLS unrestricted** on `projects`, `user_profiles`, `firms`, several views. Pre-pilot security blocker.

**Next session must start with Stage 12.1.5 (Schema Correctness Pass), not new features.** See "Revised Staging" section below. Don't ship 12.2 (financial snapshot), 12.3 (project nav), or any other feature work until 12.1.5 lands.

---

## Who I Am

**Theo Bower.** Solo founder and developer of SurveyOS under my own business entity. 13+ years field experience in land surveying and AEC work — rod man through Crew Chief, covering boundary surveys, topographic work, construction staking, ALTA/NSPS, as-builts, federal contracting (USFS, Army Corps), and geodetic control. Associate degree in land surveying, bachelor's in economics. FAA Part 107 drone cert. Engaged to Lauren. Based in Old Town Scottsdale, Arizona.

Fluent in the surveying domain — I've run the work, read the spec, staked the curb, submitted the ALTA, gotten the client to pay. The platform I'm building solves problems I've lived.

**My W-2 exit trigger is $15K MRR.** Until then, SurveyOS is evening/weekend work built on a multi-tool AI dev architecture: Claude web chat for strategy, Claude Code CLI for autonomous coding, Gemini for research.

---

## What SurveyOS Is

**Vertical SaaS — the operating system for ALL of small-firm land surveying.** Not just construction staking. Not just dispatch. The whole back office of a 3–20-person surveying firm.

Project types span: boundary surveys, ALTA/NSPS, topographic, as-built, subdivision plat, easement, right-of-way, federal contracting, hydrographic, geodetic control, and construction staking. **Stakeout QC is one workflow within this — important and well-built — but not the center.** Drone/LiDAR complexity is deferred until customers explicitly ask.

**Current build status by capability:**

| Capability | Maturity |
|------------|----------|
| Stakeout QC (chief flow + matcher + scoreboard + narratives) | Real — Stage 10/11 shipped |
| Dispatch board (drag-drop matrix, PTO, multi-day spans) | Real — Stage 9 era, holding up |
| DeploymentModal (project creation) | Real, but `priority` field silently dropped (no DB column) |
| CommandCenter (financial dashboard, project list, map) | Real, but financial figures cite numbers that aren't real customer data |
| Crew app (chief mobile experience) | Real — clean, status-driven |
| Licensed PM dashboard | Built on a flawed semantic foundation (see Critical Findings) |
| ProjectDetail page | Doesn't exist; DispatchProjectDrawer pulling triple duty |
| Equipment, Team Roster, Client Portal | Mocked or shallow |
| Schema correctness | Substantial drift; migrations out of sync with production |
| Security (RLS) | Critical tables unrestricted |

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

---

## Revised Staging (As of 2026-04-28 Audit)

The old linear roadmap (Stage 11 → 12 → 13) is no longer accurate. Tonight's audit revealed foundation issues that have to land before further feature work. Stage numbering preserved where possible; "12.1.5" inserted as a correctness half-step.

| Stage | Description | Status |
|-------|-------------|--------|
| 1–10.4.5 | Schema, parser, matcher, CSV upload, scoreboard, field-fit | ✅ Shipped |
| 11.1 | Claude-generated QC narratives (Edge Function + table) | ✅ Shipped (`9eb26ab`) |
| 11.2 | Narrative regenerate UI + visual polish | ✅ Shipped (`8106f26`) |
| 11.3 | MorningBrief integration of narratives | ⏸ Deferred — decide during Stage 12.1.5 review whether Phase 1 needs this |
| 12.1 | Licensed PM dashboard scaffolding | ✅ Shipped (`71f400c`) — but built on `assigned_to` semantic flaw, fix in 12.1.5 |
| 12.1.1 | LicensedPmDashboard query + routing fix | ✅ Shipped (`bc0ce16`) |
| **12.1.5** | **Schema Correctness + Foundation Fix (NEW — START HERE)** | ⏳ **Next** |
| 12.2 | Financial snapshot strip on Licensed PM dashboard | ⏳ After 12.1.5 |
| 12.3 | ProjectDetail page (scope-aware) + nav from PM dashboard | ⏳ Requires Stage 14 (assignment generalization) — re-scope after 12.1.5 |
| 13 | Polish + testing backlog (UX issues, mobile fixes, terminology cleanup) | ⏳ Pending |
| 14 | Project model generalization (`stakeout_assignments` → general `assignments`) | ⏳ Major architectural change; affects DispatchBoard's "project = deployment" assumption |
| 15 | ProjectDetail page rebuild (depends on Stage 14) | ⏳ Pending |
| 16 | Demo polish + onboarding flow + first-pilot prep | ⏳ Pending |

**Rule going forward:** Don't ship features on top of incorrect schema or unrestricted RLS. Stage 12.1.5 first. Everything else follows.

---

## Stage 12.1.5: Schema Correctness + Foundation Fix (DETAILED)

This is the next stage. Lock in scope here so the next session can execute without re-deriving.

### Migration 20: Schema Sync

**Capture all columns drift on `projects`** (production has columns not in any migration file). Verified via `information_schema.columns` query on 2026-04-28:

Columns in production that need to be migrated in:
- `client_name text DEFAULT 'Internal'`
- `budget_allocated numeric DEFAULT 0`
- `budget_spent numeric DEFAULT 0`
- `hours_estimated numeric DEFAULT 0`
- `hours_actual numeric DEFAULT 0`
- `crew_name text DEFAULT ''`
- `scheduled_day text DEFAULT ''`
- `started_at timestamptz`
- `completed_at timestamptz`
- `reviewed_at timestamptz`
- `assigned_crew uuid[] DEFAULT '{}'`
- `scheduled_end_date date`
- `notes text`
- `location text DEFAULT ''`
- `hide_financials boolean`
- `scope_checklist jsonb DEFAULT '[]'`
- `scope jsonb DEFAULT '[]'`
- `actual_start_time timestamptz`
- `actual_end_time timestamptz`
- `invoice_status text DEFAULT 'unbilled'`
- `invoice_amount numeric DEFAULT 0`
- `fee_type text`
- `required_equipment jsonb`

**New columns to add:**
- `lead_pm_id uuid REFERENCES user_profiles(id)` — Licensed PM ownership (separate from Party Chief)
- `address text` — DispatchProjectDrawer references this; either add or remove the references
- `priority text DEFAULT 'standard'` — DeploymentModal sends this; currently dropped silently. Either add or remove from modal.

**Audit other tables** for similar drift: `user_profiles`, `firms`, `stakeout_assignments`, `equipment`, `crew_unavailability`. Check each against its migration file. Capture drift in same migration if minor; separate migration if major.

### Backfill: Lead PM vs Party Chief

After Migration 20:
- Set `lead_pm_id` on the 4 test projects currently misassigned via `assigned_to = maynard.id`
- Restore `assigned_to` on those 4 projects to a real Party Chief value (Andrew, or unassigned if no chief was originally set)
- Update `LicensedPmDashboard` query to filter by `lead_pm_id` instead of `assigned_to`
- Add Lead PM selector to `DeploymentModal` (between Project Name and Party Chief)
- Document `assigned_to` as Party Chief in code comments throughout

### Migration 21: RLS Hardening

Pre-pilot security must-fix. Tables/views currently unrestricted:
- `projects` (cross-firm leak risk — most critical)
- `user_profiles`
- `firms` (cross-firm leak risk)
- `crew_unavailability`
- `permissions`
- `crew_utilization` view
- `stakeout_qc_summary` view

Each needs RLS policies scoped by `firm_id`. Verify each table has `firm_id` for scoping (firms table itself is the exception — needs different scoping).

### Migration 22: Tighten party_chief writes

`party_chief` UPDATE permission on `stakeout_assignments` currently allows all-column writes. Tighten via DB trigger or RPC to whitelist: `status`, `submitted_at`, `chief_field_notes` only.

### Migration 23: CASCADE bug fix

Stage 7b.1 edit-points removes `stakeout_assignment_points` but doesn't cascade to `stakeout_qc_points`. Add ON DELETE CASCADE on the FK, or trigger that cleans up qc_points when assignment_points are removed.

### Test data hygiene

After migrations:
- Rename test projects (DISP TEST2, FIELD_test, etc.) to clearer names or archive them
- Confirm `8.5A_TESTING` remains the gold-standard fixture (488 design points + real QC data)
- Ensure `assigned_to` only references field-eligible roles in test data

### Code updates required by 12.1.5

- `LicensedPmDashboard.jsx`: filter by `lead_pm_id`
- `DeploymentModal.jsx`: add Lead PM selector, fix `priority` (add to migration or remove from form)
- `DispatchProjectDrawer.jsx`: confirm `address` references resolve correctly post-migration
- Code comment pass: document `assigned_to` semantics on `projects` table (Party Chief, not Lead PM)

### Definition of done for Stage 12.1.5

- [ ] Migration 20 applied; all production columns captured in migration files
- [ ] Migration 21 applied; RLS active on projects, user_profiles, firms, views
- [ ] Migration 22 applied; party_chief writes restricted
- [ ] Migration 23 applied; qc_points CASCADE fixed
- [ ] `lead_pm_id` populated on test projects; `assigned_to` reverted to Party Chief semantics
- [ ] LicensedPmDashboard renders with correct filtering
- [ ] DeploymentModal has Lead PM selector working
- [ ] No silent `priority` drop on project create
- [ ] Test data cleaned up
- [ ] All commits pushed to `feature/stakeout-qc`

This is roughly 2-3 days of focused Claude Code sessions. Maybe 4 separate stage commits. Each migration deserves its own commit.

---

## Audit Findings (2026-04-28)

Captured during a session that paused all builds to audit existing surfaces. Reviewed: CommandCenter, DeploymentModal, DispatchBoard, DispatchProjectDrawer, CrewApp, CrewAssignmentDetail, plus full schema introspection.

### Surface-by-surface findings

**CommandCenter:**
- ✅ Works: greeting header, tab toggle, search bar, financial header, map with pulsing markers, project list with active/review/done sub-tabs, "+ New Deployment" → DeploymentModal
- ⚠️ Hollow: `onProjectSelect` prop destructured but never called; `isAdminOrOwner` actually includes `pm` role (misleading naming)
- ❌ Wrong: two competing drawer patterns (DispatchProjectDrawer for project rows, IntelligenceDrawer for map markers) — code smell

**DeploymentModal:**
- ✅ Works: scope as multi-select array (correct semantics for real surveying); CSV upload to project-photos storage on dispatch; required-field gating
- ⚠️ Hollow: CSV uploaded but no downstream parser into `stakeout_design_points` (separate flow handles design point import); no Lead PM field
- ❌ Wrong: `priority` value sent to DB but no `priority` column exists — silent insert drop; `assigned_to` semantically Party Chief (correct here)

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

**LicensedPmDashboard (Stage 12.1):**
- ✅ Works: greeting, projects list, narrative feed scaffolding, multi-query fetch (assignments → runs → narratives, joined in JS)
- ❌ Wrong: filters by `assigned_to` thinking it means "Lead PM"; semantically wrong because `assigned_to` is Party Chief. Test data happens to have same id in both meanings, masking the issue.

### Schema findings (from production introspection)

Confirmed by SQL on 2026-04-28:

**Drift on `projects`:** ~17 columns exist in production not in any migration file (see Stage 12.1.5 list above for full enumeration).

**`stakeout_assignments` uses correct naming:** `party_chief_id` (not `assigned_to`). The semantic confusion is **local to `projects` table only**, not propagated.

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

## Backlog Reconciliation (2026-04-28)

Sorted into three buckets. Items move between buckets as priorities shift.

### Pre-pilot must-fix (Stage 12.1.5 + Stage 13)

**Schema correctness:**
- Migration 20: capture schema drift on `projects`
- Add `lead_pm_id`; backfill test data; update LicensedPmDashboard query
- Resolve `priority` column gap (add or remove from modal)
- Resolve `address` column gap (add or remove dispatch drawer references)
- Audit drift on other tables (`user_profiles`, `firms`, `stakeout_assignments`, `equipment`, `crew_unavailability`)

**Security:**
- RLS hardening on `projects`, `user_profiles`, `firms`, `crew_unavailability`, `permissions`, views
- Tighten `party_chief` UPDATE on `stakeout_assignments` (column whitelist)
- Stage 7b.1 CASCADE bug (qc_points cleanup when assignment_points removed)

**Stakeout QC completion:**
- Real-data testing pass (chiefs uploading actual SOS-format CSVs from real projects)
- Stage 10.5 (PM manual-match) — decide if Phase 1 needs it
- Stage 11.3 (MorningBrief integration of narratives) — decide if Phase 1 needs it

**Test data hygiene:**
- Rename sloppy test projects (DISP TEST2, FIELD_test, etc.)
- Archive dead test projects
- Ensure `assigned_to` only references Party Chief-eligible roles

### Pre-demo polish (Stage 13)

**Dispatch board:**
- Network Ops deletion (file + nav + route — confirmed dead)
- Test data cleanup visible to anyone clicking around

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

### Phase 2 (post-pilot, real new work)

**Architecture:**
- Stage 14: Generalize `stakeout_assignments` → `assignments` for all project types
- Stage 15: ProjectDetail page (scope-aware, replaces or supplements DispatchProjectDrawer)
- Split DispatchProjectDrawer's 4 personas into focused surfaces
- URL-based deep linking (chief assignment URLs, project URLs)

**PM features:**
- Financial snapshot strip on Licensed PM dashboard (Stage 12.2)
- Per-project budget tracking using `budget_allocated` / `budget_spent` (already in schema)
- AssignmentBuilder CSV upload (PM exports daily staking points)
- Scope checklist authoring (PM creates day-of items)

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

**Dead file cleanup:**
- LiveView, FieldLogs, ProfitAnalytics, EquipmentLogistics, NetworkOps
- ProjectVault (appears in BOTH `src/views/` AND `src/components/` — drift)

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
| 10.5 | PM manual-match | ⏸ Deferred — decide during 12.1.5 |
| 11.1 | Claude-generated QC narratives | ✅ Shipped (`9eb26ab`) |
| 11.2 | Narrative regenerate UI + visual polish | ✅ Shipped (`8106f26`) |
| 11.3 | MorningBrief integration | ⏸ Deferred — decide during 12.1.5 |
| 12.1 | Licensed PM dashboard scaffolding | ✅ Shipped (`71f400c`) — flawed, fix in 12.1.5 |
| 12.1.1 | Routing + query fixes | ✅ Shipped (`bc0ce16`) |
| **12.1.5** | **Schema correctness pass (NEW)** | ⏳ **NEXT** |
| 12.2 | Financial snapshot strip | ⏳ After 12.1.5 |
| 12.3 | ProjectDetail nav | ⏳ Re-scope after 12.1.5; depends on Stage 14 |
| 13 | Polish + testing backlog | ⏳ Pending |
| 14 | Project model generalization | ⏳ Major architectural change |
| 15 | ProjectDetail page rebuild | ⏳ After Stage 14 |
| 16 | Demo polish + onboarding + first-pilot prep | ⏳ Pending |

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
```
<code> := <point_stake> | <line_stake> | <check_shot> | <control_check>
<point_stake>    := <design_id> "-" <offset> "-" <stake_type>        e.g. 4007-5-HUB
<line_stake>     := <design_id> ":" <design_id> "-" <offset> "-" <stake_type>  e.g. 4003:4002-11-NAIL
<check_shot>     := <design_id> "-" "CHK"                             e.g. 4007-CHK
<control_check>  := "CP" "-" "CHK"                                    e.g. CP-CHK
```

Stake types: `HUB, LATHE, NAIL, PK, MAG, PAINT, CP, WHISKER`.
Field-fit reason codes: `OB` (Obstruction), `AC` (Access), `SA` (Safety), `CF` (Conflict), `OT` (Other).

Spec: `docs/sos-stake-code-standard.md`.

### Stage 10 files (summary — see prior journal entries for full detail)

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
Deferred. Field-fit is now chief-side flagged; PM gets that data automatically. Decide during Stage 12.1.5 whether Phase 1 needs the manual-match UI.

### Stage 11.3 — MorningBrief integration of narratives
Deferred. Decide during Stage 12.1.5 whether Phase 1 needs this.

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
- **`projects.assigned_to` is Party Chief, not Lead PM** — `lead_pm_id` will be added in 12.1.5 for Licensed PM ownership
- **`scope` is multi-select jsonb, not project_type enum** — UI behavior derives from scope contents
- **Stakeout QC is one workflow within SurveyOS, not the center** — SurveyOS is the OS for ALL of small-firm surveying
- **Real MRR is $0** — no real customers; all "design partner" figures were simulated demo data

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

---

## Intellectual Property Strategy

Reviewed during Stage 10 scoping. **Patents not pursued during Phase 1.** Real moat is execution velocity + domain expertise + customer relationships. Most defensible angle is the per-chief-accuracy → AI-crew-dispatch pipeline; consider provisional patent when that algorithm crystallizes in Stage 14+. Journal acts as prior-use evidence.

---

## PM Persona Gap (Phase 1.5) — Now Stage 12.1.5 Work

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships need role-scoped dashboards. Stage 12.1 built scaffolding but on a flawed `assigned_to` foundation. Stage 12.1.5 fixes the foundation; Stage 12.2 adds financial snapshot; Stage 12.3 (post-Stage-14) adds ProjectDetail navigation.

---

## Known Bugs / Tech Debt (Tracked for Stage 13)

### Bugs
- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. **→ Migration 23 in Stage 12.1.5.**
- **[BUG]** DeploymentModal sends `priority: 'standard'` to `projects` table but no `priority` column exists. Silent insert drop. **→ Stage 12.1.5 resolution: add column or remove from form.**
- **[BUG]** DispatchProjectDrawer references `project.address` but no `address` column exists on `projects`. Currently fallback-only. **→ Stage 12.1.5 resolution.**
- **[BUG]** Mobile schedule editor in DispatchProjectDrawer doesn't preserve span length when start date changes (desktop drag uses `shiftSpan`; mobile editor doesn't).
- **[BUG]** `EndOfDaySummary` modal uses `project.scope` (project-type categories) as "tasks completed today" — semantic miss.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`.
- **[BUG]** `LicensedPmDashboard` filters projects by `assigned_to` thinking it means Lead PM; actually means Party Chief. **→ Stage 12.1.5 fix via `lead_pm_id`.**

### Tech debt
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

### Deferred UX/visual polish (Stage 13)
- **[DEFERRED VISUAL]** Crew bottom nav has gap below tab buttons. `env(safe-area-inset-bottom)` over-reserving.
- **[DEFERRED VISUAL]** Grid styling tiered-line evaluation
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom in Safari (sub-pixel text)
- **[DEFERRED VISUAL]** QC narrative block needs more visual emphasis
- **[DEFERRED UX]** Stacked points UX (control + check shots at same location)
- **[DEFERRED UX]** "Controls off-view" indicator
- **[DEFERRED UX]** Control points non-selectable for assignment
- **[DEFERRED UX]** Submitted state in CrewAssignmentDetail has no action footer (Back button only via top nav)

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

### Deferred security (→ Stage 12.1.5 must-fix)
- **[SECURITY MUST-FIX]** RLS unrestricted on: `projects`, `user_profiles`, `firms`, `crew_unavailability`, `permissions`, `crew_utilization` view, `stakeout_qc_summary` view.
- **[SECURITY MUST-FIX]** `party_chief` UPDATE on `stakeout_assignments` allows all-column writes; tighten to `status + submitted_at + chief_field_notes` only.
- **[DEFERRED SECURITY]** Sandbox RLS policies — `Sandbox Master` policies grant ALL to `authenticated`. Scope or remove before first paying pilot.

### Dead file cleanup (Stage 13)
- `src/views/NetworkOps.jsx` — confirmed dead Stage 8 PWA scaffolding
- `src/views/LiveView.jsx` — likely Stage 8 dead
- `src/views/FieldLogs.jsx` — possibly superseded by drawer's Field Log section
- `src/views/ProfitAnalytics.jsx` — possibly mocked Stage 8 work
- `src/views/EquipmentLogistics.jsx` — possibly the original Equipment page
- `src/views/ProjectVault.jsx` AND `src/components/ProjectVault.jsx` — duplicate names, drift

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

---

## Key People & Resources

**Drew — CEO of Focus School Software.** SaaS operator. Recommends sell-now; Theo committed to Phase 1 MVP first. Strategic counterweight for sales/timing tradeoffs.

---

## AI Dev Workflow

**Multi-tool architecture:** Claude web chat (strategy + prompt-writing), Claude Code CLI (autonomous coding), Gemini (research).

**Prompt discipline:** what to read first, what to deliver, specific constraints, explicit regression checks, report-when-done structure. One prompt = one paste; embedded code fences are instructions.

**Partner-mode (not tutor-mode):** direct pushback both ways, concise responses, surface counterweights.

**Commit discipline:** smaller increments, descriptive messages naming stage + what shipped, push at sub-stage boundaries, revert cleanly when cross-view regressions appear.

**Verification per build step:** Every commit ships with its verification artifact. Schema changes verify via SQL queries on the linked DB. Code changes verify via `npm run build` plus a smoke check (DB readback or scoped UI exercise). Edge Functions verify via end-to-end trigger from a real auth context. RLS changes verify via cross-firm leak attempt or auth-context regression test. No commit lands without its verification result captured in the commit body or the session log.

**Options-then-recommendation for non-trivial decisions:** When suggesting an architectural decision, feature scoping, migration approach, UX pattern, or refactor strategy, present 2–4 options with explicit tradeoffs, then recommend one with reasoning. Mechanical execution is exempt — direct action is fine for known-shape edits.

---

## Session Log

### 2026-04-28 — Stage 12.1.5 Shipped (Schema Correctness + Foundation Fix)

**What this session was:** Executed the full Stage 12.1.5 plan from the earlier 2026-04-28 audit. Six numbered migration files (four schema/policy, two data-record) plus code updates and test-data hygiene. Foundation work complete; Phase 1 unblocked for Stage 12.1.7+ feature work.

**Migrations applied (six numbered files; idempotent against production):**

- **20** schema sync — captured 23 columns of drift on `projects` (IF NOT EXISTS, no-op against prod), added `lead_pm_id`, `address`, `priority`, `client_contact_name`, `client_contact_phone` on `projects`, `pm_site_notes` on `stakeout_assignments`, folded in 2-column drift on `user_profiles` (`certifications`, `assigned_equipment` text[]). Reversed Migration 19's `assigned_to` comment back to "Party Chief, NOT Licensed PM."
- **20a** backfill — restored `assigned_to = Andrew` (Party Chief, field_crew) and set `lead_pm_id = Maynard` (Licensed PM, pm) on the four ex-Migration-19 projects. Corrected the 5th misassigned project surfaced during Step 0 (TEST_260402, theo as owner) to `assigned_to = NULL, lead_pm_id = theo`.
- **21** RLS hardening — dropped `Sandbox Master Projects` and `Sandbox Master Profile Policy` (would have rendered RLS useless if simply enabled), dropped legacy inline-subquery policies, added `Office roles manage firm projects` (owner/admin/pm) and `Firm mates read profiles`, enabled RLS on `projects` and `user_profiles`, applied `security_invoker = true` to `crew_utilization` and `stakeout_qc_summary` views.
- **22** party_chief write whitelist — BEFORE UPDATE trigger restricting chief writes (party_chief + field_crew) to `status, submitted_at, chief_field_notes` only. 25 column checks enumerated explicitly.
- **23** qc_points CASCADE fix — AFTER DELETE trigger on `stakeout_assignment_points` cleans matching qc_points by composite key (no direct FK exists). Verified destructively on a StakeoutTest assignment (asgn 6→5, qc 6→5, target qc 1→0).
- **24** test data archive — preserved 8.5A_TESTING (gold-standard fixture: 513 design pts, 488 asgn pts, 1 run, 6 qc pts), StakeoutTest (10 / 9 / 41 / 2 / 9), Kimley Marketing (real client name kept for future demo, no fixture data). Archived 15 sloppy fixtures.

(The original audit predicted four migrations (20–23). 20a and 24 are data-only operations recorded as numbered migration files for git-history preservation, matching the project's established pattern from Migration 19. Not scope creep.)

**Code updates:**

- `LicensedPmDashboard.jsx` — query filters `lead_pm_id` instead of `assigned_to`. Maynard's portfolio rendering verified via smoke test (4 backfilled projects appear).
- `DeploymentModal.jsx` — Lead PM selector added between Project Name and Location. Filtered to `role IN ('owner','pm')`, firm-scoped via `teamMembers` (already firm-filtered upstream). Defaults to current user when their role is owner/pm; otherwise explicit pick required (no chief is silently written into `lead_pm_id`). Priority swapped from 2-option toggle (standard/critical) to 3-option select (low/standard/high). Both fields persist into the projects insert. Removed orphaned `Zap` import + `PriorityButton` sub-component.
- `CommandCenter.jsx` — passes `profile` to DeploymentModal so the Lead PM default can evaluate.
- `App.jsx` — `handleCreateProject` now forwards `lead_pm_id` and `priority` from the modal payload into the projects insert. The wire that was previously silently dropping priority is now connected.
- `DispatchBoard.jsx` — semantic comments at `getCrewId`, drag-drop handler, mobile assign/unschedule editor, and CrewAvatarStack header. `project?.address` references verified null-safe via existing `|| project?.location` fallback; no functional change.
- `MorningBrief.jsx` — semantic comment at `getCrewId` helper.
- Skipped `TodaysWork.jsx` and `EquipmentLogistics.jsx` per the rule — both reference `equipment.assigned_to` (text first-name string), not `projects.assigned_to`.

**Manual UI verification (Step 6 + Step B):**

- Lead PM dropdown rendering, role filter (`role IN ('owner','pm')`), firm scoping, default-to-current-user (theo as owner), and priority dropdown all confirmed via UI exercise. Throwaway project MODAL_TEST_DELETE_ME (later archived in Migration 24) submitted cleanly with `lead_pm_id` populated by a real PM UUID and `priority='standard'`. Multi-PM firms first-class supported.
- Edge Function regression test for Migration 21: theo regenerated narrative on 8.5A_TESTING / "8.5_TESTING" run (run_id `e000ec1f-...`); returned 200, body content changed (real Anthropic regeneration, not a stale cache), zero RLS errors in console or Edge Function logs. **Office-role auth context verified.** Chief-side path (Andrew submitting fresh QC upload) deferred — Andrew has zero `stakeout_assignments` rows because dispatch never creates them; chief-side regression check waits on Stage 14.

**Schema findings from Step 0 audit:**

- Postgres 17.6 → `security_invoker` views fully supported (Migration 21 used it).
- Production `user_profiles.role` data has only `field_crew`, `owner`, `pm` — no `party_chief`, `admin`, `cad`, `drafter`, `technician`, `licensed_pm`. CLAUDE.md's broader role list is aspirational. The `permissions` RBAC matrix references all 8 documented roles though, so the gap is on user-data side, not the matrix.
- 23-column drift on `projects` matched the audit estimate verbatim. All captured idempotently in Migration 20.
- 2-column drift on `user_profiles` (`certifications`, `assigned_equipment` text[]) — captured in Migration 20.
- `equipment` is a whole-table drift (no migration creates it). Deferred to Stage 14 with the planned bigint→uuid + assigned_to text→uuid cleanup.
- `firms` (22 cols) and `crew_unavailability` (8 cols) have zero drift relative to migrations.
- `get_my_firm_id()` (Migration 01) is already `SECURITY DEFINER` with locked search_path — Migration 21 reused it instead of creating the prompt's proposed duplicate `user_firm_id()`. Existing helper bypasses RLS during execution, so no recursion risk in user_profiles policies.
- **Five projects misassigned, not four as the audit journal stated.** TEST_260402 was the unstated 5th (assigned_to = theo, owner). Backfill corrected to `assigned_to = NULL, lead_pm_id = theo`.
- `permissions` table has no `firm_id` column — it's a global RBAC matrix. Existing `auth.uid() IS NOT NULL` policy is correct; Migration 21 correctly skipped it.
- Two `Sandbox Master *` policies on `projects` and `user_profiles` would have rendered RLS useless if simply enabled — caught and dropped at Migration 21. Three other `Sandbox Master *` policies remain on `stakeout_*_points` / time / consumables tables and are tracked as deferred pre-pilot security.
- `user_profiles.role` has no CHECK constraint — accepts any string. Deferred to Stage 13.
- `8.5A_TESTING` master `stakeout_design_points` count is 513 (vs. 488 listed in earlier journal entries). 488 is the assignment subset; 513 is the project-level master. Both correct.

**Decisions locked:**

- Migration 22 trigger fires on `user_role IN ('party_chief', 'field_crew')` — restricts the chiefs that exist in production data (Andrew = field_crew) rather than just the aspirational `party_chief` role.
- Migration 23 used trigger approach (not FK CASCADE) because no direct FK exists between qc_points and assignment_points; relationship is composite (assignment_id + design_point_id).
- Migration 21 reused existing `get_my_firm_id()` instead of creating the duplicate `user_firm_id()` from the prompt — existing helper is already SECURITY DEFINER, no recursion risk.
- **PM role has firm-wide project write access** via `Office roles manage firm projects` — Phase 1 acceptable for small firms (PMs cover for each other). **Phase 2 evolution: scope to `lead_pm_id = auth.uid()` OR explicit cross-PM permission, when multi-PM firms become paying customers.**
- Lead PM selector defaults to current user only when `role IN ('owner', 'pm')`; otherwise explicit pick required.
- Priority field exposed as 3-option select (low / standard / high) with `standard` as default, matching the `priority text DEFAULT 'standard'` schema column.
- Test data: archived 15 of 18 dev firm projects; preserved 8.5A_TESTING (gold-standard), StakeoutTest (secondary), Kimley Marketing (real client name kept per user judgement, no fixture data).

**Discovered, deferred to Stage 13:**

- `user_profiles.role` lacks a CHECK constraint — accepts any string.
- 3 remaining `Sandbox Master *` policies on `stakeout_*_points` / time / consumables tables (already in Known Bugs as deferred pre-pilot security).
- Orphaned `assigned_to = c340c25a-5f8e-4445-8bef-8452c00a7a27` (deleted user) on Project1_Test and Verrado_260330 — both now archived, off active surfaces.
- Dead-file confirmation: `TodaysWork.jsx`, `MobileCrewView.jsx` are unreachable for `field_crew` users — registered in office Routes block which crew roles bypass via `App.jsx:345-363`. Already in the dead-file cleanup list.
- Assignment-level `client_contact_name` and `client_contact_phone` columns (Migration 13) are now duplicated by project-level columns added in Migration 20 — should migrate any assignment-level data up to project and drop the assignment columns.

**Discovered, deferred to Stage 14:**

- **Dispatch / CrewToday architectural gap.** Dispatch Matrix writes to `projects.assigned_to` and `projects.assigned_crew`; CrewToday + CrewUpcoming read from `stakeout_assignments.party_chief_id`. The two surfaces operate on different tables. Pre-Stakeout-QC, dispatch chief flow worked because chief surfaces queried `projects` directly. Post-Stakeout-QC, the new architecture left dispatch behind. Andrew has zero `stakeout_assignments` rows because dispatch never creates them — confirmed via diagnostic SQL during Step 0 + post-Migration-21 audit. This is the architectural gap Stage 14's `assignments` generalization is designed to resolve.
- **Potential RLS gap (no current victims).** `Field roles read firm projects` policy doesn't allow read when user is `party_chief_id` on an assignment whose project's `assigned_to` is a different user. Currently zero misalignment victims (Andrew diagnostic returned zero rows). Policy expansion (additive OR clause checking `party_chief_id` on assignments under that project) should land when Stage 14 unifies the assignment model.

**Open for next session:** Stage 12.1.7 — Stitch polish + functional integrations. Foundation is correct; build on it. The original "Revised Staging" table below is intentionally NOT updated this session — leave the staging-table edit for the next planning conversation per protocol.

**Commits this session (7 total, `33e3419..6a529ab`):**
- `d0b89ef` Migration 20 schema sync
- `c7b477a` Migration 20a backfill
- `14eb13c` Migration 21 RLS hardening
- `d0cb8d6` Migration 22 party_chief write whitelist
- `908c6c2` Migration 23 qc_points CASCADE fix
- `a611100` Step 6 code updates (LicensedPmDashboard, DeploymentModal, comments)
- `6a529ab` Step 7 test data hygiene
- `<journal>` this entry

---

### 2026-04-28 — Audit + Replan (NO CODE SHIPPED)

**What this session was:** Paused all builds. Audited every major surface in the app + ran SQL introspection on production schema. Goal was to know exactly what's built, what's broken, what's hollow, and what the real path to "Phase 1 ready for design partner" looks like.

**Surfaces audited:**
- CommandCenter
- DeploymentModal
- DispatchBoard + DispatchProjectDrawer
- CrewApp + CrewAssignmentDetail
- LicensedPmDashboard (referenced from prior session)

**Schema audited:**
- Full `information_schema.columns` query on `projects`, `user_profiles`, `firms`, `stakeout_assignments`, `stakeout_design_points`, `stakeout_qc_runs`, `stakeout_qc_points`, `stakeout_qc_narratives`, `crew_unavailability`, `equipment`

**Critical findings:**
1. `projects.assigned_to` is the Party Chief column, not Lead PM. Stage 12.1 LicensedPmDashboard built on a semantic flaw — works on test data only because same id used for both meanings.
2. ~17 columns drift on `projects` table — production has columns not in any migration file.
3. `priority` value sent by DeploymentModal silently dropped (no DB column).
4. `address` referenced by DispatchProjectDrawer; no DB column.
5. RLS unrestricted on `projects`, `user_profiles`, `firms`, several views — pre-pilot blocker.
6. `party_chief` UPDATE permission on `stakeout_assignments` too broad — pre-pilot blocker.
7. DispatchProjectDrawer is 1500 lines doing 4 personas' work; assumes "project = field deployment" which doesn't fit non-staking project types.
8. `scope` correctly multi-select; should drive UI routing rather than introducing project_type enum.
9. `stakeout_assignments` already uses correct `party_chief_id` naming — semantic confusion is local to `projects`.
10. `firms` has rich subscription/billing infrastructure already; mostly unwired.

**Decisions locked:**
- Add `lead_pm_id` column for Licensed PM ownership; keep `assigned_to` as Party Chief.
- Don't add `project_type` enum; use `scope` array contents to drive routing.
- Generalize `stakeout_assignments` → `assignments` for all project types (Stage 14).
- Stage 12.1.5 (Schema Correctness Pass) is the next stage. Don't ship features until it lands.

**New staging:**
- Stage 12.1.5: Schema correctness + RLS hardening + party_chief tightening + CASCADE bug fix + test data hygiene
- Stage 12.2: Financial snapshot strip (after 12.1.5)
- Stage 12.3: ProjectDetail nav (after Stage 14/15)
- Stage 13: Polish backlog (terminology, mobile UX, dead files, etc.)
- Stage 14: `assignments` generalization (major architectural change)
- Stage 15: ProjectDetail page rebuild
- Stage 16: Demo polish + onboarding + first-pilot prep

**Open for next session:** Stage 12.1.5 — schema correctness pass. Migration 20 (drift capture + lead_pm_id + priority + address), Migration 21 (RLS), Migration 22 (party_chief writes), Migration 23 (CASCADE fix). Update LicensedPmDashboard query, DeploymentModal Lead PM selector, code comment pass on `assigned_to` semantics. Test data cleanup. Roughly 2-3 days of focused Claude Code sessions.

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

Keep entries concise. Link to commits. Don't duplicate git-captured info; this is for intent, context, deferred decisions, relationship details. Commit the journal update alongside code changes.