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
- **Stakeout QC** — Phase 1 focus; Stage 10 is the defining capability
- **Client Portal** — deliverables + invoices + payment
- **Fee Schedule Engine** — proposal generation
- **SurveyNet** — monument database (Phase 1.5/2 priority with GDACS integration)
- **IntelligenceDrawer** — AI summaries per chief/crew
- **Immutable Liability Vault** — audit trail for legal defensibility
- **FinTech layer** — Stripe Connect invoicing, targets 13-day DSO vs industry 67-day average

**Wedge for sales:** invoicing + client portal + core PM. The AR-acceleration story (50-day DSO reduction) is the headline value prop for initial design-partner conversations.

**Stage 10 significance:** Stakeout QC moves from feature to category-definer here. No current product in the industry (Trimble Access, Leica Captivate, TBC, Carlson) provides the specific workflow SurveyOS is building: offset-aware QC compute that gives the chief a green-light / red-flag scoreboard before leaving site, with cumulative per-chief accuracy intelligence feeding later crew-to-project AI matching. Building blocks exist in fragments across vendors; the complete loop does not. As of 2026-04-24, SOS parser (10.1) and matching engine (10.2) are shipping — the engine is functionally complete, validated end-to-end against real assignment data.

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
- (Additional packs TBD)

**Active pricing work:** entry-tier $399 identified as friction point for smallest firms. Stakeout QC positioned as premium feature of top tier. Pricing is active strategy work — expect iteration as design-partner conversations produce feedback.

---

## Architectural Constraints (Non-Negotiable)

These are canonical. Do not deviate without explicit discussion:

- **Stack:** React + Vite + Supabase + Vercel. React 18. Multi-tenant by `firm_id`.
- **Repo path:** `/Users/theobower/_WORK/02_SurveyOS/code/surveyos-app`
- **Styling:** Dark-mode-first. Inline styles referencing CSS variables. No Tailwind, no CSS-in-JS libraries.
- **Brand teal:** `#0D4F4F` (primary), `#0F6E56` (highlight).
- **Topographic contour motifs** — subtle visual signature, use sparingly.
- **CSS vars live in `src/index.css`:** `--brand-teal`, `--brand-teal-light`, `--brand-amber`, `--bg-dark`, `--bg-surface`, `--border-subtle`, `--text-main`, `--text-muted`, `--success`, `--error`. Utility classes: `.coordinate-data` (mono N/E/Z), `.btn-field` (52px glove-mode buttons).
- **Previously single `App.jsx`** — now decomposing into components as scale requires, but maintain tight integration patterns.
- **Zero-consumer-change integration pattern:** when extending shared components (e.g., DesignPointsPlanView), prefer internal state over lifting props so consumers don't need changes. Proven in Stages 8.5a/b.
- **Layout concerns belong at the consumer-page level, NOT inside shared components.** Padding, margins, gutters, and breathing room cascade unpredictably when added to a shared component. Proven by commit 2c revert on 2026-04-23.
- **Feature flag dev-only tools:** `import.meta.env.DEV` gates (e.g., AssignmentTestDataSeeder, SosParserTester).
- **Migrations in `supabase/migrations/`** — numbered, versioned, descriptive names.
- **Role-based routing in App.jsx:** `user_profiles.role IN ('field_crew', 'party_chief')` routes to `CrewApp`; all other authenticated roles route to desktop CommandCenter. Pure role-based, no viewport-width check.
- **SurveyOS owns its input formats.** Don't accommodate messy industry conventions — define the canonical SurveyOS standard (e.g., SOS grammar), document it, demo it, integrate per-firm custom parsers in Phase 2 if required. Inspired by Apple's opinionated-defaults approach to redefining industry UX.

---

## Phase 1 Roadmap: Stakeout QC (13 stages)

**Feature branch:** `feature/stakeout-qc`

