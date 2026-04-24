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
- **Stakeout QC** — the feature we're currently building (Phase 1)
- **Client Portal** — deliverables + invoices + payment
- **Fee Schedule Engine** — proposal generation
- **SurveyNet** — monument database (Phase 1.5/2 priority with GDACS integration)
- **IntelligenceDrawer** — AI summaries per chief/crew
- **Immutable Liability Vault** — audit trail for legal defensibility
- **FinTech layer** — Stripe Connect invoicing, targets 13-day DSO vs industry 67-day average

**Wedge for sales:** invoicing + client portal + core PM. The AR-acceleration story (50-day DSO reduction) is the headline value prop for initial design-partner conversations.

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
- **Feature flag dev-only tools:** `import.meta.env.DEV` gates (e.g., AssignmentTestDataSeeder).
- **Migrations in `supabase/migrations/`** — numbered, versioned, descriptive names.
- **Role-based routing in App.jsx:** `user_profiles.role IN ('field_crew', 'party_chief')` routes to `CrewApp`; all other authenticated roles route to desktop CommandCenter. Pure role-based, no viewport-width check.

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
| 9.5 | Push notifications (iOS 16.4+ caveat) | ⏸ Deferred — see Deferred Stages |
| **10** | **Crew session upload + field-fit workflow + QC compute kickoff** | **⏳ Next** |
| 11 | Accuracy narratives (Supabase edge function + pg_cron, Claude-generated summaries) | ⏳ Pending |
| 12 | Integration (CommandCenter tile, nav wiring, MorningBrief, client portal) | ⏳ Pending |
| 13 | Testing + polish (refactor, CASCADE fix, seeder fix, file-size refactor, off-view indicator, stacked points UX, Safari deep-zoom label fix, control-point selectability, export controls CSV, grid tiering, snapshot export, RLS tightening) | ⏳ Pending |

**Progress:** 13/13 stages partially complete — Stage 9 shipped minus the push sub-stage; Stage 10 is next.

---

## Current State (as of 2026-04-24, end of session)

**Git:**
- Feature branch: `feature/stakeout-qc` at `b2e545c` (Stage 9.4c: drop checklist flicker + detime submit message + drop 'reconcile' copy).
- All progress pushed to origin.
- WIP branch `feature/stakeout-qc-85b-polish-wip` remains on origin as reference only — no longer needed.
- Working tree: clean.

**Environment:**
- Vite: `http://localhost:5174` (port 5173 in use)
- Claude Code CLI: active
- Primary test browser: Safari (desktop + responsive mode for mobile testing)

**Test data state:**
- 513-point "8.5A_TESTING" project still the main Stakeout QC test dataset
- Two assignments attached to `theo@surveyos.com` as `party_chief`: `8.5_TESTING` dated today (CURRENT_DATE), `Test Alpha` dated +3 days. Both status `sent`, both reset to empty state by Stage 9 testing SQL
- Migration 15 applied: `stakeout_assignments` has new `scope_checklist jsonb` + `chief_field_notes text` columns
- New RLS policy applied: "Field roles update own assignments" — party_chief/field_crew can UPDATE their own assigned rows. Stage 13 item: tighten via DB trigger or RPC to restrict column writes.

**Next action:** Stage 10 — crew session upload + field-fit workflow + QC compute kickoff. Chief uploads CSV export from Trimble Access; SurveyOS matches observations to design points, computes deltas, auto-populates QC statuses. First scope discussion with Theo before writing prompts.

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
- **Feature-code grammar:** `FEATURE-OFFSET-STAKETYPE` (e.g., `TBC-5FT-HUB`)
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
- **Crew UX principle: incognito time tracking.** "Start work" / "Submit for QC" timestamps persist in DB (`sent_at`, `submitted_at`) but are NOT displayed to the chief. Chiefs are sensitive about being tracked; time logging must be disguised as useful workflow tools. Future project-snapshot export on submit doubles as timesheet AND time-log (deferred to Stage 10 or 13).
- **Crew detail plan view removed.** Chiefs use Trimble Access for field navigation; SurveyOS plan view in crew detail is noise. Future: PDF attachment upload by PM, download/view by chief.
- **Role-based routing (not viewport-based):** `party_chief` and `field_crew` roles always route to CrewApp, even on desktop. Office roles always route to CommandCenter. No viewport-width check.

---

