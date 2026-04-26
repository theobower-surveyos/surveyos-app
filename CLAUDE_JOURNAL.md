# CLAUDE_JOURNAL.md

**Purpose:** This file is the authoritative, living record of SurveyOS project state for any Claude instance (chat or Claude Code) picking up work. It's committed to the repo and updated at the end of major sessions. Read this first; orient fast; execute.

**Usage at session start:**
> Read `CLAUDE_JOURNAL.md`, orient yourself, then continue from the latest session log entry.

**Usage at session end:**
> Update `CLAUDE_JOURNAL.md` with today's session log entry, state changes, new decisions, and any new known bugs. Keep it concise.

---

## Who I Am

**Theo Bower.** Solo founder and developer of SurveyOS under my own business entity. 13+ years field experience in land surveying and AEC work — rod man through Crew Chief, covering boundary surveys, topographic work, construction staking, ALTA/NSPS, as-builts, federal contracting (USFS, Army Corps), and geodetic control. Associate degree in land surveying, bachelor's in economics. FAA Part 107 drone cert. Engaged to Lauren. Based in Old Town Scottsdale, Arizona.

Fluent in the surveying domain — I've run the work, read the spec, staked the curb, submitted the ALTA, gotten the client to pay. The platform I'm building solves problems I've lived.

**My W-2 exit trigger is $15K MRR.** Until then, SurveyOS is evening/weekend work built on a multi-tool AI dev architecture: Claude web chat for strategy, Claude Code CLI for autonomous coding, Gemini for research.

---

## What SurveyOS Is

Vertical SaaS — the operating system for small land surveying firms. Five role-based portals (Owner, PM, Field/Party Chief, Office/CAD Tech, Client). Core pillars:

- **CommandCenter** — firm-level dashboard
- **Dispatch Board** — crew assignment
- **MorningBrief** — daily dispatch document
- **TodaysWork** — active task view
- **Stakeout QC** — Phase 1 focus; Stage 10 is functionally complete as of 2026-04-25
- **Client Portal** — deliverables + invoices + payment
- **Fee Schedule Engine** — proposal generation
- **SurveyNet** — monument database (Phase 1.5/2 priority with GDACS integration)
- **IntelligenceDrawer** — AI summaries per chief/crew
- **Immutable Liability Vault** — audit trail for legal defensibility
- **FinTech layer** — Stripe Connect invoicing, targets 13-day DSO vs industry 67-day average

**Wedge for sales:** invoicing + client portal + core PM. The AR-acceleration story (50-day DSO reduction) is the headline value prop for initial design-partner conversations.

**Stakeout QC is the category-defining capability.** No current product (Trimble Access, Leica Captivate, TBC, Carlson) provides the offset-aware end-to-end loop SurveyOS now ships: chief uploads as-staked CSV → SOS-grammar parser extracts design refs and offsets → matcher computes expected-vs-actual deltas with offset transformation → chief sees in-tolerance/out-of-tolerance scoreboard before leaving site → optional field-fit flagging with reason codes → submission to PM dashboard. Stage 10.1 through 10.4.5 shipped this loop.

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

## Phase 1 Roadmap: Stakeout QC

**Feature branch:** `feature/stakeout-qc`

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
| 10.5 | PM manual-match | ⏸ Deferred — likely fold into Stage 12 |
| **11** | **Accuracy narratives (Edge function + pg_cron + Claude summaries)** | **⏳ Next** |
| 12 | Integration (CommandCenter tile, nav wiring, MorningBrief, client portal) | ⏳ Pending |
| 13 | Testing + polish backlog | ⏳ Pending |

**Progress:** Stages 1-10.4.5 shipped. Phase 1 substantially complete. Stage 11 (accuracy narratives) and Stage 12 (integration) remain before MVP. Stage 13 is polish.

---

## Current State (as of 2026-04-25, end of late-evening session)

**Git:**
- Feature branch: `feature/stakeout-qc` at `52de61f`
- All Stage 10 commits pushed to origin including 10.4 and 10.4.5
- Working tree: clean (after journal commit lands)

**Environment:**
- Vite: `http://localhost:5174` (port 5173 in use)
- Claude Code CLI: active
- Primary test browser: Safari (desktop + responsive mode for mobile testing)
- Dev tools accessible in sidebar: SOS Parser Tester at `/dev/sos-parser` (gated to dev mode)

