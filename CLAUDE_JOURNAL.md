# CLAUDE_JOURNAL.md

**Purpose:** This file is the authoritative, living record of SurveyOS project state for any Claude instance (chat or Claude Code) picking up work. It's committed to the repo and updated at the end of major sessions. Read this first; orient fast; execute.

**Usage at session start:**
> Read `CLAUDE_JOURNAL.md`, orient yourself, then continue from the last session log entry.

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
- **Stakeout QC** — Phase 1 focus; Stage 10 is the defining capability (see Stage 10 note below)
- **Client Portal** — deliverables + invoices + payment
- **Fee Schedule Engine** — proposal generation
- **SurveyNet** — monument database (Phase 1.5/2 priority with GDACS integration)
- **IntelligenceDrawer** — AI summaries per chief/crew
- **Immutable Liability Vault** — audit trail for legal defensibility
- **FinTech layer** — Stripe Connect invoicing, targets 13-day DSO vs industry 67-day average

**Wedge for sales:** invoicing + client portal + core PM. The AR-acceleration story (50-day DSO reduction) is the headline value prop for initial design-partner conversations.

**Stage 10 significance:** Stakeout QC moves from feature to category-definer here. No current product in the industry (Trimble Access, Leica Captivate, TBC, Carlson) provides the specific workflow SurveyOS is building: offset-aware QC compute that gives the chief a green-light / red-flag scoreboard before leaving site, with cumulative per-chief accuracy intelligence feeding later crew-to-project AI matching. Building blocks exist in fragments across vendors; the complete loop does not. See Stage 10 section for the SOS grammar and architecture.

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
| 9 (minus 9.5 push) | Crew field view UI (mobile-first) — shell, today list, upcoming list, assignment detail, scope checklist, chief field notes, status transitions | ✅ Shipped (`b2e545c`) |
| 9.5 | Push notifications (iOS 16.4+ caveat) | ⏸ Deferred indefinitely |
| 10.1 | SOS grammar spec + parser module + dev tester | ✅ Shipped locally (`2b5a276`) |
| **10.2** | **Matching engine — parsed rows → design point resolution → stakeout_qc_points** | **⏳ Next** |
| 10.3 | CSV upload UI (chief mobile + PM desktop) | ⏳ Pending |
| 10.4 | Chief-facing QC scoreboard | ⏳ Pending |
| 10.5 | PM manual-match + field-fit reconciliation | ⏳ Pending (possibly merge to Stage 12) |
| 11 | Accuracy narratives (Supabase edge function + pg_cron, Claude-generated summaries) | ⏳ Pending |
| 12 | Integration (CommandCenter tile, nav wiring, MorningBrief, client portal) | ⏳ Pending |
| 13 | Testing + polish (refactor, CASCADE fix, seeder fix, file-size refactor, off-view indicator, stacked points UX, Safari deep-zoom label fix, control-point selectability, export controls CSV, grid tiering, snapshot export, RLS tightening) | ⏳ Pending |

**Progress:** Stages 1-9 shipped; Stage 10 in progress (10.1 local, 10.2-10.5 pending).

---

## Current State (as of 2026-04-24, end of evening session)

**Git:**
- Feature branch: `feature/stakeout-qc`
- Latest remote push: `b2e545c` (Stage 9.4c)
- Local unpushed: `2b5a276` (Stage 10.1: SOS parser) + journal update (this commit)
- Working tree: clean after journal commit

**Environment:**
- Vite: `http://localhost:5174` (port 5173 in use)
- Claude Code CLI: active
- Primary test browser: Safari (desktop + responsive mode for mobile testing)
- Dev tools accessible in sidebar: "SOS Parser Tester" link at `/dev/sos-parser`, visible only in `npm run dev` builds

**Test data state:**
- 513-point "8.5A_TESTING" project still the main Stakeout QC test dataset
- Two assignments attached to `theo@surveyos.com` as `party_chief`: `8.5_TESTING` dated today, `Test Alpha` dated +3 days. Both can be reset via Stage 9 testing SQL in session log.
- Migration 15 applied: `stakeout_assignments` has `scope_checklist jsonb` + `chief_field_notes text` columns
- RLS policy "Field roles update own assignments" on `stakeout_assignments` allows party_chief/field_crew to UPDATE own assigned rows. Stage 13 item: tighten via trigger/RPC to restrict column writes.

