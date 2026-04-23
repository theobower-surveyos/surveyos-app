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
- **Feature flag dev-only tools:** `import.meta.env.DEV` gates (e.g., AssignmentTestDataSeeder).
- **Migrations in `supabase/migrations/`** — numbered, versioned, descriptive names.

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
| **8.5b-polish** | **Filter chips, legend, zoom-to-point, label collision, zoom-responsive sizing** | **🔧 IN PROGRESS** |
| 9 | Crew field view UI (mobile-first) + push notifications (iOS 16.4+ caveat) | ⏳ Pending |
| 10 | Crew session upload + field-fit workflow + QC compute kickoff | ⏳ Pending |
| 11 | Accuracy narratives (Supabase edge function + pg_cron, Claude-generated summaries) | ⏳ Pending |
| 12 | Integration (CommandCenter tile, nav wiring, MorningBrief, client portal) | ⏳ Pending |
| 13 | Testing + polish (refactor, CASCADE fix, seeder fix, file-size refactor, off-view indicator, stacked points UX) | ⏳ Pending |

**Progress:** 11/13 stages = ~85%.

---

## Current State (as of 2026-04-22, end of session)

**Git:**
- Main feature branch: `feature/stakeout-qc` at `9cb8dfc` (Stage 8.5b-core, clean, working)
- WIP (broken polish attempt): `feature/stakeout-qc-85b-polish-wip` pushed to origin for reference
- Working tree: clean

**Environment:**
- Vite: `http://localhost:5174` (port 5173 was in use)
- Claude Code CLI: active

**Test dataset:** 513-point allpoints CSV loaded in project "8.5A_TESTING" (Scottsdale, 3234 N. Scottsdale Rd). 488 staking points, 25 control points clustered in ~300×400 ft site. Real Arizona State Plane coordinates (~901391N, ~520795E, ~1175.5Z). Contains "CP_PRI RBCC" control point — exposed classification bug previously, now fixed.