| Stage | Description | Status |
|-------|-------------|--------|
| 1-5 | Schema, utility functions, export utilities, PM-facing design points import | ✅ Shipped |
| 6 | PM assignment builder with plan view, lasso select, save/send | ✅ Shipped (`dd8db0b`) |
| 7a | List + detail + QC dashboard | ✅ Shipped (`91f88a0`) |
| 7b.1 | Inline edit metadata, edit points, per-point tolerance | ✅ Shipped (`9966470`) |
| 7b.2 | Reconciliation workflow, exports, status progression, re-send | ✅ Shipped (`73da530`) |
| 8 | Crew PWA infrastructure (service worker, IndexedDB, sync manager) | ✅ Shipped (`3d7b794`) |
| 8.5a | Plan view production-scale (pan/zoom, control detection, intelligent default zoom) | ✅ Shipped (`9438d45`) |
| 8.5b-core | Feature-code color palette, shape differentiation, control triangle 2x, labels | ✅ Shipped (`9cb8dfc`) |
| 8.5b-polish | Filter chips, legend, zoom-to-point, label collision, zoom-responsive sizing | ✅ Shipped (`5418c8f`) |
| 9 (minus 9.5 push) | Crew field view UI (mobile-first) | ✅ Shipped (`b2e545c`) |
| 9.5 | Push notifications (iOS 16.4+ caveat) | ⏸ Deferred indefinitely |
| 10.1 | SOS grammar spec + parser module + dev tester | ✅ Shipped (`2b5a276`) |
| 10.2 | Matching engine + migration 16 + matcher playground | ✅ Shipped (`3be2b37`) |
| **10.3** | **CSV upload UI — chief mobile primary + PM desktop fallback** | **⏳ Next** |
| 10.4 | Chief-facing QC scoreboard | ⏳ Pending |
| 10.5 | PM manual-match + field-fit reconciliation | ⏳ Pending (likely merge to Stage 12) |
| 11 | Accuracy narratives (Supabase edge function + pg_cron, Claude-generated summaries) | ⏳ Pending |
| 12 | Integration (CommandCenter tile, nav wiring, MorningBrief, client portal) | ⏳ Pending |
| 13 | Testing + polish (refactor, CASCADE fix, seeder fix, file-size refactor, off-view indicator, stacked points UX, Safari deep-zoom label fix, control-point selectability, export controls CSV, grid tiering, snapshot export, RLS tightening, Vitest wrapper) | ⏳ Pending |

**Progress:** Stages 1-9 + 10.1 + 10.2 shipped. Stage 10 in progress (10.3 next, 10.4 after).

---

## Current State (as of 2026-04-24, end of late-evening session)

**Git:**
- Feature branch: `feature/stakeout-qc`
- Latest remote push: `b2e545c` (Stage 9.4c) — earlier in this same date session
- Local unpushed: `2b5a276` (Stage 10.1) + `3be2b37` (Stage 10.2) + journal update (this commit)
- Working tree: clean after journal commit

**Environment:**
- Vite: `http://localhost:5174` (port 5173 in use)
- Claude Code CLI: active
- Primary test browser: Safari (desktop + responsive mode for mobile testing)
- Dev tools: SOS Parser Tester at `/dev/sos-parser`, dev-only

**Test data state:**
- 513-point "8.5A_TESTING" project still the main Stakeout QC test dataset
- `8.5_TESTING` assignment (`ca2a12c2-6aa0-41ae-840b-8e17ed1e0af4`) attached to `theo@surveyos.com` as `party_chief` — currently has 7 qc_points rows from 10.2 testing (1 in_tol, 2 out_of_tol, 1 check_pass, 1 unmatched_check, 1 parse_error, 1 unmatched_bonus). Run id: `ec6da744-736f-490f-aa44-c9dbebf4c0b9`
- Migration 15 applied: `stakeout_assignments.scope_checklist jsonb + chief_field_notes text`
- Migration 16 applied: `stakeout_qc_points.shot_type text + design_point_id_b uuid` + dropped legacy CHECK constraints (single-letter stake_type, N/S/E/W direction values)
- RLS policy "Field roles update own assignments" on `stakeout_assignments`. Stage 13 item: tighten via trigger/RPC

**Next action:** Stage 10.3 — CSV upload UI. Chief mobile is the primary path (Trimble Access on data collector → SurveyOS upload → matcher runs → scoreboard). PM desktop is the fallback path (PM uploads on AssignmentDetail when chief defers). Scope discussion in progress as of session end.

---

## Stage 10 Overview — Stakeout QC Compute

Stage 10 is the defining capability of the SurveyOS Stakeout QC pillar. The chief's "can I leave site?" moment. The PM's "was this work done right?" moment. The demo moment that sells firms.

### SurveyOS Stake Code Standard (SOS) v1 — locked

Industry's existing as-staked code formats (`4003 - 4002 - 11FT LUP`, free-text descriptions) are parser-hostile and inconsistent. Per decision 2026-04-24: SurveyOS defines its own canonical grammar. Firms adopt SOS for SurveyOS compatibility; legacy formats become per-firm custom parsers in Phase 2.

