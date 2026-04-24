# SurveyOS Auth & Roles Status

**Purpose:** Ground-truth reference for SurveyOS authentication, roles, and permissions. Compiled from live Supabase schema queries on 2026-04-24. Hand this to any Claude instance that needs to understand authorization before writing auth-gated features.

---

## 1. user_profiles table schema

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| firm_id | uuid | YES | null |
| role | text | YES | 'field_crew' |
| first_name | text | YES | null |
| last_name | text | YES | null |
| email | text | YES | null |
| phone | text | YES | null |
| avatar_url | text | YES | null |
| is_active | boolean | NO | true |
| last_seen_at | timestamp with time zone | YES | null |
| invited_by | uuid | YES | null |
| invited_at | timestamp with time zone | YES | null |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | NO | now() |
| certifications | text[] | YES | '{}' |
| assigned_equipment | text[] | YES | '{}' |

**Notes:**
- `role` is freeform `text`, not a PostgreSQL enum. Values are validated by application logic and the `permissions` table. Default for new users is `field_crew`.
- `firm_id` is the multi-tenant boundary. Role scope is firm-wide, not project-specific.
- `certifications` and `assigned_equipment` are text arrays — denormalized references for quick display. Authoritative equipment records live in the `equipment` table.

---

## 2. Roles defined in the permissions system (8 total)

| Role | Permission Matrix Summary |
|---|---|
| `admin` | Full manage on firm_settings, stripe_connect, invoices (including void), team (invite/deactivate). Mirrors `owner` exactly. |
| `owner` | Identical permissions to `admin`. Intent of distinction unclear — see Notable Items below. |
| `pm` | Nearly matches admin/owner. Key differences: `firm_settings: read` (not manage), invoices no `void` authority. |
| `party_chief` | Read-mostly with scoped writes. Can `create` and `update` stakeout_qc_points and stakeout_qc_runs. Can `export` QC reports. No delete, no invoice access. |
| `field_crew` | Read-only on most things. Can `create` survey_points. Narrower than party_chief — no QC authoring. |
| `cad` | Identical to `drafter`. Read + narrow update on projects (deliverables field only). Read survey_points, read team. |
| `drafter` | Identical to `cad`. |
| `technician` | Read-only on equipment, projects, survey_points. Most restrictive role. |

---

## 3. Current active role assignments in production

| Role | User Count |
|---|---|
| pm | 4 |
| field_crew | 3 |
| owner | 1 |
| (all other roles) | 0 |

**Implications:**
- 5 of the 8 defined roles (`admin`, `cad`, `drafter`, `party_chief`, `technician`) have zero users assigned. They exist in the permissions matrix but aren't yet in use.
- `firm_invitations` table has zero pending invitations.
- No explicit `client` role exists — client access works via `share_tokens` (see Section 6).

---

## 4. Scope model — how permissions are bounded

Every permission row includes a `conditions` JSONB field defining scope. Three scope values in use:

| Scope | Meaning |
|---|---|
| `firm` | Full access across all data belonging to the user's firm |
| `assigned` | Access limited to projects/assignments the user is explicitly assigned to |
| `self` | Access limited to the user's own records (e.g., their own accuracy narratives) |

**Field-level restrictions** also appear in conditions:

- `cad` / `drafter`: can only update `projects.deliverables` field
- `field_crew` / `party_chief`: can only update `projects.status` and `projects.scope_checklist`
- Non-owner roles reading `team`: restricted to `first_name` and `last_name` only (no email, phone, or sensitive fields)

**Example conditions structure:**
```json
{"scope": "firm"}
{"scope": "assigned"}
{"scope": "assigned", "fields": ["status", "scope_checklist"]}
{"scope": "self"}
```

Any feature enforcing permissions MUST check both the action and the scope. "Can user X do Y" is incomplete; it must be "Can user X do Y on target Z within scope S."

---