**Next action:** Stage 10.2 — matching engine. Consume parsed SOS codes (from 10.1), resolve `design_refs` against the assignment's design points, compute expected-vs-actual staked location, write results to `stakeout_qc_points` with status classification (in_tol / out_of_tol / field_fit / check_pass / check_fail / unmatched). Pure backend/logic work with DB writes. No new UI yet — 10.3 adds upload UI on top. Stage 10.2 scope discussion needed before prompting.

---

## Stage 9 Recap (what shipped)

Commits on `feature/stakeout-qc`:
- `480d02b` — 9.1: Crew mobile app shell + role-based routing fork
- `a4c919b` — 9.2: Today's assignments list with real Supabase data
- `ec6da51` — 9.3: Upcoming tab + extract shared `useCrewAssignments` hook
- `a88a866` — 9.4a: Crew assignment detail + status transitions
- `1ef7783` — 9.4b: Scope checklist + chief field notes, drop plan view
- `b2e545c` — 9.4c: Drop checklist flicker + detime submit message + drop 'reconcile'

Architecture:
- `src/components/crew/CrewApp.jsx` — mobile shell with header + 3-tab bottom nav (Today / Upcoming / Profile), sticky above and below with `env(safe-area-inset-*)` padding
- `src/components/crew/CrewToday.jsx`, `CrewUpcoming.jsx`, `CrewProfile.jsx` — tab contents
- `src/components/crew/AssignmentCard.jsx` — reusable card for list rendering with status pill + relative date
- `src/components/crew/CrewAssignmentDetail.jsx` — three-mode detail screen driven by assignment status (`sent` = pre-work info, `in_progress` = active work with scope checklist + tolerances + field notes, `submitted` = read-only summary)
- `src/components/crew/ScopeChecklist.jsx` — interactive checklist with optimistic local state + Supabase write on tap (no parent refresh — avoids flicker)
- `src/components/crew/ChiefFieldNotes.jsx` — textarea with 800ms debounced auto-save and transient "Saved" indicator
- `src/components/crew/ConfirmSubmitModal.jsx` — bottom-sheet confirm dialog for Submit for QC
- `src/hooks/useCrewAssignments.js` — fetches assignment list with `today_and_prior` or `upcoming` date filter
- `src/hooks/useCrewAssignmentDetail.js` — single-assignment fetch with `refresh()` for status transitions

Plan view removed from crew detail entirely — chiefs use Trimble Access for field navigation; SurveyOS plan view is noise in the field context. Future replacement: PDF attachment area where PM uploads plan sheets, topo limits, etc. (memory-tracked as Stage 9+/Phase 2 feature).

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

Spec lives at `docs/sos-stake-code-standard.md` (committed).

### Stage 10 sub-commits

- **10.1 (shipped, local):** SOS grammar doc + parser module (`src/lib/sosParser.js`) + unit tests (46/46) + dev-mode tester at `/dev/sos-parser`
- **10.2 (next):** Matching engine — parsed rows → resolve against assignment's design points → compute expected staked location (offset-aware) → compare actual → classify → write `stakeout_qc_points`
- **10.3:** CSV upload UI — chief mobile (primary path) + PM desktop (fallback)
- **10.4:** Chief-facing QC scoreboard — the killer UX moment; big numbers, green/yellow/red, "you can leave site" or "go fix point 4007"
- **10.5:** PM manual-match + field-fit reconciliation UI (desktop)

### Key product decisions (locked)

- **Dash separator for SOS codes.** Matches industry familiarity. Colon for the "between A and B" line-stake relationship (removes dash-counting ambiguity).
- **No direction hint in codes.** Chiefs don't reliably type direction; MVP does distance-only QC for point features. Line features derive direction from design geometry (perpendicular to line). Phase 2 may add direction inference/confirmation UX.
- **Side-agnostic line-stake matching (proposed for 10.2).** Check the perpendicular distance from as-staked point to the design line; if within tolerance, accept regardless of side. If side matters for a project, PM flags manually.
- **Incognito time tracking principle applies throughout Stage 10.** Upload timestamp captured in DB; scoreboard never shows "you finished at 4:47pm."
- **Per-chief accuracy profile (future, Phase 2+).** Stage 10 writes deltas to `stakeout_qc_points`; over time, aggregation across assignments produces per-chief accuracy intelligence feeding AI crew-to-project matching. Most defensible IP angle — no competitor aggregates field QC into a dispatch decision layer. Consider provisional patent when algorithm is concrete.

### Trimble tolerance report — not the input format

Reviewed Trimble's HTM tolerance report (sample `2025-885-01TB_260306.htm`). Produces raw point-to-point coordinate deltas with no offset awareness; flags nearly every row red when offset staking is in use. Confirms the industry gap SurveyOS is closing. SurveyOS ingests the raw as-staked CSV (PNEZD format) and does offset-aware compute itself.