**Test data state:**
- 513-point "8.5A_TESTING" project
- `8.5_TESTING` assignment (`ca2a12c2-...`) attached to `theo@surveyos.com` as `party_chief`
- After 10.4.5 testing: `stakeout_qc_runs` has 1 row, `stakeout_qc_points` has 6 rows for `obs1-obs6`
- Migrations applied: 15 (scope checklist + chief_field_notes), 16 (shot_type + design_point_id_b on qc_points + dropped legacy CHECKs), 17 (extended field_fit_reason CHECK + chief h_status transitions)

**Next action:** Stage 11 — accuracy narratives. Supabase Edge Function + pg_cron job that aggregates QC data on a schedule and generates Claude-written natural-language summaries (e.g., "Crew completed 47 of 50 stakes in tolerance on the Verrado curb job; 2 field-fit deviations flagged for utility conflicts; 1 stake out of tolerance on point 4007 with a 0.087 ft horizontal delta"). These narratives feed the IntelligenceDrawer and MorningBrief.

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

### Files shipped in Stage 10

**Modules (pure logic):**
- `src/lib/sosParser.js` — parses SOS code strings to typed shape (10.1)
- `src/lib/sosParser.test.js` — 46 tests (10.1)
- `src/lib/sosMatcher.js` — `matchStake(parsed, observed, context)` returns row-ready qc_points object (10.2)
- `src/lib/sosMatcher.test.js` — 28 tests (10.2)
- `src/lib/sosProcessRun.js` — batch processor: dedup, create run, delete prior, write batch (10.2)
- `src/lib/csvParser.js` — PNEZD parser, 13 tests (10.3)

**Migrations:**
- `16_qc_points_shot_type_and_line_endpoint.sql` — added shot_type + design_point_id_b; dropped legacy CHECKs on actual_offset_direction (was N/S/E/W) and parsed/declared_stake_type (was single-letter codes); extended h_status/v_status CHECKs
- `17_field_fit_chief_writes_and_sos_codes.sql` — extended field_fit_reason CHECK to include SOS codes (OB/AC/SA/CF/OT) plus legacy values; modified `enforce_qc_point_column_protection_fn` trigger function to allow chief role to transition h_status between out_of_tol ↔ field_fit on own assigned rows; backfilled prefix-encoded data to clean column writes

**Components:**
- `src/components/crew/CrewUploadButton.jsx` — chief upload affordance with iOS file picker integration (10.3)
- `src/components/crew/CrewQcScoreboard.jsx` — headline + counts row + per-point list (10.4 + 10.4.5)
- `src/components/crew/CrewQcPointSheet.jsx` — bottom sheet with detail + field-fit reason picker (10.4 + 10.4.5)
- `src/components/pm/PmUploadButton.jsx` — desktop top button (10.3)
- `src/components/pm/PmUploadDropZone.jsx` — drag-and-drop zone for empty state (10.3)
- `src/hooks/useCrewQcRun.js` — DB-backed latest-run + points fetch with refresh (10.4)

**Existing components modified:**
- `src/components/crew/CrewAssignmentDetail.jsx` — integrates scoreboard + adaptive Submit button visual weight
- `src/components/AssignmentDetail.jsx` — added PmUploadButton + PmUploadDropZone in the QC section
- `src/components/AssignmentsList.jsx` — unchanged
- `src/App.jsx` — added Stakeout QC sidebar nav link, role-gated to office roles (10.3.5)
- `src/components/dev/SosParserTester.jsx` — extended with matcher playground (10.2) + CSV parser preview (10.3)

### Data flow end-to-end