## 5. Full permission matrix — role × resource × actions

### admin & owner (identical)
- `command_center`: manage
- `crew_accuracy_narratives`: read
- `equipment`: manage
- `feature_codes`: create, delete, read, update
- `firm_settings`: manage
- `invoices`: create, read, update, void
- `morning_brief`: read
- `projects`: create, delete, read, update
- `stakeout_assignments`: create, delete, read, update
- `stakeout_design_points`: create, delete, read, update
- `stakeout_qc_points`: delete, read, update
- `stakeout_qc_reports`: delete, export, read
- `stakeout_qc_runs`: delete, read, reconcile, update
- `stripe_connect`: manage
- `survey_points`: create, read
- `team`: deactivate, invite, read, update

### pm
- All of the above **except**:
  - `firm_settings`: read (not manage)
  - `invoices`: create, read, update (no void)
  - `team`: read only (no invite/deactivate)

### party_chief
- `crew_accuracy_narratives`: read (self)
- `equipment`: read
- `feature_codes`: read
- `projects`: read, update (assigned, fields: status + scope_checklist)
- `stakeout_assignments`: read (assigned)
- `stakeout_design_points`: read (assigned)
- `stakeout_qc_points`: create, read, update (assigned)
- `stakeout_qc_reports`: export, read (assigned)
- `stakeout_qc_runs`: create, read (assigned)
- `survey_points`: create, read (assigned)
- `team`: read (name fields only)

### field_crew
- `equipment`: read
- `feature_codes`: read
- `projects`: read, update (assigned, fields: status + scope_checklist)
- `stakeout_assignments`: read (assigned)
- `stakeout_design_points`: read (assigned)
- `survey_points`: create, read (assigned)
- `team`: read (name fields only)

### cad / drafter (identical)
- `projects`: read, update (assigned, fields: deliverables only)
- `survey_points`: read (assigned)
- `team`: read (name fields only)

### technician
- `equipment`: read
- `projects`: read
- `survey_points`: read

---

## 6. Client access model

**Clients do NOT have user accounts or roles.** Client access to the client portal works via `share_tokens`:

- `share_tokens` table stores hex-random tokens linked to projects
- Tokens have expiration (default 30 days) and active/inactive flag
- RLS policy: `"Anon can validate share tokens"` allows unauthenticated reads
- RLS policy on `stakeout_design_points`: `"Anon read design points via share token"` enables client-portal design data visibility without login
- Clients see deliverables, invoices, and signature capture through token-authenticated pages

**Implication for new features:** Client-facing functionality doesn't go through the role/permission system. It goes through share token validation. Don't try to add a `client` role to the permissions table — that's not the pattern.

---

## 7. Row Level Security (RLS) — database-layer enforcement

RLS is enabled on most tables and enforces firm isolation regardless of application logic. Notable patterns:

**Firm isolation policies** (nearly universal):
- `firm_invitations`: "Owners and admins manage invitations"
- `firms`: "Users can read own firm" / "Owners and admins can update own firm"
- `projects`: "Firm isolated projects"
- `stakeout_assignments`: "Office roles manage assignments" / "Field roles read own assignments"
- `user_profiles`: "Firm members can view colleagues" / "Users can update own profile"

**QC-specific policies** (stakeout tables):
- Party chief can insert `stakeout_qc_points` and `stakeout_qc_runs` on assigned work
- Office roles (owner/admin/pm) can delete/update any QC records within firm
- All firm members can read QC records

**Anonymous access for client portal:**
- `share_tokens`: "Anon can validate share tokens" (SELECT only)
- `stakeout_design_points`: "Anon read design points via share token"
- `signatures`: "Allow public inserts for signatures" (clients sign without logging in)