Grammar:
<code> := <point_stake> | <line_stake> | <check_shot> | <control_check>
<point_stake>    := <design_id> "-" <offset> "-" <stake_type>        e.g. 4007-5-HUB
<line_stake>     := <design_id> ":" <design_id> "-" <offset> "-" <stake_type>  e.g. 4003:4002-11-NAIL
<check_shot>     := <design_id> "-" "CHK"                             e.g. 4007-CHK
<control_check>  := "CP" "-" "CHK"                                    e.g. CP-CHK

Stake types (Phase 1 canonical): `HUB, LATHE, NAIL, PK, MAG, PAINT, CP, WHISKER`. Additional industry codes (CHIS, XMARK, FLAG, IP) deferred pending firm demand.

Field-fit deviations are flagged in the SurveyOS crew app POST-upload (chief taps an out-of-tol point, marks as field-fit with reason code: OB=obstruction, AC=access, SA=safety, CF=conflict, OT=other). NOT captured in the code string itself — removes field-typing complexity.

Spec: `docs/sos-stake-code-standard.md`

### Stage 10 sub-commits

- **10.1 (`2b5a276`):** SOS grammar doc + parser module + 46-test suite + dev tester at `/dev/sos-parser`
- **10.2 (`3be2b37`):** Matching engine + migration 16 + processRun batch processor + matcher playground (extension of dev tester). Validated end-to-end against real assignment data on 2026-04-24.
- **10.3 (next):** CSV upload UI — chief mobile (primary path, Trimble Access export → phone → SurveyOS) + PM desktop (fallback on AssignmentDetail)
- **10.4:** Chief-facing QC scoreboard — the killer UX moment; big numbers, green/yellow/red, "you can leave site" or "go fix point 4007"
- **10.5:** PM manual-match + field-fit reconciliation UI (desktop)

### Stage 10.2 architecture (shipped)

Files:
- `src/lib/sosMatcher.js` — pure-logic matcher; `matchStake(parsed, observed, assignmentContext)` returns row-ready object for stakeout_qc_points
- `src/lib/sosMatcher.test.js` — 28 hand-rolled tests, browser-runnable from dev tester
- `src/lib/sosProcessRun.js` — batch processor; deduplicates by design_ref (most recent wins), creates run row, deletes prior qc_points/qc_runs, writes new batch
- `supabase/migrations/16_qc_points_shot_type_and_line_endpoint.sql` — added shot_type + design_point_id_b columns; dropped legacy CHECK constraints on actual_offset_direction (was N/S/E/W only) and parsed/declared_stake_type (was single-letter codes)
- `src/components/AssignmentDetail.jsx` — 2-line graceful fallback added so unknown new status values (`check_pass`, `unmatched_check`, etc.) don't crash the QC view

Algorithms:
- **Point stake:** actual_offset = √(ΔN² + ΔE²) from design point coords; delta_h = |actual_offset − declared_offset|; delta_v = obs_Z − design_Z (no offset on Z)
- **Line stake:** project obs onto line A→B; t parametric position; perpendicular distance is actual_offset; design_Z = lerp(A.z, B.z, t); off-segment t triggers field_fit_note but still computes QC. Side-agnostic per product call.
- **Check shot:** direct coord comparison against design point. delta_h = √(ΔN² + ΔE²). Pass/fail vs same tolerance as stakeout. Falls back to project_controls if not in assignment design points.
- **Control check (CP-CHK):** spatial match within 2ft radius across project_controls + prior_observations. Unique match → check_pass/check_fail; zero or multiple → unmatched_check.
- **Tolerance fallback chain:** per-point override → assignment default → library default (0.060 H / 0.030 V)
- **Bearings stored as decimal degrees as string** (e.g., "45.2") for point/check shots; literal "perpendicular" for line stakes.

### Stage 10.2 validation results (2026-04-24)

End-to-end matcher run against 8.5_TESTING with 7 fabricated observations:
shot_type        h_status         v_status      count
check_shot       check_pass       check_pass    1
line_stake       out_of_tol       out_of_tol    1
parse_error      parse_error      null          1
point_stake      in_tol           in_tol        1
point_stake     out_of_tol        in_tol        1
unmatched_bonus  unmatched        null          1
unmatched_check  unmatched_check  null          1