## PM Persona Gap (Acknowledged, Deferred to Phase 1.5)

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships and projects without doing crew scheduling are not yet addressed.

**Solution (Phase 1.5/Phase 2 opener):** Role-scoped dashboards via Option D — add `role` field to `user_profiles` (already exists), role-specific default dashboards, navigation visibility by role, separate role for `firm_owner`/PLS.

---

## Known Bugs (Tracked for Stage 13)

- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. Manifested in 7b.2 testing, fixed manually. Stage 13 SQL fix needed.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`. Data integrity issue.
- **[TECH DEBT]** `AssignmentDetail.jsx` at 1549 lines. `DesignPointsPlanView.jsx` at ~1500 lines post-Stage-8.5b-polish. Stage 13 refactor candidates: extract `PointList` (~300 lines), `ResendConfirmModal` (~100 lines), `PointGlyph` (~90 lines), `Tooltip` (~250 lines).
- **[TECH DEBT]** Two Supabase client import patterns coexist: direct `import { supabase } from './supabaseClient'` (used by crew components and Auth) vs. prop-drilled `supabase` (used by AssignmentsList and older components). Stage 13 could pick one.
- **[DEFERRED]** Stacked points UX: control point + daily check shots stack at same location, no way to view/click each. Needs data model decision (check shot = observation vs separate table) before visualization.
- **[DEFERRED]** "Controls off-view" indicator when user zooms away from control points.
- **[DEFERRED VISUAL]** Grid styling uniform strokeOpacity 0.4 at every zoom reads as noisy. Consider tiered grid (stronger major lines at round intervals, faint minor lines between). Re-evaluate during Stage 13; the zoom-responsive point sizing + label dedup from commit 4 already resolved most of the perceived clutter.
- **[DEFERRED VISUAL]** Labels invisible at extreme zoom (1–2ft viewBox) in Safari. WebKit refuses to render SVG text when computed `font-size` drops below ~0.05px. Chrome renders fine. Best fix: HTML overlay labels positioned over SVG via screen-space math, rather than SVG `<text>` with sub-pixel sizes.
- **[DEFERRED UX]** Control points non-selectable. Intentional Stage 8.5a decision that blocks adding them to assignments. Needs UX design: toolbar mode selector, Alt-key modifier, or sidebar "include controls" checkbox.
- **[DEFERRED FEATURE]** "Export controls to CSV" button. Iterate classified controls, format N/E/Z, trigger download. Belongs on AssignmentBuilder page or a project-tools panel.
- **[DEFERRED FEATURE]** Project snapshot PNG export on chief submit. Includes project number/name, scope checklist final state, crew name, and incognito time log (start→submit duration). Chief saves to phone photos. Doubles as weekly timesheet AND disguised time tracking. Est. ~1 hr; candidate for Stage 10 or Stage 13.
- **[DEFERRED FEATURE]** PM-side scope checklist authoring in AssignmentBuilder. Currently chiefs can only tick items; PM must seed checklist via SQL. Phase 1.5 or Stage 13. Data model: `stakeout_assignments.scope_checklist jsonb` array of `{id, label, done}`.
- **[DEFERRED FEATURE]** PDF attachment area on crew assignment detail. PM uploads plan sheets, topo limits, site maps, easement docs when building assignment. Chief downloads/views in crew detail. Replaces the removed plan view. Consider PDF viewer lib or download-to-device pattern.
- **[DEFERRED FEATURE]** GPS tracking of "Start work" tap — capture lat/lon alongside timestamp to prove on-site. Useful for billing disputes and DOT/federal compliance. Privacy/consent UX needs design.
- **[DEFERRED SECURITY]** Sandbox RLS policies (tracked in auth_roles_status.md). Several tables have `Sandbox Master` policies granting `ALL` to `authenticated` users — legacy dev bypasses. Scope or remove before first paying pilot.
- **[DEFERRED SECURITY]** Field role UPDATE permission on `stakeout_assignments` is row-level only (their assigned rows, any column). Tighten via DB trigger or Supabase RPC to restrict column writes to `status + submitted_at + chief_field_notes + scope_checklist` only. Current approach accepted for speed; revisit before first paying pilot.

---

## Phase 2 Feature Requests (Tracked, Not in Current Scope)

- **Firm-level custom feature code libraries.** Every firm uses slightly different codes (TBC vs BCURB vs CURB). Build "Firm Settings → Feature Code Library" admin panel where firms upload CSV mapping their codes to SurveyOS canonical with optional color overrides. Architecture: Phase 1 uses canonical; Phase 2 wraps with per-firm override layer.
- **Role-scoped dashboards** — see PM Persona Gap above.
- **Feature-code color visibility in QC view.** Status-color precedence currently hides feature-code colors in AssignmentDetail. Dual-channel rendering (fill=status, border=feature) or user-toggle is the likely solution.

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
- **Layout concerns don't belong inside shared components.** Padding, margins, and horizontal breathing room cascade unpredictably to every consumer. The "Seed test QC data" dev button in AssignmentDetail is absolutely positioned and depends on the shared canvas NOT restructuring its own layout. Solve layout at the page level (AssignmentBuilder page, AssignmentDetail page, AssignmentPointsEditor page), never inside DesignPointsPlanView.
- **Find-point parent toggle pattern:** for a portaled popover anchored to a toolbar button, ALWAYS re-capture `e.currentTarget.getBoundingClientRect()` on click and ALWAYS set visibility true (don't toggle-via-`!prev`). A separate close path (Escape / outside-click / Cancel button / successful zoom) handles hide. This avoids the stuck-after-first-click bug class where a cached anchor rect or a toggle race leaves the popover in an inconsistent state.
- **Log-scale zoom-responsive sizing:** `boost = 1 + log2(zoomRatio) * 0.35`, clamped `[1, 2]`. At 2x zoom → 1.35x, at 4x → 1.7x, at 8x+ → capped 2x. Floor at 1x prevents shrinking below default when zoomed out. Feels proportional without exploding.
- **Label AABB collision, first-render-wins:** sort points by `point_id` ascending (numeric when possible, else string), iterate and place labels; for each candidate compute a rectangle `[x, y, x+labelW, y+labelH]` in SVG units, compare against already-placed rectangles, skip if any overlap. Suppresses text but keeps points visible. Deterministic (lowest point_id wins every time).
- **SVG text at deep zoom is a Safari trap.** When `font-size` in SVG units corresponds to less than ~0.05 screen pixels, Safari/WebKit stops rendering the glyphs entirely while reporting them present in the DOM. Chrome renders fine. Robust solution: HTML overlay positioned via screen-space math; fragile solution: floor font-size at a minimum SVG-unit value (trades invisible for gigantic).
- **Supabase silent UPDATE failure under RLS.** When an UPDATE has no matching RLS policy, the client returns `error: null, count: 0`. Looks like success; affects zero rows. Diagnostic pattern: run the UPDATE, re-SELECT to verify the change, then check `pg_policies` for missing UPDATE policy on that role. RLS policy that mirrors an existing SELECT policy (same USING clause + WITH CHECK for row identity preservation) fixes it.
- **Optimistic list UI + parent refresh = flicker.** When a child component updates DB optimistically from local state, triggering a parent refetch AFTER every change causes visible page re-render / flash. Local state alone is sufficient if the component handles its own persistence. Only refresh parent when the change affects data other siblings depend on.
- **env() safe-area padding requires `viewport-fit=cover`.** Without this in the viewport meta tag, `env(safe-area-inset-*)` returns 0 on notched iPhones. Easy miss.
- **Incognito time tracking principle for field users.** Crew chiefs are sensitive about being tracked. Timestamps can exist in the DB for office review but should not be exposed in crew-facing UI. Disguise time capture as useful workflow tools (buttons that do something + happen to log time).

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

### 2026-04-24 — Stage 9 (crew mobile UI) shipped; push deferred

**Shipped (all pushed to origin at `b2e545c`):**
- Commit 9.1 (`480d02b`): Mobile crew app shell — CrewApp with header + 3-tab bottom nav, role-based routing fork in App.jsx (party_chief/field_crew → CrewApp, others → CommandCenter), `viewport-fit=cover` added for safe-area support.
- Commit 9.2 (`a4c919b`): Today's assignments list — real Supabase fetch, AssignmentCard reusable component with status pill + relative date formatting.
- Commit 9.3 (`ec6da51`): Upcoming tab — same shape as Today with inverted date filter. Extracted shared `useCrewAssignments` hook.
- Commit 9.4a (`a88a866`): Assignment detail screen with three status-driven modes (sent / in_progress / submitted). Start Work and Submit for QC transitions. ConfirmSubmitModal. Detail-vs-tab rendering in CrewApp via local state.
- Commit 9.4b (`1ef7783`): Scope checklist + chief field notes. Migration 15 adds `scope_checklist jsonb` + `chief_field_notes text` to `stakeout_assignments`. ScopeChecklist component with optimistic local state. ChiefFieldNotes with 800ms debounced auto-save. Plan view removed from crew detail entirely.
- Commit 9.4c (`b2e545c`): Polish pass — dropped parent refresh after checklist taps (fixed flicker), removed submit timestamp from submitted-mode copy (incognito time tracking), dropped "reconcile" from crew-facing copy.

**Schema changes:**
- Migration 15: `stakeout_assignments.scope_checklist jsonb DEFAULT '[]'` + `chief_field_notes text`
- New RLS policy "Field roles update own assignments" on `stakeout_assignments`: `party_chief` and `field_crew` can UPDATE their own assigned rows (USING + WITH CHECK both enforce `party_chief_id = auth.uid()`). Column-level restriction is Stage 13 work.

**Debugging notes:**
- Initial Start Work transition silently failed — RLS had SELECT policy for field roles but no UPDATE policy. Silent-zero-row-affected pattern. Fixed by adding the UPDATE policy.
- Checklist taps caused visible page flicker due to `onChange={() => refresh()}` triggering full assignment refetch on every tap. Removing the parent refresh (child handles its own persistence) fixed it.

**Decided this session:**
- Crew UX principle: incognito time tracking. DB captures timestamps; UI hides them from chiefs. Added to Key Design Decisions.
- Plan view removed from crew detail — Trimble Access owns that. Future PDF attachment area replaces it.
- Stage 9.5 (push notifications) deferred indefinitely. Stage 10 is more valuable for demos and sells.
- "Reconcile" dropped from crew-facing UX copy; DB enum unchanged.
- Role-based routing is role-only, no viewport-width check. A party_chief on a desktop browser sees the crew app (works fine via max-width container, future polish).

**Deferred to Stage 10 / Stage 13 / Future:**
- Project snapshot PNG export on submit (chief's disguised timesheet)
- PDF attachment area replacing the removed plan view
- PM-side scope checklist authoring in AssignmentBuilder
- GPS capture on Start Work tap
- Column-scoped RLS tightening on `stakeout_assignments` UPDATE
- Supabase client import pattern unification (direct vs prop-drilled)
- Desktop max-width container for crew app so party_chief on laptop doesn't see stretched mobile layout

**Next session:** Stage 10 — crew session upload + field-fit workflow + QC compute kickoff. Scope discussion before prompts. Trimble Access CSV export is the primary input format.

---

### 2026-04-24 (earlier) — Stage 8.5b-polish complete

**Shipped (rebuild of Stage 8.5b-polish on clean branch, commits 1–4b):**
- Commit 1 (`2cd1396`): feature-group filter chips + canvas toolbar scaffold
- Commit 2 (`51008e9`): feature legend panel + Legend toggle
- Commit 2b (`c35c00c`): legend scroll fix (`data-canvas-scroll-region` + `closest()` bypass) + toolbar chip overflow polish (hide 0-count chips, inline `+N` / `−` expand toggle, `flex-wrap`)
- Commit 2c (`7391bf4`) reverted by `a73039e` on 2026-04-23: attempted wrapper padding inside shared component; broke AssignmentDetail QC view layout
- Commit 3 (`c234501`): Find-point popover (portaled autocomplete, 300ms animated viewBox tween, fade-out highlight ring)
- Commit 3b (`868101e`): popover right-edge anchor when button sits in right half of viewport (fixes off-screen clip) + more prominent ring (3000ms, thicker stroke, glow pulse)
- Commit 4 (`6305966`): label collision avoidance (first-render-wins AABB overlap, lowest `point_id` wins) + zoom-responsive point sizing (log-scale boost up to 2x at deep zoom, floored at 1x)
- Commit 4b (`5418c8f`): cap label halo (removed `Math.max(2 * svgPerPx, 0.3)` floor that became dominant at deep zoom; replaced with clean `1.5 * svgPerPx`)

All eight commits pushed to origin as of `5418c8f`.

**Decided this session:**
- Layout concerns belong at consumer-page level only — non-negotiable architectural constraint (learned from commit 2c revert).
- Toolbar chip overflow UX locked: hide 0-count + inline `+N` / `−` toggle + `flex-wrap`.
- Legend wheel-scroll pattern locked: `data-canvas-scroll-region` on outermost panel div + `closest()` bypass in canvas wheel handler.
- Find-point parent toggle pattern: capture `anchorRect` from `e.currentTarget.getBoundingClientRect()` on every click and set visibility true unconditionally. This avoids the "stuck after first click" bug the original WIP had in its parent logic.
- Point-sizing soft zoom-scale formula: `1 + log2(zoomRatio) * 0.35`, clamped `[1, 2]`. Tested empirically; feels proportional at every zoom without exploding.
- Label collision: first-render-wins with sorted lowest-point_id-first, AABB overlap in SVG units.

---

### 2026-04-23 — Stage 8.5b-polish commits 1, 2, 2b, 2c (reverted)

**Shipped:**
- Commit 1 (`2cd1396`): feature-group filter chips + canvas toolbar scaffold. New `featureCodeGroups.js`, `CanvasToolbar.jsx`. All 22 regression checks green.
- Commit 2 (`51008e9`): feature legend panel + toggle. New `FeatureLegend.jsx`, `featureName()` export added to `featureCodeStyles.js`.
- Commit 2b (`c35c00c`): legend wheel-scroll fix via `data-canvas-scroll-region` attribute + `closest()` bypass in canvas wheel handler; toolbar chip overflow polish (hide 0-count chips with inline `+N` / `−` expand toggle, `flex-wrap` instead of horizontal scroll).

**Reverted:**
- Commit 2c (`7391bf4` → reverted by `a73039e`): attempted canvas/toolbar horizontal breathing room via wrapper padding on DesignPointsPlanView's outer flex container. Revert triggered by visual testing in AssignmentDetail QC view, where the wrapper padding caused the dev-only "Seed test QC data" button to overlap the Legend button. Lesson banked: padding inside a shared component cascades to every consumer; layout breathing room belongs at the consumer-page level.

**Decided this session:**
- Layout concerns belong at consumer-page level only — added to Architectural Constraints as non-negotiable.
- Toolbar chip overflow UX locked (hide 0-count + inline `+N` / `−` toggle + wrap).
- Legend wheel-scroll pattern locked (`data-canvas-scroll-region` on outermost panel div + `closest()` bypass in canvas handler).

---

### 2026-04-22 — Stage 8.5b attempt & rebuild plan

**Shipped:**
- Stage 8.5a debug + polish: wheel zoom, pan/zoom, control detection spatial fallback, intelligent default zoom, tooltip smart-flip fix
- Stage 8.5b-core: full feature-code palette, shape differentiation, control triangle 2x, zoom-responsive labels — committed `9cb8dfc`, pushed
- Integrated tree-code split (CTR coniferous / DTR deciduous / TR generic), TPED for telephone pedestal

**Attempted:**
- Stage 8.5b-polish: filter chips + legend + zoom-to-point + label collision + zoom-responsive point sizing
- Claude Code delivered working components but restructured DesignPointsPlanView outer wrapper (split into outerWrapperRef + containerRef), which broke: layout overflow, wheel zoom, pan, pinch, double-click reset, Find Point state stuck after first click

**Stashed:** `feature/stakeout-qc-85b-polish-wip` pushed to origin with broken state preserved for reference extraction

**Open for next session:** Rebuild 8.5b-polish clean on `feature/stakeout-qc` via Path 2 (not debug Path 1). Extract three WIP children (CanvasToolbar.jsx, FeatureLegend.jsx, ZoomToPointPopover.jsx) via `git show feature/stakeout-qc-85b-polish-wip:path > /tmp/...` as reference. Tighter Claude Code prompt: DO NOT restructure outer wrapper. Commit incrementally.

**Decided this session:**
- 8.5b-polish completes before moving to Stage 9 (not deferred to Stage 13)
- Drew formalized as strategic resource
- CLAUDE_JOURNAL.md established as chat-to-chat continuity mechanism
- Pricing framework captured: Entry $399/mo (3 seats), Pro $599/mo (up to 10 seats, +$1,500 optional onboarding), Enterprise custom ~$1,499+/mo starting (11+ seats), Intelligence Layer add-ons $99-$350/mo

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