**Sandbox policies — FLAG FOR STAGE 13 SECURITY REVIEW:**
Several tables have `"Sandbox Master ..."` policies granting `ALL` to `authenticated` users. These appear to be legacy dev bypasses:
- `consumables_log`: "Sandbox Master Consumables"
- `math_logs`: "Allow authenticated users full access to math_logs" + public inserts/reads
- `projects`: "Sandbox Master Projects"
- `user_profiles`: "Sandbox Master Profile Policy"
- `survey_points`: "Sandbox Master Points"
- `time_entries`: "Sandbox Master Time"

These policies bypass firm isolation for any authenticated user. Before first paying pilot firm goes live, these need to be removed or scoped to a specific dev user. **This is a production security concern, not just a polish item.**

---

## 8. Notable items and open questions

**`admin` vs `owner` duplication.** Permissions are identical. Either `admin` is intended as a separate human role (operations staff who aren't firm owners) or it's redundant. No current users assigned to `admin`, so the distinction isn't tested in production. Recommend: confirm intent before building features that distinguish them.

**`party_chief` role defined but not populated.** The permissions system clearly distinguishes party_chief (can author QC data) from field_crew (cannot). Currently all 3 field users are `field_crew`. Intent unclear:
- Option A: existing field users should be migrated to `party_chief` if they're lead surveyors
- Option B: distinction is aspirational and everyone stays `field_crew` until formal chief designation
- Option C: crew hierarchy will be introduced with Phase 1.5 dashboard role work

**PM persona gap confirmed at permission level.** Current `pm` role has `firm_settings: read` (not manage) and no invoice `void`. A licensed PLS who owns client relationships needs `firm_settings: manage` to adjust firm-wide tolerance defaults. Either the `pm` role needs expanded permissions, or a new `pls` / `firm_owner` role needs to exist below `owner` but above `pm`. Tracked in the CLAUDE_JOURNAL as Phase 1.5 work.

**`cad` and `drafter` identical.** Same situation as admin/owner — either one is redundant or an intended distinction hasn't been encoded yet. Neither role has users.

**`technician` underscoped.** No write access at all, not even on equipment (a technician typically maintains and calibrates equipment). If this role sees real use, its permission matrix likely needs expansion.

---

## 9. Integration guidance for Claude instances

When writing auth-gated features, the enforcement pipeline is:

1. **Supabase Auth** — user is authenticated (JWT with user ID)
2. **`user_profiles` lookup** — retrieve `firm_id`, `role`, `is_active`
3. **Permissions check** — query `permissions` table for `(role, resource, action)` match, apply `conditions.scope` filter
4. **RLS enforcement** — database refuses query if RLS policy rejects regardless of application logic

**Never rely solely on frontend permission checks.** RLS is the ultimate authority. If a frontend check passes but RLS fails, the query returns empty or errors — behave accordingly.

**Scope checks must be explicit.** A permission row granting `projects: update` with `{"scope": "assigned"}` does not mean the user can update any project — only ones where they appear in `projects.assigned_to` or `projects.assigned_crew`. Application code must filter accordingly and RLS will backstop.

**Field-level restrictions require application enforcement.** RLS enforces row access, not column-level writes. The `conditions.fields` restriction (e.g., field_crew can only update status and scope_checklist) must be enforced in the API layer or via triggers — currently application-enforced based on codebase patterns.

---

## 10. Queries used to generate this document

All queries run on 2026-04-24 against Supabase SQL Editor. Reproducible via:

```sql
-- user_profiles schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Active role counts
SELECT role, COUNT(*) FROM user_profiles GROUP BY role;

-- Permission matrix (aggregated)
SELECT role, resource, STRING_AGG(action, ', ' ORDER BY action) as actions
FROM permissions GROUP BY role, resource ORDER BY role, resource;

-- Conditions (scope + field restrictions)
SELECT role, resource, action, conditions FROM permissions
WHERE conditions IS NOT NULL AND conditions::text != '{}'
ORDER BY role, resource;

-- RLS policies
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Re-run these if schema evolves to regenerate the document.