All classifications correct against expected output. Re-upload regression: total stays at 7, prior run deleted, new run row created cleanly. Parser tests still 46/46. Matcher tests 28/28.

### Key product decisions (locked)

- **Dash separator for SOS codes.** Matches industry familiarity. Colon for the "between A and B" line-stake relationship (removes dash-counting ambiguity).
- **No direction hint in codes.** Chiefs don't reliably type direction; MVP does distance-only QC for point features. Line features derive direction from design geometry (perpendicular to line). Phase 2 may add direction inference/confirmation UX.
- **Side-agnostic line-stake matching.** Perpendicular distance only. If side matters for a project, PM flags manually.
- **Most-recent-wins duplicate handling.** Same design_ref staked twice → earlier dropped pre-match.
- **Parse-error rows written to qc_points** with raw description preserved. Surface counts at upload time so user sees parse failures immediately.
- **Re-upload overwrites.** Each new run deletes prior `stakeout_qc_runs` row (cascades to qc_points). Simple mental model. Stage 13 may add versioning.
- **Incognito time tracking principle applies throughout Stage 10.** Upload timestamp captured in DB; scoreboard never shows "you finished at 4:47pm."
- **Per-chief accuracy profile (future, Phase 2+).** Stage 10 writes deltas to `stakeout_qc_points`; over time, aggregation across assignments produces per-chief accuracy intelligence feeding AI crew-to-project matching. Most defensible IP angle — no competitor aggregates field QC into a dispatch decision layer.

### Trimble tolerance report — not the input format

Reviewed Trimble's HTM tolerance report. Produces raw point-to-point coordinate deltas with no offset awareness; flags nearly every row red when offset staking is in use. Confirms the industry gap. SurveyOS ingests raw as-staked PNEZD CSVs and does offset-aware compute itself.

---

## Deferred Stages

### Stage 9.5 — Push notifications (iOS 16.4+)

Deferred indefinitely. Better to build push once we know what real events exist to notify about (e.g., "PM reconciled your work"). Stage 8 service worker scaffold preserved for future use. Slot whenever a focused weekend appears or a design partner asks.

---

## Feature Code Palette (Canonical, Phase 1)

~45 canonical codes in industry-aligned families. Lives in `src/components/planview/featureCodeStyles.js`.

- **Control** (classified separately via `pointClassification.js`, renders as white triangle at 2x): CP, BM, TBM, SECCOR, CM, MON, REBAR, BRASS, BCC, SM, CORNER, SECTION, QUARTER, PLSS, SCS, PROP, WIT
- **Water** (deep blue `#2563EB`): WL circle, WV square, FH plus, WM octagon
- **Storm** (teal `#14B8A6`): SD circle, SDMH circle 1.5x, SDI square, SCB square 1.3x
- **Sanitary** (green `#16A34A`): SS, SSMH 1.5x, SCO
- **Gas** (yellow `#EAB308`): GL, GV, GM
- **Electric** (red `#DC2626`): EL, ET, EV
- **Telecom** (purple `#9333EA`): TPED (pedestal), TL, FO
- **Lighting** (amber): LP plus, SP square
- **Curb**: TBC white circle (primary staking), EP/EW light gray, CL bright orange (project spine), BC/CR medium gray, WC magenta square
- **Grading**: FG tan, RG brown, SG dark brown
- **Trees**: CTR dark forest green (coniferous), DTR medium green (deciduous), TR light green (generic)
- **Structures**: BLD, COL dark gray
- **Unknown fallback**: neutral gray `#6B7280`

**Status precedence in rendering:** SELECTED (amber) > STATUS (in_tol/out_of_tol/etc) > FEATURE_CODE > default teal.

---

## Key Design Decisions (Locked)

- **Tolerance defaults:** horizontal 0.060 ft, vertical 0.030 ft (firm-level configurable)
- **Feature-code grammar (design side):** `FEATURE-OFFSET-STAKETYPE` (e.g., `TBC-5FT-HUB`) — the PM's design intent notation
- **As-staked code grammar (field side):** SOS v1 (see Stage 10 section) — what chiefs type after the dash
- **PM sets WHAT to stake; chief decides HOW in field** — division of authority
- **Vertical QC (`v_status`) populated for offset shots** — Stage 10.2 computes it; previous Phase 1 plan was to defer, but the matcher computes both delta_z and v_status across all shot types where elevation is available
- **Vocabulary (DB-level):** status enum: draft → sent → in_progress → submitted → reconciled
- **Vocabulary (crew-UX-level):** "reconcile" language dropped in crew-facing copy
- **Pricing positioning:** Stakeout QC is premium feature of top tier
- **Layout concerns at consumer-page level only**, never in shared components
- **Crew UX principle: incognito time tracking.** Applies across all crew-facing UI including upload/scoreboard
- **Crew detail plan view removed.** Chiefs use Trimble Access for field navigation
- **Role-based routing (not viewport-based)**
- **SurveyOS defines its own input formats** — SOS grammar, future per-firm custom parsers as paid implementation