1. PM creates assignment with design points (existing Stage 6+)
2. PM sends to chief, status `sent` → `in_progress` (Stage 9.4a)
3. Chief stakes work in field, exports CSV from Trimble Access (industry workflow)
4. Chief opens crew app on Trimble data collector or phone, in-progress assignment, taps "Check my work"
5. iOS file picker → CSV file selected → CSV parsed by `csvParser.parsePnezdCsv()`
6. Each row's description fed to `sosParser.parseStakeCode()`
7. `sosProcessRun.processRun()` dedups by design_ref (most recent wins), fetches assignment context, calls `sosMatcher.matchStake()` per row
8. Matcher returns shape ready for stakeout_qc_points; processRun deletes prior run row (cascades to qc_points), creates new run, batch-inserts qc_points
9. Crew app fetches via `useCrewQcRun()` hook
10. CrewQcScoreboard renders headline + counts + per-point list
11. Out-of-tolerance rows show with red accent bar; tap → bottom sheet with detail + Mark as field-fit
12. Chief picks reason code → DB update writes h_status='field_fit', field_fit_reason=<code>, field_fit_note=<optional text>
13. Counts row + headline update; Submit button visual weight reflects out_of_tol count
14. Chief taps Submit → status `in_progress` → `submitted` (existing Stage 9.4a flow)
15. PM sees populated qc_dashboard on AssignmentDetail (existing Stage 7 UI consumes 10.2's data)

### Key product decisions (locked across Stage 10)

- **Dash separator + colon for line-stake "between."** Chief types ~10 chars per code.
- **No direction hint in codes.** Distance-only QC for point features. Line features derive perpendicular from design geometry.
- **Side-agnostic line-stake matching.** Perpendicular distance only. Side concerns become PM manual-flag if a project requires it.
- **Most-recent-wins duplicate handling.** Earlier observations dropped pre-match.
- **Re-upload overwrites.** Each new run deletes prior `stakeout_qc_runs` row, cascades to qc_points.
- **Parse-error rows written to qc_points** with raw description preserved.
- **Field-fit flagged in crew app post-upload, NOT in code string.** Chief taps row → reason picker → DB update.
- **Per-chief accuracy intelligence is the most defensible IP angle.** Predictive crew-to-project matching pipeline. Phase 2+. Possible provisional patent when algorithm crystallizes.
- **Adaptive Submit button visual weight.** All-in-tol → full teal; any out-of-tol → 60% opacity + caveat line. Chief can still submit with reds; we just make them think.
- **Chief sees scoreboard on assignment detail mount, persisted from DB.** Not in-memory only.
- **Trimble data collectors are primary device target.** TSC5 Android, iPhone+DA2 iOS, TSC7 Windows. Same UX as phone.

### Stage 10.4.5 schema constraint resolution

Two existing constraints initially blocked the field-fit UX in 10.4:
1. Trigger `enforce_qc_point_column_protection_fn` (migration 12) raised exception when non-office roles wrote `h_status`
2. CHECK on `field_fit_reason` allowed only legacy values (`adjacent_line`, `utility_conflict`, etc.)

10.4 worked around with prefix-encoded notes (`field_fit_note='[OB]'`, `field_fit_reason='other'`). 10.4.5 fixed properly: extended CHECK to include SOS codes, modified trigger function additively to allow chief h_status transitions out_of_tol ↔ field_fit on own assigned rows, backfilled existing prefix data. Schema now reflects reality cleanly.

---

## Deferred Stages

### Stage 9.5 — Push notifications
Deferred indefinitely. Build push when we know what real events to notify about.

### Stage 10.5 — PM manual-match + field-fit reconciliation UI
Deferred to Stage 12 likely. Field-fit is now chief-side flagged; PM gets that data automatically. Manual-match for unresolved observations could ship as a Stage 12 PM dashboard polish.

---

## Feature Code Palette (Canonical, Phase 1)

~45 canonical codes in industry-aligned families. Lives in `src/components/planview/featureCodeStyles.js`. Status precedence: SELECTED > STATUS > FEATURE_CODE > default teal.

(Full palette unchanged; see prior journal for full listing if needed.)

---

## Key Design Decisions (Locked)

- **Tolerance defaults:** horizontal 0.060 ft, vertical 0.030 ft (firm-level configurable)
- **Feature-code grammar (design side):** `FEATURE-OFFSET-STAKETYPE` (PM intent)
- **As-staked code grammar (field side):** SOS v1 (chief input)
- **PM sets WHAT to stake; chief decides HOW in field**
- **Vertical QC populated** for offset shots in Stage 10.2 onward
- **Status enum at DB:** draft → sent → in_progress → submitted → reconciled
- **UX vocabulary:** "reconcile" dropped in crew-facing copy
- **Pricing positioning:** Stakeout QC is premium feature of top tier
- **Layout concerns at consumer-page level only**
- **Crew UX principle: incognito time tracking.** DB captures timestamps; UI hides them
- **Crew detail plan view removed** — Trimble Access owns field navigation
- **Role-based routing (not viewport-based)**
- **SurveyOS defines its own input formats** — SOS grammar, future per-firm custom parsers as paid implementations
- **Adaptive Submit button visual weight** based on out_of_tol count
- **Chief field-fit flagging is post-upload, in app** — never in code string

---

## Intellectual Property Strategy

Reviewed during Stage 10 scoping. **Patents not pursued during Phase 1.** Real moat is execution velocity + domain expertise + customer relationships. Most defensible angle is the per-chief-accuracy → AI-crew-dispatch pipeline; consider provisional patent when that algorithm crystallizes in Stage 11+. Journal acts as prior-use evidence.

---

## PM Persona Gap (Phase 1.5)

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships need role-scoped dashboards via Option D — `role` field on `user_profiles` (already exists), role-specific default dashboards, navigation visibility by role, separate role for `firm_owner`/PLS.

---

## Known Bugs / Tech Debt (Tracked for Stage 13)

### Bugs
- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. Stage 13 SQL fix needed.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`.

### Tech debt
- **[TECH DEBT]** `AssignmentDetail.jsx` at ~1570 lines. `DesignPointsPlanView.jsx` at ~1500 lines. Refactor candidates.
- **[TECH DEBT]** Two Supabase client import patterns coexist (direct vs prop-drilled).
- **[TECH DEBT]** Two `parseStakeCode` functions — different domains, no collision but worth unifying.
- **[TECH DEBT]** Hand-rolled test harnesses (parser, matcher, csv) — Vitest wrapper deferred.
- **[TECH DEBT]** AssignmentDetail design points table renders all rows (488 in test data). Add pagination ~50/page with prev/next bottom-right. Pre-existing issue surfaced during 10.3 testing.

### Deferred UX/visual polish
- **[DEFERRED VISUAL]** Crew bottom nav has gap below tab buttons in mobile responsive mode. env(safe-area-inset-bottom) likely over-reserving. Real iPhone may render correctly.
- **[DEFERRED VISUAL]** Grid styling tiered-line evaluation post-commit-4
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom in Safari (sub-pixel text)
- **[DEFERRED UX]** Stacked points UX (control + check shots at same location)
- **[DEFERRED UX]** "Controls off-view" indicator
- **[DEFERRED UX]** Control points non-selectable for assignment

### Deferred features
- **[DEFERRED FEATURE]** "Export controls to CSV" button
- **[DEFERRED FEATURE]** Project snapshot PNG export on chief submit (timesheet + disguised time log)
- **[DEFERRED FEATURE]** PM-side scope checklist authoring in AssignmentBuilder
- **[DEFERRED FEATURE]** PDF attachment area on crew assignment detail
- **[DEFERRED FEATURE]** GPS tracking of "Start work" tap
- **[DEFERRED FEATURE]** Direction inference / confirmation UX for point-feature offsets

### Deferred security
- **[DEFERRED SECURITY]** Sandbox RLS policies — `Sandbox Master` policies grant ALL to `authenticated`. Scope or remove before first paying pilot.

---

## Phase 2 Feature Requests

- **Firm-level custom feature code libraries**
- **Firm-level custom SOS parser** for legacy as-staked conventions (~2 days per firm)
- **Role-scoped dashboards** (PM persona gap)
- **Feature-code color visibility in QC view**
- **Per-chief accuracy intelligence + AI crew-to-project matching** — most defensible IP angle
- **Predictive staking CV** — Intelligence Layer add-on
- **Direction inference / confirmation UX for point-feature offsets**

---

## Key People & Resources

**Drew — CEO of Focus School Software.** SaaS operator. Recommends sell-now; Theo committed to Phase 1 MVP first. Strategic counterweight for sales/timing tradeoffs.

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
- **Legacy CHECK constraints from earlier stages can block new schema.** Migration 16 dropped CHECKs that were incompatible with new column semantics.
- **Schema introspection beats guessing.** `stakeout_qc_runs` has `id` PK and `submitted_at` timestamp, no `created_at`/`run_id` columns.
- **Trigger functions can be modified additively via CREATE OR REPLACE FUNCTION.** Migration 17 preserved every existing protection in `enforce_qc_point_column_protection_fn` while adding a permissive case for chief h_status transitions out_of_tol ↔ field_fit on own assigned rows. Same trigger object, swapped function body — no need to drop and recreate the trigger.
- **Workarounds for schema constraints become tech debt.** When 10.4 hit two existing constraints (column-protection trigger + field_fit_reason CHECK), Claude Code worked around by encoding the SOS code as a `[OB]` prefix in `field_fit_note` and using `field_fit_reason='other'`. Functional but DB no longer reflected reality at the canonical column level. 10.4.5 cleaned up properly with migration 17. Lesson: prefer immediate schema fixes over UI-layer workarounds when the constraint conflicts with new product requirements; the workaround tax compounds.
- **Supabase SQL Editor runs as service role.** Triggers don't fire for editor queries, so direct UPDATE statements bypass column protections. UI-driven testing is the only definitive trigger validation path.

---

## AI Dev Workflow

**Multi-tool architecture:** Claude web chat (strategy + prompt-writing), Claude Code CLI (autonomous coding), Gemini (research).

**Prompt discipline:** what to read first, what to deliver, specific constraints, explicit regression checks, report-when-done structure. One prompt = one paste; embedded code fences are instructions. Prompts that stopped Claude Code from running the same prompt twice: when Claude says "this is already done" — go with verification + move on rather than re-running.

**Partner-mode (not tutor-mode):** direct pushback both ways, concise responses, surface counterweights.

**Commit discipline:** smaller increments, descriptive messages naming stage + what shipped, push at sub-stage boundaries, revert cleanly when cross-view regressions appear.

---

## Session Log

### 2026-04-25 (late evening, continuous from 2026-04-24) — Stage 10 functionally complete

**Pushed earlier in same session:**
- `b1152bd` (Stage 10.3 + 10.3.5: CSV upload UI + nav link)

**Shipped this session and pushed at end:**
- `6746151` — Stage 10.4: Chief QC scoreboard + field-fit flagging UX
- `52de61f` — Stage 10.4.5: Migration 17 + clean field-fit schema + UI refactor

**Stage 10.4 architecture:**
- `useCrewQcRun` hook fetches latest run + points from DB on mount
- `CrewQcScoreboard` renders adaptive headline ("All stakes in tolerance" / "X of Y need review" / "X stakes out of tolerance"), counts row chips, per-point list with red accent bar on out_of_tol
- `CrewQcPointSheet` bottom sheet with full point detail + reason picker (5 SOS codes + Other with text input)
- Adaptive Submit button: full teal when 0 out_of_tol, 60% opacity + caveat line when any out_of_tol
- Persistence across navigation via DB-backed fetch (not in-memory)

**Stage 10.4.5 schema cleanup:**
- Migration 17: extended `field_fit_reason` CHECK to include OB/AC/SA/CF/OT (preserved legacy values), modified `enforce_qc_point_column_protection_fn` to allow chief role to transition `h_status` between out_of_tol ↔ field_fit on own assigned rows, backfilled existing prefix-encoded data
- Refactored `CrewQcPointSheet` and `CrewQcScoreboard` to use direct `h_status` reads/writes instead of parsing `[OB]` prefix from `field_fit_note`
- All existing trigger protections preserved verbatim (delta_*, observed_*, parsed_*, declared_*, actual_* columns still locked from chief writes)

**Decided this session:**
- Stage 10.4 design intent locked: scoreboard is the killer demo screen; chief should read status in 1 second; field-fit flagging happens in app with reason codes; check shots de-emphasized (chiefs use Trimble Access for setup verification); adaptive Submit visual weight
- Trimble data collectors as primary device target — same UX as phone, portrait-first
- Field-fit reason codes: OB (Obstruction), AC (Access), SA (Safety), CF (Conflict), OT (Other)
- Schema constraint workarounds become tech debt — fix immediately when constraint conflicts with product requirements (10.4 → 10.4.5 follow-up)
- Stage 10.5 (PM manual-match) likely folds into Stage 12 since chief-side field-fit covers most reconciliation needs

**Validated end-to-end on 8.5_TESTING:**
- Chief uploads CSV → matcher classifies → scoreboard renders
- Tap out_of_tol row → bottom sheet → field-fit reason picker → DB writes clean column values
- Submit visual adapts to out_of_tol count
- Persistence: navigate away and back, scoreboard renders from DB
- Migration 17 backfilled existing prefix-encoded row from 10.4 testing cleanly

**Open for next session:** Stage 11 — accuracy narratives. Edge function + pg_cron schedule + Claude API integration for natural-language QC summaries. Feeds IntelligenceDrawer and MorningBrief.

---

### 2026-04-24 (late evening) — Stage 10.1, 10.2, 10.3, 10.3.5 shipped

(Earlier session same date — see prior journal entries for full detail. Stage 9 push, then SOS parser, matching engine, CSV upload UI, sidebar nav.)

---

### 2026-04-24 (afternoon + evening) — Stage 9 shipped + Stage 10.1 begun

Crew mobile UI complete (six commits 9.1 through 9.4c, pushed at b2e545c). SOS grammar discussion + 10.1 parser shipped. IP strategy reviewed. Patent decision: not Phase 1.

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