---

## Deferred Stages

### Stage 9.5 — Push notifications (iOS 16.4+)

Deferred indefinitely. Rationale:
- Push is convenience, not capability — a chief can open the app manually and get the same workflow
- Cross-system scope (frontend, service worker, Supabase DB, Supabase Edge Functions, iOS/Android browser push stacks) makes debugging expensive; realistic estimate is 4–6 hours with possible blow-out to 8+
- Stage 10 (crew session upload + QC compute) is the demo-worthy capability that sells design partners; push is not
- Better to build push once we know what real events exist to notify about (e.g., "PM reconciled your work")

Slot whenever Theo has a focused weekend block OR when a design partner explicitly requests it. Infrastructure to preserve: Stage 8 already shipped the service worker scaffold, so push adds onto that cleanly when we return.

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

**Product decision deferred:** In AssignmentDetail's QC view, `pointStatusMap` causes every pending point to render teal, fully suppressing feature-code colors. Options for later: dual-channel (fill=status, border=feature_code), explicit toggle, or leave as-is (status is the primary signal in QC view). Tracked in Phase 2 Feature Requests.

---

## Key Design Decisions (Locked)

- **Tolerance defaults:** horizontal 0.060 ft, vertical 0.030 ft (firm-level configurable)
- **Feature-code grammar (design side):** `FEATURE-OFFSET-STAKETYPE` (e.g., `TBC-5FT-HUB`) — the PM's design intent notation
- **As-staked code grammar (field side):** SOS v1 (see Stage 10 section) — what chiefs type after the dash
- **PM sets WHAT to stake; chief decides HOW in field** — division of authority
- **Vertical QC (`v_status`) null in Phase 1** — defer to Phase 2
- **Vocabulary (DB-level):** status enum: draft → sent → in_progress → submitted → reconciled
- **Vocabulary (crew-UX-level):** "reconcile" language dropped in crew-facing copy (accountant verbiage, doesn't fit surveying industry). DB enum stays `reconciled`; UX reads "Your work has been submitted. The PM will take it from here." Stage 13 may rename DB enum but low priority.
- **Pricing positioning:** Stakeout QC is premium feature of top tier
- **Filter behavior:** hide entirely, don't dim (dark-mode canvas makes dimming ineffective)
- **Labels at high zoom:** auto-appear when avg point spacing > 40px; lowest `point_id` wins collision
- **Toolbar chip overflow:** hide 0-count chips by default, inline `+N` / `−` toggle chip expands/collapses; `flex-wrap: wrap` handles dense datasets instead of horizontal scroll (shipped commit 2b)
- **Layout concerns (padding, margins, breathing room):** live at consumer-page level only. Never add to shared components.
- **Find-point parent toggle pattern:** always re-capture `anchorRect` from `e.currentTarget.getBoundingClientRect()` on click and always set visibility true. Separate close path (Escape, outside-click, Cancel, successful zoom) handles hide. Avoids stuck-after-first-click bug class.
- **Zoom-responsive point sizing formula:** `boost = 1 + log2(zoomRatio) * 0.35`, clamped to `[1, 2]`. Floor at 1x prevents shrinking when zoomed out past default.
- **Crew UX principle: incognito time tracking.** "Start work" / "Submit for QC" timestamps persist in DB (`sent_at`, `submitted_at`) but are NOT displayed to the chief. Chiefs are sensitive about being tracked; time logging must be disguised as useful workflow tools. Future project-snapshot export on submit doubles as timesheet AND time-log (deferred to Stage 10 or 13). Applies to Stage 10 upload timestamp too.
- **Crew detail plan view removed.** Chiefs use Trimble Access for field navigation; SurveyOS plan view in crew detail is noise. Future: PDF attachment upload by PM, download/view by chief.
- **Role-based routing (not viewport-based):** `party_chief` and `field_crew` roles always route to CrewApp, even on desktop. Office roles always route to CommandCenter. No viewport-width check.
- **SurveyOS defines its own input formats.** Don't accommodate messy industry data; publish canonical standards, evangelize, integrate per-firm custom parsers for paying customers that need legacy ingestion. Applied to SOS grammar 2026-04-24.

---

## Intellectual Property Strategy (as of 2026-04-24)

Reviewed during Stage 10 scoping discussion.

**Not patentable:** comparing design coordinates to observed coordinates (Trimble prior art); computing tolerance deltas (prior art); CSV upload to cloud (obvious); mobile scoreboard UI (obvious once written).

**Potentially narrow-claim patentable:**
- Parsing `FEATURE-OFFSET-STAKETYPE` code grammar to back out expected offset from observed coordinates and compute corrected delta (narrow claims, uncertain non-obviousness since convention exists)
- Inferring feature-line direction from adjacent design points to auto-compute expected offset direction without PM input (slightly more novel structure)
- **Per-chief accuracy aggregation → AI crew-to-project dispatch pipeline** (most defensible angle; closed-loop system tying QC data to business action)

**Decision:** do not file patents during Phase 1. Real moat is execution velocity + domain expertise + customer relationships, not IP. Patent filing process (provisional $300+attorney, utility $15-30k, enforcement $500k-2M) would distract from shipping. Keep detailed technical notes (journal is prior-use evidence). If a specific clever algorithm emerges during Stage 10-11 that feels genuinely non-obvious (predictive crew-matching pipeline is the candidate), file a provisional at that point. Handle full IP strategy if/when raising capital.

---

## PM Persona Gap (Acknowledged, Deferred to Phase 1.5)

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships and projects without doing crew scheduling are not yet addressed.

**Solution (Phase 1.5/Phase 2 opener):** Role-scoped dashboards via Option D — add `role` field to `user_profiles` (already exists), role-specific default dashboards, navigation visibility by role, separate role for `firm_owner`/PLS.

---

## Known Bugs (Tracked for Stage 13)

- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. Manifested in 7b.2 testing, fixed manually. Stage 13 SQL fix needed.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`. Data integrity issue.
- **[TECH DEBT]** `AssignmentDetail.jsx` at 1549 lines. `DesignPointsPlanView.jsx` at ~1500 lines post-Stage-8.5b-polish. Stage 13 refactor candidates: extract `PointList` (~300 lines), `ResendConfirmModal` (~100 lines), `PointGlyph` (~90 lines), `Tooltip` (~250 lines).
- **[TECH DEBT]** Two Supabase client import patterns coexist: direct `import { supabase } from './supabaseClient'` (used by crew components, Auth, and new 10.1 parser-adjacent code) vs. prop-drilled `supabase` (used by AssignmentsList and older components). Stage 13 could pick one.
- **[TECH DEBT]** Two `parseStakeCode` functions exist in different modules: `src/utils/stakeoutQC.js` handles the design-side `TBC-5FT-HUB` grammar, `src/lib/sosParser.js` handles the as-staked SOS grammar. Different domains, no shadowing risk since imports are explicit. Consolidation or renaming is a Stage 13 polish candidate.
- **[DEFERRED]** Stacked points UX: control point + daily check shots stack at same location, no way to view/click each. Needs data model decision (check shot = observation vs separate table) before visualization.
- **[DEFERRED]** "Controls off-view" indicator when user zooms away from control points.
- **[DEFERRED VISUAL]** Grid styling uniform strokeOpacity 0.4 at every zoom reads as noisy. Consider tiered grid (stronger major lines at round intervals, faint minor lines between). Re-evaluate during Stage 13.
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom (1–2ft viewBox) in Safari. WebKit refuses to render SVG text when computed `font-size` drops below ~0.05px. Chrome renders fine. Best fix: HTML overlay labels positioned over SVG via screen-space math.
- **[DEFERRED UX]** Control points non-selectable. Intentional Stage 8.5a decision that blocks adding them to assignments. Needs UX design: toolbar mode selector, Alt-key modifier, or sidebar "include controls" checkbox.
- **[DEFERRED FEATURE]** "Export controls to CSV" button. Iterate classified controls, format N/E/Z, trigger download. Belongs on AssignmentBuilder page or a project-tools panel.
- **[DEFERRED FEATURE]** Project snapshot PNG export on chief submit. Includes project number/name, scope checklist final state, crew name, and incognito time log (start→submit duration). Chief saves to phone photos. Doubles as weekly timesheet AND disguised time tracking. Est. ~1 hr; candidate for Stage 10.4 or Stage 13.
- **[DEFERRED FEATURE]** PM-side scope checklist authoring in AssignmentBuilder. Currently chiefs can only tick items; PM must seed checklist via SQL. Phase 1.5 or Stage 13. Data model: `stakeout_assignments.scope_checklist jsonb` array of `{id, label, done}`.
- **[DEFERRED FEATURE]** PDF attachment area on crew assignment detail. PM uploads plan sheets, topo limits, site maps, easement docs when building assignment. Chief downloads/views in crew detail. Replaces the removed plan view. Consider PDF viewer lib or download-to-device pattern.
- **[DEFERRED FEATURE]** GPS tracking of "Start work" tap — capture lat/lon alongside timestamp to prove on-site. Useful for billing disputes and DOT/federal compliance. Privacy/consent UX needs design.
- **[DEFERRED SECURITY]** Sandbox RLS policies (tracked in auth_roles_status.md). Several tables have `Sandbox Master` policies granting `ALL` to `authenticated` users — legacy dev bypasses. Scope or remove before first paying pilot.
- **[DEFERRED SECURITY]** Field role UPDATE permission on `stakeout_assignments` is row-level only (their assigned rows, any column). Tighten via DB trigger or Supabase RPC to restrict column writes to `status + submitted_at + chief_field_notes + scope_checklist` only. Current approach accepted for speed; revisit before first paying pilot.

---

## Phase 2 Feature Requests (Tracked, Not in Current Scope)

- **Firm-level custom feature code libraries.** Every firm uses slightly different codes (TBC vs BCURB vs CURB). Build "Firm Settings → Feature Code Library" admin panel where firms upload CSV mapping their codes to SurveyOS canonical with optional color overrides. Architecture: Phase 1 uses canonical; Phase 2 wraps with per-firm override layer.
- **Firm-level custom SOS parser.** When a firm adopts SurveyOS with legacy as-staked code conventions different from SOS v1, build a per-firm parser config (regex + extraction spec in `firm_code_mappings` table). One-time implementation per firm; ~2 days of work.
- **Role-scoped dashboards** — see PM Persona Gap above.
- **Feature-code color visibility in QC view.** Status-color precedence currently hides feature-code colors in AssignmentDetail. Dual-channel rendering (fill=status, border=feature) or user-toggle is the likely solution.
- **Per-chief accuracy intelligence + AI crew-to-project matching.** Aggregate QC deltas over time per chief per feature-type per equipment-type. Surface as dispatch recommendations. Most defensible IP angle; may warrant provisional patent when algorithm is concrete.
- **Predictive staking CV.** Computer vision on photos of stakes to verify placement. Listed as an Intelligence Layer add-on ($99–$350/mo).
- **Direction inference / confirmation UX for point-feature offsets.** Stage 10.2 does distance-only QC for point features (chief doesn't type direction). Phase 2 may add inferred direction display with PM-confirmation workflow.

---

## Key People & Resources

**Drew — CEO of Focus School Software.** My friend. SaaS operator with scale experience. Said I'm outpacing Focus's lead developers in Claude usage. Believes SurveyOS can outpace Focus's initial growth. Recommended selling now; I pushed back and committed to finishing Phase 1 MVP loop first (morning brief + command/dispatch + field-to-office sync + monument DB + StakeoutQC + invoicing). Drew is an ongoing strategic resource with deep industry operator knowledge — when making sales/timing tradeoffs, surface his likely perspective as counterweight to my perfectionist instincts. Potential future advisor.

---

## Lessons Banked (Technical)

- **Wheel zoom + React + Safari:** `onWheel` prop is passive by default — can't preventDefault. Attach via `useEffect` + `addEventListener` with `{ passive: false }`.
- **Ancestor scroll containers fight for wheel events.** Use `overscroll-behavior: contain` on wrapper.
- **Overlay UI inside a canvas needs scroll bypass.** Canvas wheel handler should `closest('[data-canvas-scroll-region]')` check first and skip its `preventDefault` when true. Put the marker attribute on the outermost panel div so all descendants (header, body, buttons) match via the ancestor walk.
- **Empty-state early return breaks refs.** Always mount wrapper, conditionally render content inside.
- **Functional setState calling callbacks during render = infinite loop.** Use imperative setState for render-phase updates.
- **Empty `useEffect` deps + ref-based reads = correct pattern for once-per-mount event listeners.**
- **React 18 StrictMode mounts twice in dev.** Cleanup handlers matter.
- **Zero-consumer-change integration pattern:** lift ZERO state to parents when extending shared components. All integration through component's internal state. Proven across AssignmentBuilder, AssignmentDetail, AssignmentPointsEditor, plus crew components.
- **Layout concerns don't belong inside shared components.** Padding, margins, and horizontal breathing room cascade unpredictably to every consumer. The "Seed test QC data" dev button in AssignmentDetail is absolutely positioned and depends on the shared canvas NOT restructuring its own layout. Solve layout at the page level, never inside DesignPointsPlanView.
- **Find-point parent toggle pattern:** for a portaled popover anchored to a toolbar button, ALWAYS re-capture `e.currentTarget.getBoundingClientRect()` on click and ALWAYS set visibility true (don't toggle-via-`!prev`). A separate close path (Escape / outside-click / Cancel button / successful zoom) handles hide. Avoids stuck-after-first-click bug class where a cached anchor rect or a toggle race leaves the popover in an inconsistent state.
- **Log-scale zoom-responsive sizing:** `boost = 1 + log2(zoomRatio) * 0.35`, clamped `[1, 2]`. At 2x zoom → 1.35x, at 4x → 1.7x, at 8x+ → capped 2x. Floor at 1x prevents shrinking below default when zoomed out. Feels proportional without exploding.
- **Label AABB collision, first-render-wins:** sort points by `point_id` ascending (numeric when possible, else string), iterate and place labels; for each candidate compute a rectangle `[x, y, x+labelW, y+labelH]` in SVG units, compare against already-placed rectangles, skip if any overlap. Deterministic (lowest point_id wins every time).
- **SVG text at deep zoom is a Safari trap.** When `font-size` in SVG units corresponds to less than ~0.05 screen pixels, Safari/WebKit stops rendering the glyphs entirely while reporting them present in the DOM. Chrome renders fine. Robust solution: HTML overlay positioned via screen-space math; fragile solution: floor font-size at a minimum SVG-unit value (trades invisible for gigantic).
- **Supabase silent UPDATE failure under RLS.** When an UPDATE has no matching RLS policy, the client returns `error: null, count: 0`. Looks like success; affects zero rows. Diagnostic pattern: run the UPDATE, re-SELECT to verify the change, then check `pg_policies` for missing UPDATE policy on that role. RLS policy that mirrors an existing SELECT policy (same USING clause + WITH CHECK for row identity preservation) fixes it.
- **Optimistic list UI + parent refresh = flicker.** When a child component updates DB optimistically from local state, triggering a parent refetch AFTER every change causes visible page re-render / flash. Local state alone is sufficient if the component handles its own persistence. Only refresh parent when the change affects data other siblings depend on.
- **env() safe-area padding requires `viewport-fit=cover`.** Without this in the viewport meta tag, `env(safe-area-inset-*)` returns 0 on notched iPhones. Easy miss.
- **Incognito time tracking principle for field users.** Crew chiefs are sensitive about being tracked. Timestamps can exist in the DB for office review but should not be exposed in crew-facing UI. Disguise time capture as useful workflow tools (buttons that do something + happen to log time).
- **Define the input format, don't accommodate the mess.** When an industry has messy free-text data conventions, modern dev speed makes it cheaper to publish a canonical standard and integrate per-customer custom parsers on demand than to build a universal fuzzy parser. Apple pattern: opinionated defaults that the industry adopts because the outcomes are measurably better. Applied to SOS grammar 2026-04-24.
- **Parser grammar design: single separator + colon for "between."** SOS v1 uses dash as primary separator, colon only for the line-stake "between A and B" relationship. Single separator keeps parser simple; colon-for-relationship removes dash-counting ambiguity without adding visual noise.
- **Dev-mode gating discipline.** Triple-layer gate: `import.meta.env.DEV` on route registration, sidebar link, AND component render. Protects against any one layer accidentally leaking to prod. Pattern established in SosParserTester.

---

## AI Dev Workflow (How We Work)

**Multi-tool architecture:**
- **Claude web chat** — strategy, planning, prompt-writing, code review, debugging discussions
- **Claude Code CLI** — autonomous coding (multi-agent swarms across Git worktrees). Receives tightly-written prompts from web chat.
- **Gemini** — research, comparative landscape work

**Prompt discipline for Claude Code:**
- Frame: what to read first, what to deliver, specific constraints, explicit regression checks, report-when-done structure
- Report requests: context summary, line counts, ambiguities, build result, manual QA items, confirmation of no-consumer-change
- Length: detailed, spec-heavy, examples welcome. Claude Code performs better with more context.
- One prompt = one paste. Embedded code fences are instructions to Claude Code, not separate prompts. Keep the opening and closing fence of the outer prompt as markers.

**Partner-mode (not tutor-mode):**
- Direct pushback welcomed in both directions
- Concise responses for narrow topics, long responses only for scope/stakes
- Skip decision-fatigue-reduction framing
- Trust the operator's judgment; surface counterweights when appropriate

**Commit discipline:**
- Smaller increments when rolling back granularity matters
- Descriptive commit messages naming the stage and what shipped
- WIP branches for experimental work, never merge broken to feature branch
- Push regularly (ideally at sub-stage boundaries so work isn't lost)
- When a commit causes cross-view regressions (view A looks fine, view B breaks), `git revert` the commit cleanly rather than trying to patch-fix. Revert preserves history and keeps the branch shippable.

---

## Session Log

### 2026-04-24 (evening) — Stage 9 pushed + Stage 10.1 shipped

**Pushed to origin:** `e624791..b2e545c` — all six Stage 9 commits (9.1, 9.2, 9.3, 9.4a, 9.4b, 9.4c).

**Shipped locally (not yet pushed at session end):**
- `2b5a276` — Stage 10.1: SurveyOS Stake Code Standard (SOS) v1 + parser module + 46-test suite + dev tester at `/dev/sos-parser`
- Journal update (this commit)

**Decided this session:**
- **Stage 9.5 (push notifications) deferred indefinitely.** Rationale: push is convenience not capability; cross-system debug cost is high; Stage 10 is more valuable for demo/sales. Slot later when a design partner asks or a focused weekend appears.
- **Stage 10 is the category-defining capability.** Chief-facing "can I leave site?" scoreboard + offset-aware QC compute. No current product (Trimble, Leica, Topcon, Carlson) does this complete loop. Genuine industry gap.
- **SurveyOS defines its own input formats.** Industry's messy as-staked code conventions (`4003 - 4002 - 11FT LUP`) are parser-hostile. SurveyOS publishes the SOS canonical grammar; firms adopt; legacy formats become per-firm Phase 2 custom parsers on demand. Added to Architectural Constraints.
- **SOS v1 grammar locked:** `<design_id>-<offset>-<stake>` for point stakes, `<design_id>:<design_id>-<offset>-<stake>` for line stakes, `<design_id>-CHK` for check shots, `CP-CHK` for control checks. Dash primary separator, colon for "between A and B" line-stake relationship. Stake types: HUB, LATHE, NAIL, PK, MAG, PAINT, CP, WHISKER.
- **No direction in codes.** Chiefs don't reliably type direction. MVP does distance-only QC for point features; line features derive perpendicular direction from design geometry.
- **Field-fit flagged in SurveyOS crew app post-upload**, not in the code string itself. Reason codes: OB, AC, SA, CF, OT.
- **Trimble's tolerance report is not the input format.** Raw point-to-point comparison without offset awareness → confirms the industry gap rather than solves it. SurveyOS parses raw as-staked PNEZD CSVs and computes offset-aware QC itself.
- **Patent strategy: not during Phase 1.** Keep detailed technical notes as prior-use evidence. If the per-chief accuracy → AI dispatch algorithm crystallizes in Stage 10-11 as genuinely non-obvious, file a provisional at that point. Otherwise the moat is execution velocity + domain expertise + customer relationships.

**Stage 10.1 artifacts:**
- `docs/sos-stake-code-standard.md` — 110-line authoritative grammar doc, written for chiefs + PMs + developers
- `src/lib/sosParser.js` — 185 lines, pure function `parseStakeCode(raw)` + `parseStakeCodes(list)` batch helper, zero deps
- `src/lib/sosParser.test.js` — 255 lines, 46 test cases covering every grammar form, whitespace/case variants, legacy format rejection, and structural errors. Browser-safe hand-rolled harness (Vitest wrapper deferred since the spec required browser invocation from the dev tester)
- `src/components/dev/SosParserTester.jsx` — 235 lines, dev-only page at `/dev/sos-parser` with paste-and-parse UI + test suite runner
- Triple-layer dev gate: route registration, sidebar link, and component render all behind `import.meta.env.DEV`
- Verified: 46/46 tests pass; dev tester renders only in dev mode; prod build does not register the route

**Deferred from Stage 10.1:**
- Vitest wrapper over the same TEST_CASES array (cheap future polish, Stage 13 candidate)

**Open for next session:** Stage 10.2 — matching engine. Take parsed SOS codes, resolve `design_refs` against the assignment's design points, compute expected-vs-actual staked location (offset-aware), classify (in_tol / out_of_tol / field_fit / check_pass / check_fail / unmatched), write to `stakeout_qc_points`. Pure backend/logic work with DB writes. No UI. Scope discussion needed before prompting — key open questions:

1. Offset direction inference for line stakes: side-agnostic matching (accept whichever side of the line the chief staked) vs. PM-specified side
2. `stakeout_qc_points` schema review — does the table already support offset_used fields, field_fit status, check_shot classification? If not, migration 16.
3. Check-shot logic: compare to control point's established coordinates? To the design point's design coordinates? What's the delta threshold for pass/fail on checks?
4. Handling as-staked rows with no parseable SOS code (parse_error from 10.1) — write to unmatched bucket? Skip?
5. Duplicate handling — same design_ref staked twice by the chief (retake after initial miss) — keep most recent? Both?

---

### 2026-04-24 (afternoon) — Stage 9 (crew mobile UI) shipped; push deferred

**Shipped (all pushed to origin at `b2e545c`):**
- Commit 9.1 (`480d02b`): Mobile crew app shell — CrewApp with header + 3-tab bottom nav, role-based routing fork in App.jsx (party_chief/field_crew → CrewApp, others → CommandCenter), `viewport-fit=cover` added for safe-area support.
- Commit 9.2 (`a4c919b`): Today's assignments list — real Supabase fetch, AssignmentCard reusable component with status pill + relative date formatting.
- Commit 9.3 (`ec6da51`): Upcoming tab — same shape as Today with inverted date filter. Extracted shared `useCrewAssignments` hook.
- Commit 9.4a (`a88a866`): Assignment detail screen with three status-driven modes (sent / in_progress / submitted). Start Work and Submit for QC transitions. ConfirmSubmitModal. Detail-vs-tab rendering in CrewApp via local state.
- Commit 9.4b (`1ef7783`): Scope checklist + chief field notes. Migration 15 adds `scope_checklist jsonb` + `chief_field_notes text` to `stakeout_assignments`. ScopeChecklist component with optimistic local state. ChiefFieldNotes with 800ms debounced auto-save. Plan view removed from crew detail entirely.
- Commit 9.4c (`b2e545c`): Polish pass — dropped parent refresh after checklist taps (fixed flicker), removed submit timestamp from submitted-mode copy (incognito time tracking), dropped "reconcile" from crew-facing copy.

**Schema changes:**
- Migration 15: `stakeout_assignments.scope_checklist jsonb DEFAULT '[]'` + `chief_field_notes text`
- New RLS policy "Field roles update own assignments" on `stakeout_assignments`: party_chief and field_crew can UPDATE their own assigned rows (USING + WITH CHECK both enforce `party_chief_id = auth.uid()`). Column-level restriction is Stage 13 work.

**Debugging notes:**
- Initial Start Work transition silently failed — RLS had SELECT policy for field roles but no UPDATE policy. Silent-zero-row-affected pattern. Fixed by adding the UPDATE policy.
- Checklist taps caused visible page flicker due to `onChange={() => refresh()}` triggering full assignment refetch on every tap. Removing the parent refresh (child handles its own persistence) fixed it.

---

### 2026-04-24 (earlier) — Stage 8.5b-polish complete

**Shipped (rebuild of Stage 8.5b-polish on clean branch, commits 1–4b):**
- Commit 1 (`2cd1396`): feature-group filter chips + canvas toolbar scaffold
- Commit 2 (`51008e9`): feature legend panel + Legend toggle
- Commit 2b (`c35c00c`): legend scroll fix (`data-canvas-scroll-region` + `closest()` bypass) + toolbar chip overflow polish
- Commit 2c (`7391bf4`) reverted by `a73039e` on 2026-04-23: attempted wrapper padding inside shared component; broke AssignmentDetail QC view layout
- Commit 3 (`c234501`): Find-point popover (portaled autocomplete, 300ms animated viewBox tween, fade-out highlight ring)
- Commit 3b (`868101e`): popover right-edge anchor when button sits in right half of viewport + more prominent ring
- Commit 4 (`6305966`): label collision avoidance + zoom-responsive point sizing
- Commit 4b (`5418c8f`): cap label halo at deep zoom

All eight commits pushed to origin as of `5418c8f`.

---

### 2026-04-23 — Stage 8.5b-polish commits 1, 2, 2b, 2c (reverted)

**Shipped:** Commits 1, 2, 2b (see 2026-04-24 session for full detail).
**Reverted:** Commit 2c (wrapper padding inside shared component broke AssignmentDetail QC view layout).
**Decided:** Layout concerns at consumer-page level only; toolbar chip overflow UX locked; legend wheel-scroll pattern locked.

---

### 2026-04-22 — Stage 8.5b attempt & rebuild plan

**Shipped:** Stage 8.5a debug + polish; Stage 8.5b-core (commit `9cb8dfc`).
**Attempted:** Stage 8.5b-polish; Claude Code broke outer wrapper restructure.
**Stashed:** `feature/stakeout-qc-85b-polish-wip` pushed to origin with broken state for reference.
**Decided:** Rebuild 8.5b-polish via Path 2 (not debug Path 1); 8.5b-polish completes before Stage 9; Drew formalized as strategic resource; CLAUDE_JOURNAL.md established; pricing framework captured.

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