---

## Intellectual Property Strategy (as of 2026-04-24)

Reviewed during Stage 10 scoping discussion.

**Not patentable:** comparing design coordinates to observed coordinates (Trimble prior art); computing tolerance deltas (prior art); CSV upload to cloud (obvious); mobile scoreboard UI (obvious once written).

**Potentially narrow-claim patentable:**
- Parsing `FEATURE-OFFSET-STAKETYPE` code grammar to back out expected offset from observed coordinates and compute corrected delta
- Inferring feature-line direction from adjacent design points to auto-compute expected offset direction without PM input
- **Per-chief accuracy aggregation → AI crew-to-project dispatch pipeline** (most defensible angle; closed-loop system tying QC data to business action)

**Decision:** do not file patents during Phase 1. Real moat is execution velocity + domain expertise + customer relationships. Keep detailed technical notes (journal is prior-use evidence). If a specific clever algorithm emerges during Stage 10-11 that feels genuinely non-obvious (predictive crew-matching pipeline is the candidate), file a provisional at that point.

---

## PM Persona Gap (Acknowledged, Deferred to Phase 1.5)

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships and projects without doing crew scheduling are not yet addressed.

**Solution (Phase 1.5/Phase 2 opener):** Role-scoped dashboards via Option D — add `role` field to `user_profiles` (already exists), role-specific default dashboards, navigation visibility by role, separate role for `firm_owner`/PLS.

---

## Known Bugs (Tracked for Stage 13)

- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. Stage 13 SQL fix needed.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`.
- **[TECH DEBT]** `AssignmentDetail.jsx` at 1549 lines. `DesignPointsPlanView.jsx` at ~1500 lines. Refactor candidates: extract `PointList`, `ResendConfirmModal`, `PointGlyph`, `Tooltip`.
- **[TECH DEBT]** Two Supabase client import patterns coexist (direct vs prop-drilled). Stage 13 to pick one.
- **[TECH DEBT]** Two `parseStakeCode` functions exist: `src/utils/stakeoutQC.js` for design-side TBC-5FT-HUB grammar, `src/lib/sosParser.js` for as-staked SOS grammar. Different domains, no shadowing risk.
- **[TECH DEBT]** Hand-rolled test harnesses in `sosParser.test.js` and `sosMatcher.test.js` — Vitest wrapper deferred. Stage 13 cleanup if useful.
- **[DEFERRED]** Stacked points UX: control point + daily check shots stack at same location.
- **[DEFERRED]** "Controls off-view" indicator when zoomed away from controls.
- **[DEFERRED VISUAL]** Grid styling tiered-line evaluation post-commit-4.
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom (1–2ft viewBox) in Safari. WebKit refuses sub-pixel text rendering.
- **[DEFERRED UX]** Control points non-selectable. Stage 8.5a decision blocks adding them to assignments.
- **[DEFERRED FEATURE]** "Export controls to CSV" button.
- **[DEFERRED FEATURE]** Project snapshot PNG export on chief submit. Doubles as weekly timesheet AND disguised time tracking.
- **[DEFERRED FEATURE]** PM-side scope checklist authoring in AssignmentBuilder.
- **[DEFERRED FEATURE]** PDF attachment area on crew assignment detail.
- **[DEFERRED FEATURE]** GPS tracking of "Start work" tap.
- **[DEFERRED FEATURE]** Direction inference / confirmation UX for point-feature offsets (Stage 10.2 does distance-only QC for point features).
- **[DEFERRED SECURITY]** Sandbox RLS policies. Several tables have `Sandbox Master` policies granting `ALL` to `authenticated`. Scope or remove before first paying pilot.
- **[DEFERRED SECURITY]** Field role UPDATE permission on `stakeout_assignments` is row-level only. Tighten via trigger/RPC.

---

## Phase 2 Feature Requests (Tracked, Not in Current Scope)

- **Firm-level custom feature code libraries.**
- **Firm-level custom SOS parser** for legacy as-staked conventions (~2 days per firm).
- **Role-scoped dashboards.**
- **Feature-code color visibility in QC view.**
- **Per-chief accuracy intelligence + AI crew-to-project matching.** Most defensible IP angle.
- **Predictive staking CV.** Intelligence Layer add-on.
- **Direction inference / confirmation UX for point-feature offsets.**

---

## Key People & Resources

**Drew — CEO of Focus School Software.** SaaS operator with scale experience. Recommends sell-now; Theo committed to finishing Phase 1 MVP loop first. Strategic counterweight for sales/timing tradeoffs.

---

## Lessons Banked (Technical)

- **Wheel zoom + React + Safari:** `onWheel` prop is passive by default — can't preventDefault. Attach via `useEffect` + `addEventListener` with `{ passive: false }`.
- **Ancestor scroll containers fight for wheel events.** Use `overscroll-behavior: contain` on wrapper.
- **Overlay UI inside a canvas needs scroll bypass** via `data-canvas-scroll-region` attribute and `closest()` check.
- **Empty-state early return breaks refs.** Always mount wrapper, conditionally render content inside.
- **Functional setState calling callbacks during render = infinite loop.** Use imperative setState.
- **Empty `useEffect` deps + ref-based reads = correct pattern for once-per-mount event listeners.**
- **React 18 StrictMode mounts twice in dev.** Cleanup handlers matter.
- **Zero-consumer-change integration pattern.** Lift ZERO state to parents when extending shared components.
- **Layout concerns don't belong inside shared components.**
- **Find-point parent toggle pattern.** Re-capture anchorRect on every click, set visibility true unconditionally, separate close path.
- **Log-scale zoom-responsive sizing** with floor at 1x.
- **Label AABB collision, first-render-wins** sorted by point_id.
- **SVG text at deep zoom is a Safari trap.** WebKit refuses sub-pixel text.
- **Supabase silent UPDATE failure under RLS.** When no UPDATE policy matches, returns error: null, count: 0.
- **Optimistic list UI + parent refresh = flicker.** Local state alone is sufficient if child handles its own persistence.
- **env() safe-area padding requires `viewport-fit=cover`.**
- **Incognito time tracking principle for field users.** Timestamps in DB, hidden from crew UI.
- **Define the input format, don't accommodate the mess.** Modern dev speed + per-customer parser config beats universal fuzzy parser.
- **Parser grammar design: single separator + colon for "between."** Dash primary, colon for line-stake relationship.
- **Dev-mode gating discipline.** Triple-layer gate: route, sidebar link, component render.
- **Legacy CHECK constraints from earlier stages can block new schema.** Migration 16 dropped legacy CHECKs on `actual_offset_direction` (was N/S/E/W only) and `parsed_stake_type`/`declared_stake_type` (was single-letter codes). When extending column semantics across stages, audit existing CHECK constraints for incompatibility before INSERT/UPDATE.
- **`stakeout_qc_runs` uses `id` as PK and `submitted_at` as timestamp** — no `created_at` column, no `run_id` column. Schema introspection is faster than guessing.

---

## AI Dev Workflow (How We Work)

**Multi-tool architecture:** Claude web chat (strategy + prompt-writing), Claude Code CLI (autonomous coding), Gemini (research).

**Prompt discipline for Claude Code:** what to read first, what to deliver, specific constraints, explicit regression checks, report-when-done structure. One prompt = one paste; embedded code fences are instructions.

**Partner-mode (not tutor-mode):** direct pushback both ways, concise responses for narrow topics, skip decision-fatigue framing, surface counterweights.

**Commit discipline:** smaller increments, descriptive messages naming stage + what shipped, push at sub-stage boundaries, revert cleanly when cross-view regressions appear.

---

## Session Log

### 2026-04-24 (late evening) — Stage 10.1 + 10.2 shipped, validated end-to-end

**Pushed earlier in same date:** all Stage 9 commits (`b2e545c` was last).

**Shipped this session, locally only:**
- `2b5a276` — Stage 10.1: SOS parser + dev tester. 46-test suite passing.
- `3be2b37` — Stage 10.2: matching engine + migration 16 + processRun + matcher playground. 28-test matcher suite passing.

**Migration 16 applied** (manually via SQL Editor): added `shot_type text` + `design_point_id_b uuid` to `stakeout_qc_points`; dropped legacy CHECK constraints on `actual_offset_direction` (was N/S/E/W) and on parsed/declared_stake_type (was single-letter codes); extended h_status/v_status CHECKs to permit new classifier values.

**Validation against `8.5_TESTING` assignment (2026-04-24):**
- All 6 shot types classify correctly
- Re-upload regression: total qc_points stays at 7, prior run deleted, new run row written with correct counts
- 28 matcher tests pass + 46 parser tests pass

**Decided this session:**
- **SurveyOS owns input formats.** SOS grammar is ours; firms adopt or pay for custom parser. Apple-style opinionated default. Added to Architectural Constraints.
- **Stage 10 is category-defining.** No competitor has this complete loop. Industry gap confirmed via Trimble HTM tolerance report review (sample provided by Theo).
- **Per-chief accuracy intelligence is the most defensible IP angle.** Logged as memory + Phase 2 feature; consider provisional patent when algorithm crystallizes.
- **Patents not pursued during Phase 1.** Execution velocity + customer relationships > IP strategy at this stage.
- **Bearings stored as decimal-degree string** for point/check shots; "perpendicular" literal for line stakes.
- **Side-agnostic line-stake matching for MVP.**
- **Most-recent-wins for duplicates.** Earlier observations dropped pre-match.
- **Re-upload overwrites.** Drops prior `stakeout_qc_runs` row, cascades to qc_points.

**Open for next: Stage 10.3 — CSV upload UI.**
- **Primary path: chief mobile.** Trimble Access on data collector exports CSV → email/AirDrop/Files share → SurveyOS crew app accepts via iOS file picker → triggers processRun → renders scoreboard (10.4).
- **Fallback path: PM desktop.** AssignmentDetail gets a CSV upload zone for the case where chief defers and PM handles ingestion.
- **Scope discussion in progress.** Key open questions: (1) where is the upload entry point in CrewApp — embedded in CrewAssignmentDetail or separate screen? (2) what does the chief see during processing — spinner + estimate? (3) what happens when 0 codes parse — block upload or proceed with parse_error rows? (4) PM desktop upload UX — drop zone or button? where on AssignmentDetail page?

---

### 2026-04-24 (evening) — Stage 9 pushed + Stage 10.1 shipped

(See git log for commit-by-commit; full detail compressed for journal brevity.)

Stage 9 (crew mobile UI) pushed to origin at `b2e545c`. Stage 10.1 (SOS parser) shipped locally at `2b5a276`. SOS grammar locked. IP strategy reviewed. Predictive accuracy vision logged.

---

### 2026-04-24 (afternoon) — Stage 9 (crew mobile UI) shipped

Six commits 9.1 through 9.4c shipped and pushed. Migration 15 added scope_checklist and chief_field_notes columns. RLS policy added for field role UPDATEs.

---

### 2026-04-24 (earlier) — Stage 8.5b-polish complete

8 commits rebuilt cleanly on `feature/stakeout-qc`, all pushed at `5418c8f`. Layout-in-shared-components constraint locked. Find-point pattern, zoom-responsive sizing, label collision all banked as lessons.

---

### 2026-04-23 — Stage 8.5b-polish commits 1, 2, 2b, 2c (reverted)

Wrapper padding inside shared component broke AssignmentDetail QC view. Reverted. Lesson banked.

---

### 2026-04-22 — Stage 8.5b attempt & rebuild plan

8.5b WIP broken; stashed for reference. Rebuild plan via Path 2. Drew formalized as strategic resource. CLAUDE_JOURNAL.md established. Pricing framework captured.

---

## End-of-Session Protocol

When closing a chat session, before starting a new one, update this file with:

1. **Session Log entry** — dated, what shipped, what was attempted, what stashed, what's open
2. **Current State** section — update branch, commit, environment, next action
3. **Phase 1 Roadmap** table — update status column for any stages completed
4. **Known Bugs** — add any new bugs discovered
5. **Phase 2 Feature Requests** — add any new deferred features
6. **Key Design Decisions** — add any new locked decisions
7. **Lessons Banked** — add any new technical insights
8. **Pricing Framework** — update if tiers, add-ons, or strategy evolve

Keep entries concise. Link to commits and PR URLs where relevant. Don't duplicate information that lives in git commits; this is for things git doesn't capture — intent, context, deferred decisions, relationship details.

Commit the journal update alongside your code changes. The journal is part of the codebase.