**Next action:** Rebuild 8.5b-polish clean on `feature/stakeout-qc` via Path 2 (rebuild, don't debug). Extract WIP children via `git show` as reference. Tighter Claude Code prompt with explicit constraint: DO NOT restructure outer wrapper of DesignPointsPlanView.

---

## Stage 8.5b-polish Scope (What We're Rebuilding)

Five features, four deliverable components:

1. **Label collision avoidance** — first-render-wins, lowest `point_id` wins collision, AABB overlap test
2. **Zoom-responsive point sizing** — log-based soft scale, max 2x boost at deep zoom
3. **Feature-code filter chips** — 13 groups + "All" (Control / Water / Storm / Sanitary / Gas / Electric / Telecom / Lighting / Curb / Grading / Trees / Structures / Unknown); click isolates, shift-click toggles, hide-not-dim
4. **Feature legend** — toggleable panel, prominent color-swatch button ("[🟢🟡🔵⚪] Legend"), shape indicators match canvas
5. **Zoom-to-point popover** — autocomplete (point ID or feature code), preset distances (5/15/50/100ft + custom), 300ms animated zoom, highlight ring

**Known failure mode from WIP attempt:** Claude Code restructured the canvas into `outerWrapperRef` (flex column) + inner `containerRef` (wheel listener). That restructure broke: layout overflow, wheel zoom, pan, double-click reset, pinch zoom, Find Point button stuck state. **Do not repeat this architectural choice.** Toolbar must be a sibling above the canvas container, not a parent wrapping it.

**Commit strategy for rebuild:** incremental — toolbar + chips first (commit), then legend (commit), then zoom-to-point (commit).

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
- **Feature-code grammar:** `FEATURE-OFFSET-STAKETYPE` (e.g., `TBC-5FT-HUB`)
- **PM sets WHAT to stake; chief decides HOW in field** — division of authority
- **Vertical QC (`v_status`) null in Phase 1** — defer to Phase 2
- **Vocabulary:** "reconciled" status enum: draft → sent → in_progress → submitted → reconciled
- **Pricing positioning:** Stakeout QC is premium feature of top tier
- **Filter behavior:** hide entirely, don't dim (dark-mode canvas makes dimming ineffective)
- **Labels at high zoom:** auto-appear when avg point spacing > 40px; lowest `point_id` wins collision

---

## PM Persona Gap (Acknowledged, Deferred to Phase 1.5)

Current PM-facing build targets scheduler/dispatch persona. Licensed PMs who own client relationships and projects without doing crew scheduling are not yet addressed.

**Solution (Phase 1.5/Phase 2 opener):** Role-scoped dashboards via Option D — add `role` field to `user_profiles`, role-specific default dashboards, navigation visibility by role, separate role for `firm_owner`/PLS.

---

## Known Bugs (Tracked for Stage 13)

- **[BUG]** Stage 7b.1 edit-points removes `stakeout_assignment_points` but CASCADE doesn't reach `stakeout_qc_points`. Manifested in 7b.2 testing, fixed manually. Stage 13 SQL fix needed.
- **[BUG]** Stage 7a seeder may create observations for design points not in `assignment_points`. Data integrity issue.
- **[TECH DEBT]** `AssignmentDetail.jsx` at 1549 lines. `DesignPointsPlanView.jsx` at 1310 lines (core) / 1493 lines (WIP polish). Stage 13 refactor candidates: extract `PointList` (~300 lines), `ResendConfirmModal` (~100 lines), `PointGlyph` (~90 lines), `Tooltip` (~250 lines).
- **[DEFERRED]** Stacked points UX: control point + daily check shots stack at same location, no way to view/click each. Needs data model decision (check shot = observation vs separate table) before visualization.
- **[DEFERRED]** "Controls off-view" indicator when user zooms away from control points.

---

## Phase 2 Feature Requests (Tracked, Not in Current Scope)

- **Firm-level custom feature code libraries.** Every firm uses slightly different codes (TBC vs BCURB vs CURB). Build "Firm Settings → Feature Code Library" admin panel where firms upload CSV mapping their codes to SurveyOS canonical with optional color overrides. Architecture: Phase 1 uses canonical; Phase 2 wraps with per-firm override layer.
- **Role-scoped dashboards** — see PM Persona Gap above.

---

## Key People & Resources

**Drew — CEO of Focus School Software.** My friend. SaaS operator with scale experience. Said I'm outpacing Focus's lead developers in Claude usage. Believes SurveyOS can outpace Focus's initial growth. Recommended selling now; I pushed back and committed to finishing Phase 1 MVP loop first (morning brief + command/dispatch + field-to-office sync + monument DB + StakeoutQC + invoicing). Drew is an ongoing strategic resource with deep industry operator knowledge — when making sales/timing tradeoffs, surface his likely perspective as counterweight to my perfectionist instincts. Potential future advisor.

---

## Lessons Banked (Technical)

- **Wheel zoom + React + Safari:** `onWheel` prop is passive by default — can't preventDefault. Attach via `useEffect` + `addEventListener` with `{ passive: false }`.
- **Ancestor scroll containers fight for wheel events.** Use `overscroll-behavior: contain` on wrapper.
- **Empty-state early return breaks refs.** Always mount wrapper, conditionally render content inside.
- **Functional setState calling callbacks during render = infinite loop.** Use imperative setState for render-phase updates.
- **Empty `useEffect` deps + ref-based reads = correct pattern for once-per-mount event listeners.**
- **React 18 StrictMode mounts twice in dev.** Cleanup handlers matter.
- **Zero-consumer-change integration pattern:** lift ZERO state to parents when extending shared components. All integration through component's internal state. Proven across AssignmentBuilder, AssignmentDetail, AssignmentPointsEditor.

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

**Partner-mode (not tutor-mode):**
- Direct pushback welcomed in both directions
- Concise responses for narrow topics, long responses only for scope/stakes
- Skip decision-fatigue-reduction framing
- Trust the operator's judgment; surface counterweights when appropriate

**Commit discipline:**
- Smaller increments when rolling back granularity matters
- Descriptive commit messages naming the stage and what shipped
- WIP branches for experimental work, never merge broken to feature branch
- Push regularly

---

## Session Log

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
