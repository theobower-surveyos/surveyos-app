## Session Continuity (READ FIRST)

At the start of every session, read `CLAUDE_JOURNAL.md` in the repo root. It contains the current project state, git state, Phase 1 roadmap with status, pricing framework, known bugs, deferred features, and session log.

At the end of every session, update `CLAUDE_JOURNAL.md` per the End-of-Session Protocol at the bottom of that file. Commit the journal update alongside code changes.

---
# CLAUDE.md — SurveyOS Project Conventions

## What SurveyOS is

SurveyOS is a vertical SaaS platform for land surveying firms. It
replaces the patchwork of Trimble Business Center exports, Bluebeam
PDFs, spreadsheets, and email threads that crews and PMs currently
juggle. End-to-end project intelligence from morning brief through
field execution, stakeout QC, deliverables, and billing.

Built by and for an industry practitioner (13 years field experience).
Every feature must survive contact with a real crew on a real site.

## Tech stack

- React 18 + Vite
- React Router v6
- Supabase (Postgres, Auth, Storage, Edge Functions, Realtime)
- Deployed on Vercel (auto-deploy from `main`)
- No Tailwind, no styled-components — inline JS-object styles only
- No component libraries (MUI, Chakra, etc.) — custom components

## Brand + visual system

- Deep teal primary: `#0F6E56`
- Lighter teal accent: `#5DCAA5`
- Dark canvas background: `#0a1a16`
- Text on dark: `#E6F3EE` for body, lighter variants for hierarchy
- Industry-convention red for errors / out-of-tolerance: `#EF4444`
- Amber for warnings / field-fit: `#FEF3C7`
- Dark-mode first. All UI must work on dark as the default.
- Topographic contour motifs as texture on landscape zones
- Sentence case always. Never title case, never ALL CAPS in UI labels.

## Multi-tenancy model

- Tenant unit is a **firm** (table: `public.firms`).
- Every firm-scoped table has a `firm_id uuid` column.
- RLS is enforced on every table. Use the helper functions:
    - `public.get_my_firm_id()` — returns the current user's firm_id
    - `public.get_my_role()` — returns the current user's role
- Never query firm-scoped data without an RLS-backed policy.

## Roles

Valid roles on `user_profiles.role`:
- `owner` — full firm access, billing, config
- `admin` — same as owner minus billing/stripe controls
- `pm` — project manager; full project/assignment access, reports
- `party_chief` — lead on assigned projects; field + light office
- `field_crew` — rod / support crew on assigned projects
- `cad` / `drafter` — deliverables work on assigned projects
- `technician` — read-only on assigned projects

Office roles: `owner`, `admin`, `pm`.
Field roles: `party_chief`, `field_crew`.
Back-office roles: `cad`, `drafter`, `technician`.

## Crew model

Crews are **not** a separate entity. They're formed per-project via:
- `projects.assigned_to uuid` — the lead (almost always a party chief)
- `projects.assigned_crew uuid[]` — supporting members

There is no stable "Crew 3" that carries across days. Per-person
performance metrics (accuracy, trends) attach to the user, not
a crew ID.

## Client access

Clients do not have accounts. Client access works via `public.share_tokens`:
- Office roles generate a time-limited token per project (default 30 days)
- Anonymous users reach the portal via a URL with the token
- RLS policies allow anon read when a valid share_token exists for the row
- Validation happens via `public.validate_share_token(token)` RPC

When building client-facing views, never require auth; always validate
the share token and scope data accordingly.

## Architecture

- `src/App.jsx` — top-level routing shell, session/auth state. Keep lean.
- `src/views/*.jsx` — one file per major page (TodaysWork, CommandCenter,
  MorningBrief, LiveView, MobileCrewView, etc.). Self-contained.
- `src/components/*.jsx` — shared UI used across multiple views.
- `src/lib/*.js` — Supabase client, external-service wrappers.
- `src/utils/*.js` — pure utility functions (formatters, parsers, math).
- `src/data/*.js` — seed data, constants, feature libraries.
- `supabase/migrations/*.sql` — timestamped/numbered, apply in order.
- `supabase/functions/*/index.ts` — edge functions (Deno).
- `references/*` — reference prototypes / mockups. Not compiled.

## Coding conventions

- Inline styles as JS objects. No CSS files beyond `index.css` for
  CSS variable definitions.
- Functional components with hooks. Only existing class component is
  the root `ErrorBoundary`.
- Always destructure props at the top of a component.
- Always read a file before editing it.
- Create new files when functionality is genuinely new; don't force
  new logic into an unrelated existing file.
- Aim to keep individual files under ~800 lines. When a view grows past
  that, extract sub-components into `src/components/`.

## Database conventions

- Every migration file goes in `supabase/migrations/` and is numbered.
- Wrap multi-statement migrations in `BEGIN;` / `COMMIT;` transactions.
- Use `IF NOT EXISTS` / `DROP POLICY IF EXISTS` for idempotency.
- Enable RLS on every new table.
- Reference `get_my_firm_id()` and `get_my_role()` in RLS policies
  instead of re-querying `user_profiles`.
- When adding a new permission area, insert corresponding rows in
  `public.permissions` so the RBAC matrix stays authoritative.
- For client-portal-accessible data, add an anon-read policy that
  joins through `share_tokens`.

## Security + data

- Never hardcode API keys, secrets, or credentials. Use `.env`.
- Never commit `.env` files.
- Never use the Supabase service-role key in client code.
- Validate all user input at the boundary (uploads, forms, URL params).
- Sanitize file paths to prevent directory traversal.

## Testing + commit hygiene

- Run `npm run build` before every commit to verify the build.
- Run `npm run lint` if lint is configured.
- Commit messages describe *why* as much as *what*.
- Use feature branches for multi-step work: `feature/<name>`.
- Never commit broken or half-finished code to `main`.
- Vercel auto-deploys `main`. Be deliberate about what you push there.

## Things I want you to push back on

- A request that would bloat a file past ~800 lines without good reason
- A request that duplicates logic already in the codebase
- A request that conflicts with any convention above
- A request to create multiple files where one would do, or vice versa

## Things not to do

- Don't introduce new npm dependencies without confirming first
- Don't refactor code outside the scope of the current task
- Don't "clean up" formatting in files you're editing for other reasons
- Don't generate documentation or README files unless explicitly asked
- Don't add emoji to code or UI
- Don't use `console.log` for permanent logging — remove before commit
- Don't touch the `.swarm/`, `.claude-flow/`, `.mcp.json` infrastructure
  without asking — it's vestigial tooling from prior experiments