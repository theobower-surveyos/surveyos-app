# SurveyOS Master Architecture — Technical Design Document

*Generated: 2026-03-27 | Version: 1.0*

---

## Executive Summary

SurveyOS is the "ServiceTitan of Land Surveying" — a vertical SaaS platform targeting the $11.5B US land surveying market (17,500 firms). The platform is built on four architectural pillars: (1) an embedded FinTech revenue engine via Stripe Connect capturing 2.5-3.0% GTV on every invoice, (2) a multi-tenant database with firm-level isolation and role-based access control, (3) an offline-first field sync engine engineered for zero data loss on Trimble TSC5 collectors, and (4) a client engagement portal with digital signatures and automated certificate generation. The target is 50 firms at $999/mo blended (SaaS + FinTech) = $600K+ ARR, scaling to $1.2M ARR at the Pro tier.

**Stack:** React (Vite) + Supabase (Postgres, Auth, Realtime, Storage) + Vercel + Stripe Connect

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Current Codebase Audit](#current-codebase-audit)
- [Pillar 1: Stripe Connect & FinTech Revenue Engine](#pillar-1-stripe-connect--fintech-revenue-engine)
- [Pillar 2: Multi-Tenant Database & RBAC](#pillar-2-multi-tenant-database--rbac)
- [Pillar 3: Field Operations — Offline-First Sync Engine](#pillar-3-field-operations--offline-first-sync-engine)
- [Pillar 4: Client Engagement Portal & Digital Signatures](#pillar-4-client-engagement-portal--digital-signatures)
- [Implementation Roadmap](#implementation-roadmap)
- [Appendix A: Complete Database Schema Reference](#appendix-a-complete-database-schema-reference)
- [Appendix B: API Route Reference](#appendix-b-api-route-reference)
- [Appendix C: File Change Manifest](#appendix-c-file-change-manifest)

---

## Codebase Audit: Current State of Affairs

Before designing forward, here is what exists today and where the gaps are.

**Existing tables inferred from code** (via Supabase queries in `App.jsx`, `Auth.jsx`, `CommandCenter.jsx`, `NetworkOps.jsx`, `TodaysWork.jsx`):

| Table | Columns Referenced | Notes |
|---|---|---|
| `user_profiles` | `id`, `firm_id`, `first_name`, `last_name`, `email`, `role` | Linked to `auth.users.id`. Foreign key to `firms`. |
| `firms` | `id`, `name` | Referenced via join: `firms(name)` in `App.jsx:87`. |
| `projects` | `id`, `firm_id`, `project_name`, `fee_type`, `contract_fee`, `scheduled_date`, `assigned_crew`, `assigned_to`, `hide_financials`, `scope_checklist`, `required_equipment`, `status`, `invoice_status`, `invoice_amount`, `created_at`, `lat`, `lng` | Central entity. `invoice_status` and `invoice_amount` used in `ClientPortal.jsx` but likely nullable. |
| `survey_points` | `id`, `project_id`, `point_number`, `northing`, `easting`, `elevation`, `description`, `created_at` | Realtime subscribed in `App.jsx`. |
| `equipment` | `id`, `firm_id`, `category`, ... | Referenced in `NetworkOps.jsx`. |

**Existing auth/identity pattern** (`Auth.jsx`):
- Sign-up takes an `inviteCode` which is used raw as `firm_id` (line 39). This means the invite code IS the firm UUID. There is no invite record, no expiration, no role assignment beyond the default `field_crew`.
- No email verification gate before profile creation.
- No RLS policies are visible in the client code, meaning either they exist in Supabase dashboard or (more likely) they are not yet enforced.

**Existing Stripe integration** (`src/lib/stripe.js`):
- File exists but is empty (1 line, no content). Stripe is not wired up.
- `ClientPortal.jsx` contains a `DemoStripeCheckout` component (lines 5-33) that is a UI mockup only -- it uses `setTimeout` to simulate payment processing with no backend call.
- The portal reads `project.invoice_status` and `project.invoice_amount` from the `projects` table, meaning invoicing is currently baked into the project record rather than a separate entity.

**Key architectural gaps:**
1. No Stripe Connect integration -- no connected accounts, no real payment processing, no webhook handling.
2. No proper RBAC -- roles exist as strings on `user_profiles.role` but there are no permission checks beyond simple UI gating (e.g., `isAdminOrOwner` in `CommandCenter.jsx:139`).
3. No RLS policies enforcing firm isolation at the database level.
4. No proper invitation system -- firm UUID is shared as plaintext invite code.
5. Invoicing is a pair of columns on `projects`, not a standalone financial entity.

---



---

## PILLAR 1: Stripe Connect & FinTech Revenue Engine

### 1.1 Platform Architecture Decision: Express Connect

**Decision:** Use **Stripe Connect Express** (not Standard, not Custom).

**Rationale:**

| Factor | Standard | Express | Custom |
|---|---|---|---|
| Onboarding UX | Stripe-hosted, firm leaves SurveyOS | Stripe-hosted but embedded/redirect | Fully custom (massive PCI burden) |
| Platform control over payouts | None | Full | Full |
| Platform can set fees | No | Yes | Yes |
| Dashboard for connected accounts | Full Stripe dashboard | Simplified Express dashboard | None (you build it) |
| PCI burden on SurveyOS | Minimal | Minimal | SAQ-D (prohibitive) |
| Time to implement | 2 weeks | 3 weeks | 3+ months |

Express gives SurveyOS the ability to control the take rate, manage payout timing (critical for invoice factoring), and present a streamlined onboarding flow -- all without taking on PCI scope. Surveying firm owners get a simplified dashboard for their payouts without being overwhelmed by the full Stripe dashboard.

### 1.2 Payment Flow: End-to-End

```
INVOICE CREATION                          CLIENT PAYMENT                              SETTLEMENT
================                          ==============                              ==========

Firm PM marks project       SurveyOS creates         Client opens           Stripe processes        Stripe splits funds:
"field_complete" in     --> Stripe PaymentIntent  --> ClientPortal via   --> payment via         --> - 97.0-97.5% to firm's
CommandCenter               with:                     share link              Checkout Session        connected account
                            - amount                  (?share=<token>)                              - 2.5-3.0% to SurveyOS
                            - application_fee_amount                                                  platform account
                            - transfer_data.dest                                                    - Stripe's processing
                              (firm's connected acct)                                                 fee on top (2.9%+30c)
```

**Detailed sequence:**

1. **Firm onboards to Stripe Connect.** Firm Owner clicks "Connect Payments" in settings. SurveyOS calls `/api/stripe/connect-onboard`, which creates a Stripe Express account and returns an Account Link URL. The owner completes KYC/KYB on Stripe's hosted form. Stripe fires `account.updated` webhook when onboarding is complete.

2. **Invoice is created.** When a PM marks a project as `field_complete` or manually creates an invoice, SurveyOS calls `/api/stripe/create-invoice`. This inserts a row in the `invoices` table and creates a Stripe PaymentIntent (or Checkout Session) with `application_fee_amount` set to the platform take (e.g., 2.75% of GTV). The `transfer_data.destination` is set to the firm's connected Stripe account ID.

3. **Client pays.** The client receives the share link (already implemented as `?share=<id>` in `App.jsx:32`). The `ClientPortal.jsx` renders the real Stripe Checkout or Stripe Elements form instead of the current `DemoStripeCheckout` mock. On successful payment, Stripe fires `payment_intent.succeeded` webhook.

4. **Webhook settles the books.** The `/api/stripe/webhook` endpoint receives `payment_intent.succeeded`, updates `invoices.status = 'paid'`, updates `payments` table, and triggers any downstream automation (e.g., Supabase Realtime notifies the PM's CommandCenter that the invoice is paid).

### 1.3 Take Rate Economics

| Tier | Monthly SaaS | Avg GTV/mo/firm | Take Rate | FinTech Rev/firm | Blended Rev/firm |
|---|---|---|---|---|---|
| Core | $299/mo | $40,000 | 2.75% | $1,100 | $1,399 |
| Pro | $499/mo | $60,000 | 2.50% | $1,500 | $1,999 |
| Enterprise | $799/mo | $100,000 | 2.25% | $2,250 | $3,049 |

At 50 firms on Pro tier average: `50 x $1,999 = $99,950/mo = $1.2M ARR`. The FinTech layer alone contributes more than the SaaS subscription. This validates the "SaaS + FinTech" model where Stripe Connect revenue is the primary revenue accelerator.

### 1.4 Proposed Supabase Schema

```sql
-- ============================================================
-- STRIPE ACCOUNTS: One per firm. Links firm to Stripe Connect.
-- ============================================================
CREATE TABLE public.stripe_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL UNIQUE,          -- acct_XXXXX from Stripe
    account_type    TEXT NOT NULL DEFAULT 'express',  -- 'express' | 'standard'
    onboarding_status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'incomplete' | 'complete'
    charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    default_take_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0275, -- 2.75% default
    capabilities    JSONB DEFAULT '{}',               -- card_payments, transfers, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT one_stripe_per_firm UNIQUE (firm_id)
);

-- Index for webhook lookups (Stripe sends account ID, we need firm_id)
CREATE INDEX idx_stripe_accounts_stripe_id ON public.stripe_accounts(stripe_account_id);

-- ============================================================
-- INVOICES: Financial document tied to a project.
-- Replaces the current invoice_status/invoice_amount on projects.
-- ============================================================
CREATE TABLE public.invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    invoice_number  TEXT NOT NULL,                     -- Firm-scoped sequential: "BLS-2026-0042"
    
    -- Financials (all stored in cents to avoid floating point)
    subtotal_cents  BIGINT NOT NULL,                   -- Contract fee
    tax_cents       BIGINT NOT NULL DEFAULT 0,
    total_cents     BIGINT NOT NULL,                   -- subtotal + tax
    platform_fee_cents BIGINT NOT NULL,                -- SurveyOS take (calculated at creation)
    
    -- Status machine
    status          TEXT NOT NULL DEFAULT 'draft',     -- draft | sent | viewed | paid | void | overdue
    due_date        DATE,
    sent_at         TIMESTAMPTZ,
    viewed_at       TIMESTAMPTZ,                       -- Track when client opens the link
    paid_at         TIMESTAMPTZ,
    voided_at       TIMESTAMPTZ,
    
    -- Stripe references
    stripe_payment_intent_id TEXT,                     -- pi_XXXXX
    stripe_checkout_session_id TEXT,                   -- cs_XXXXX
    checkout_url    TEXT,                               -- URL to send client
    
    -- Client info (denormalized for the invoice document)
    client_name     TEXT NOT NULL,
    client_email    TEXT,
    client_company  TEXT,
    
    -- Line items stored as JSONB for flexibility
    -- Each: { description, quantity, unit_price_cents, total_cents }
    line_items      JSONB NOT NULL DEFAULT '[]',
    notes           TEXT,                               -- "Thank you for your business"
    
    -- Metadata
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce unique invoice numbers per firm
CREATE UNIQUE INDEX idx_invoices_firm_number ON public.invoices(firm_id, invoice_number);
-- Webhook lookups
CREATE INDEX idx_invoices_stripe_pi ON public.invoices(stripe_payment_intent_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);
CREATE INDEX idx_invoices_status ON public.invoices(firm_id, status);

-- ============================================================
-- PAYMENTS: Immutable ledger of all payment events.
-- One invoice may have multiple payment attempts.
-- ============================================================
CREATE TABLE public.payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    
    -- Amounts (cents)
    amount_cents    BIGINT NOT NULL,
    platform_fee_cents BIGINT NOT NULL,               -- What SurveyOS captured
    stripe_fee_cents BIGINT,                           -- Stripe's processing fee
    net_to_firm_cents BIGINT,                          -- What the firm receives
    
    -- Stripe references
    stripe_payment_intent_id TEXT NOT NULL,
    stripe_charge_id TEXT,                             -- ch_XXXXX
    stripe_transfer_id TEXT,                           -- tr_XXXXX (to connected acct)
    
    -- Status
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending | succeeded | failed | refunded
    failure_reason  TEXT,
    
    -- Method
    payment_method  TEXT,                               -- 'card' | 'ach' | 'wire'
    card_brand      TEXT,                               -- 'visa', 'mastercard', etc.
    card_last4      TEXT,                               -- '4242'
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_payments_firm_status ON public.payments(firm_id, status);
CREATE INDEX idx_payments_stripe_pi ON public.payments(stripe_payment_intent_id);
```

### 1.5 API Route Structure

All routes are Vercel Serverless Functions (or Supabase Edge Functions). They live in `/api/stripe/` and are authenticated via Supabase JWT except for the webhook endpoint.

```
/api/stripe/
  connect-onboard.js      POST   Create Express account + return Account Link URL
  connect-refresh.js      GET    Generate new Account Link if onboarding expired
  connect-status.js       GET    Check onboarding completion for current firm
  create-invoice.js       POST   Create invoice + Stripe Checkout Session
  get-invoice.js          GET    Retrieve invoice details (used by ClientPortal)
  webhook.js              POST   Stripe webhook handler (NO auth — uses signature)
  payout-schedule.js      GET    Get firm's payout schedule from Stripe
  dashboard-link.js       POST   Generate Express Dashboard login link for firm
```

**Route details:**

#### `POST /api/stripe/connect-onboard`
```
Auth: Supabase JWT (firm_owner or admin only)
Body: { firm_id }
Logic:
  1. Verify caller is owner/admin of firm_id
  2. Check if stripe_accounts row exists for firm_id
  3. If not, call stripe.accounts.create({ type: 'express', ... })
  4. Insert stripe_accounts row with stripe_account_id
  5. Call stripe.accountLinks.create({ account, refresh_url, return_url, type: 'account_onboarding' })
  6. Return { url: accountLink.url }
```

#### `POST /api/stripe/create-invoice`
```
Auth: Supabase JWT (firm_owner, admin, or pm)
Body: { project_id, line_items[], client_name, client_email, due_date, notes }
Logic:
  1. Fetch project and firm's stripe_account
  2. Verify stripe account has charges_enabled = true
  3. Calculate totals: subtotal, tax, total
  4. Calculate platform_fee = total * stripe_accounts.default_take_rate
  5. Generate invoice_number (firm prefix + sequential)
  6. Create Stripe Checkout Session:
     stripe.checkout.sessions.create({
       mode: 'payment',
       line_items: [{ price_data: { currency: 'usd', unit_amount: total_cents, product_data: { name } } }],
       payment_intent_data: {
         application_fee_amount: platform_fee_cents,
         transfer_data: { destination: stripe_account_id }
       },
       success_url: '{origin}/?share={project_share_id}&paid=true',
       cancel_url: '{origin}/?share={project_share_id}',
     })
  7. Insert invoices row with checkout_session_id and checkout_url
  8. Return { invoice_id, checkout_url }
```

#### `POST /api/stripe/webhook`
```
Auth: NONE (public endpoint). Verified via stripe.webhooks.constructEvent(body, sig, secret).
Events handled:
  - checkout.session.completed  → Update invoice status to 'paid', insert payment row
  - payment_intent.succeeded    → Update payment row status
  - payment_intent.payment_failed → Update payment row with failure_reason
  - account.updated             → Update stripe_accounts onboarding_status, charges_enabled, payouts_enabled
  - payout.paid                 → (future) Track payout confirmations
  - charge.refunded             → Update payment status to 'refunded'
```

**Webhook signature verification (critical):**

```javascript
// In /api/stripe/webhook.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // CRITICAL: Use raw body, not parsed JSON
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Process event...
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'account.updated':
      await handleAccountUpdated(event.data.object);
      break;
    // ...
  }

  res.status(200).json({ received: true });
}

// Vercel config: disable body parsing for raw access
export const config = { api: { bodyParser: false } };
```

### 1.6 PCI Compliance Approach

**SurveyOS never touches card data.** The compliance strategy is:

1. **SAQ-A eligible.** All payment forms are either Stripe Checkout (hosted page) or Stripe Elements (iframe). Card numbers never transit SurveyOS servers.
2. **No card data in Supabase.** The `payments` table stores only `card_brand` and `card_last4` (received from Stripe webhooks), never full PAN, CVV, or expiry.
3. **Webhook verification.** Every webhook call is verified using `stripe.webhooks.constructEvent` with the endpoint-specific signing secret. Reject all unsigned or replayed events.
4. **HTTPS everywhere.** Vercel enforces TLS. Supabase enforces TLS. No exceptions.
5. **Stripe API key management.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stored as Vercel environment variables. Never committed to source. Never exposed to the client. The publishable key (`VITE_STRIPE_PUBLISHABLE_KEY`) is the only key in client code.

### 1.7 Invoice Factoring Concept (Future -- Phase 3+)

Invoice factoring allows SurveyOS to offer firms early payment on outstanding invoices, addressing the industry's 60-90 day DSO problem.

**How it works:**

1. Firm has an outstanding invoice for $5,000 with net-30 terms. Client has not yet paid.
2. Firm requests "Early Pay" in SurveyOS. Platform offers 95-97% of face value immediately.
3. SurveyOS advances $4,750 to the firm's connected Stripe account (via `stripe.transfers.create`).
4. When the client eventually pays, SurveyOS retains the full $5,000. The $250 spread (5%) is the factoring fee.
5. If the client does not pay within 90 days, SurveyOS has recourse against the firm (deducted from future payouts).

**Revenue impact:** At $60K average monthly GTV per firm, if 30% of invoices use Early Pay at a 4% average factoring fee: `50 firms x $60K x 0.30 x 0.04 = $36,000/mo incremental revenue`. This transforms SurveyOS from a SaaS company into a FinTech company.

**Prerequisites before launch:**
- Historical payment data to model default risk (need 6-12 months of payment data flowing through Connect).
- Legal review: invoice factoring has state-by-state licensing requirements.
- Reserve fund: SurveyOS needs capital to fund advances (or a credit facility partner).
- Schema addition: `factoring_advances` table to track advances, repayments, and defaults.

### 1.8 Migration Path from Current Code

The current `ClientPortal.jsx` (line 5-33) contains `DemoStripeCheckout` -- a `setTimeout`-based mock. The migration:

1. Replace `DemoStripeCheckout` with `@stripe/react-stripe-js` using `<EmbeddedCheckoutProvider>` or redirect to `checkout_url` from the `invoices` table.
2. The `project.invoice_status` and `project.invoice_amount` columns on `projects` should be deprecated in favor of a join to `invoices`. During migration, a database trigger can sync `invoices.status` back to `projects.invoice_status` for backward compatibility.
3. The `?share=<id>` pattern in `App.jsx:32-33` already provides the unauthenticated client entry point. This remains unchanged; the `fetchClientData` function simply needs to also fetch the associated invoice and its `checkout_url`.

---



---

## PILLAR 2: Multi-Tenant Database & RBAC

### 2.1 Firm Isolation Strategy: Row-Level Security

**Decision:** Use Postgres Row-Level Security (RLS) on shared tables, not separate schemas per tenant.

**Rationale:**

| Factor | RLS on Shared Tables | Schema-per-Tenant |
|---|---|---|
| Supabase compatibility | Native, first-class | Requires custom connection pooling, breaks Supabase Realtime |
| Migration complexity | `ALTER TABLE ADD POLICY` | Must clone schema per onboard, manage N schemas |
| Cross-tenant queries (platform analytics) | Single query with service role | Requires UNION across schemas |
| Cost at 50 tenants | Same Supabase instance | Same instance but N schemas to maintain |
| Realtime subscriptions | Works with existing `filter: firm_id=eq.X` pattern (already in `App.jsx:72`, `NetworkOps.jsx:20`) | Requires per-schema channel routing |
| Data isolation guarantee | Strong (Postgres-enforced, not application-enforced) | Strongest (physical separation) |

At 50-500 firms, RLS is the correct choice. Schema-per-tenant becomes relevant only at 5,000+ tenants or for regulated industries requiring physical isolation. SurveyOS is neither.

**The existing code already filters by `firm_id`** in `App.jsx:90`, `App.jsx:120`, `NetworkOps.jsx:30`, and `TodaysWork.jsx:158`. RLS formalizes this pattern at the database level so that even a bug in application code cannot leak data across firms.

### 2.2 Proposed DB Schema

```sql
-- ============================================================
-- FIRMS: Top-level tenant entity. Already exists but needs expansion.
-- ============================================================
CREATE TABLE public.firms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE,                       -- URL-safe identifier: "bower-land-surveying"
    
    -- Business details
    license_number  TEXT,                               -- State surveying license
    license_state   TEXT,                               -- e.g., 'AZ'
    phone           TEXT,
    email           TEXT,
    address_line1   TEXT,
    address_city    TEXT,
    address_state   TEXT,
    address_zip     TEXT,
    
    -- Subscription & billing
    subscription_tier TEXT NOT NULL DEFAULT 'core',     -- 'core' | 'pro' | 'enterprise'
    subscription_status TEXT NOT NULL DEFAULT 'trialing', -- 'trialing' | 'active' | 'past_due' | 'canceled'
    trial_ends_at   TIMESTAMPTZ,
    
    -- Settings
    invoice_prefix  TEXT,                               -- e.g., "BLS" for invoice numbering
    invoice_next_seq INTEGER NOT NULL DEFAULT 1,
    default_payment_terms INTEGER NOT NULL DEFAULT 30,  -- Net-30 default
    timezone        TEXT NOT NULL DEFAULT 'America/Phoenix',
    
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USER_PROFILES: Extended from current schema.
-- Currently has: id, firm_id, first_name, role.
-- Adding: last_name, email, phone, is_active, invited_by, etc.
-- ============================================================
CREATE TABLE public.user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firm_id         UUID REFERENCES public.firms(id) ON DELETE SET NULL,
    
    -- Identity
    first_name      TEXT NOT NULL,
    last_name       TEXT,
    email           TEXT NOT NULL,
    phone           TEXT,
    avatar_url      TEXT,
    
    -- Role (kept as simple enum for backward compat with existing code)
    role            TEXT NOT NULL DEFAULT 'field_crew',
    -- Valid values: 'owner' | 'admin' | 'pm' | 'party_chief' | 'field_crew' | 'cad' | 'drafter'
    
    -- Status
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ,
    
    -- Invitation tracking
    invited_by      UUID REFERENCES auth.users(id),
    invited_at      TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_profiles_firm ON public.user_profiles(firm_id);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(firm_id, role);

-- ============================================================
-- FIRM_INVITATIONS: Replaces the current "paste firm UUID" approach.
-- ============================================================
CREATE TABLE public.firm_invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    
    -- Invitation details
    email           TEXT NOT NULL,                      -- Who is being invited
    role            TEXT NOT NULL DEFAULT 'field_crew', -- What role they get
    invite_code     TEXT NOT NULL UNIQUE,               -- Short code: "BLS-7F3K2"
    
    -- Status
    status          TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'accepted' | 'expired' | 'revoked'
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    accepted_at     TIMESTAMPTZ,
    accepted_by     UUID REFERENCES auth.users(id),
    
    -- Audit
    invited_by      UUID NOT NULL REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_code ON public.firm_invitations(invite_code) WHERE status = 'pending';
CREATE INDEX idx_invitations_firm ON public.firm_invitations(firm_id);
CREATE INDEX idx_invitations_email ON public.firm_invitations(email);

-- ============================================================
-- ROLES & PERMISSIONS: Lookup table for the RBAC matrix.
-- Not a runtime query table -- used for documentation and
-- for a future admin UI to customize permissions.
-- ============================================================
CREATE TABLE public.permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role            TEXT NOT NULL,
    resource        TEXT NOT NULL,                      -- 'projects' | 'invoices' | 'team' | 'equipment' | 'settings'
    action          TEXT NOT NULL,                      -- 'create' | 'read' | 'update' | 'delete' | 'manage'
    conditions      JSONB DEFAULT '{}',                 -- e.g., { "own_only": true } for field crew seeing only assigned projects
    
    UNIQUE(role, resource, action)
);
```

### 2.3 RBAC Permission Matrix

The following matrix governs what each role can do. "Own" means the user can only access records assigned to them (e.g., `assigned_to = auth.uid()`). "Firm" means all records within the firm. "None" means no access.

| Resource / Action | Firm Owner | Admin | Project Manager | Party Chief / Field Crew | CAD / Drafter | Client (via share link) |
|---|---|---|---|---|---|---|
| **Projects: Create** | Firm | Firm | Firm | None | None | None |
| **Projects: Read** | Firm | Firm | Firm | Own (assigned) | Own (assigned) | Single (shared) |
| **Projects: Update** | Firm | Firm | Firm | Own (status, points) | Own (deliverables) | None |
| **Projects: Delete/Archive** | Firm | Firm | Firm | None | None | None |
| **Survey Points: Create** | Firm | Firm | Firm | Own project | None | None |
| **Survey Points: Read** | Firm | Firm | Firm | Own project | Own project | Single project |
| **Invoices: Create** | Firm | Firm | Firm | None | None | None |
| **Invoices: Read** | Firm | Firm | Firm | None | None | Own invoice |
| **Invoices: Pay** | None | None | None | None | None | Own invoice |
| **Invoices: Void** | Firm | Firm | None | None | None | None |
| **Team: Invite** | Firm | Firm | None | None | None | None |
| **Team: Read roster** | Firm | Firm | Firm | Firm (names only) | Firm (names only) | None |
| **Team: Update roles** | Firm | Firm | None | None | None | None |
| **Team: Deactivate** | Firm | Firm | None | None | None | None |
| **Equipment: Manage** | Firm | Firm | Firm | Read only | None | None |
| **Firm Settings** | Full | Full | Read only | None | None | None |
| **Financials: View fees** | Full | Full | Full | Respects `hide_financials` | None | Own invoice only |
| **Stripe Connect: Onboard** | Full | Full | None | None | None | None |
| **Morning Brief** | View | View | View | Skip | Skip | N/A |
| **Command Center** | Full | Full | Full | None | None | None |
| **Live Field View** | Full | Full | Full | Own project | Own project | Single project |
| **Network Ops** | Full | Full | Full | Read only | None | None |

**Notes on existing code alignment:**
- `App.jsx:154` already defines `fieldOnlyRoles = ['field_crew', 'technician', 'cad', 'drafter']` which maps to the "Skip Morning Brief" behavior in the matrix above.
- `CommandCenter.jsx:139` uses `isAdminOrOwner = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'pm'` which aligns with the Team tab visibility. This client-side check must be backed by RLS.
- `CommandCenter.jsx:93` has `hideFinancials` as a per-project flag (set at creation in `App.jsx:127`), which is the mechanism for hiding fees from field crew. This is correct but must also be enforced server-side.

### 2.4 Supabase RLS Policies

```sql
-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION: Get current user's firm_id
-- Avoids repeated subqueries in every policy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_firm_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ============================================================
-- FIRMS: Users can only see their own firm.
-- ============================================================
CREATE POLICY "Users can read own firm"
  ON public.firms FOR SELECT
  USING (id = public.get_my_firm_id());

CREATE POLICY "Owners and admins can update own firm"
  ON public.firms FOR UPDATE
  USING (
    id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- ============================================================
-- USER_PROFILES: Users can see teammates in their firm.
-- ============================================================
CREATE POLICY "Users can read own firm members"
  ON public.user_profiles FOR SELECT
  USING (firm_id = public.get_my_firm_id());

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "New users can insert own profile on signup"
  ON public.user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Owners and admins can update team members"
  ON public.user_profiles FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- ============================================================
-- PROJECTS: Firm-scoped. Field roles see only assigned projects.
-- ============================================================
CREATE POLICY "Office roles read all firm projects"
  ON public.projects FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

CREATE POLICY "Field roles read assigned projects only"
  ON public.projects FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('field_crew', 'party_chief', 'cad', 'drafter', 'technician')
    AND (
      assigned_to = auth.uid()::text
      OR assigned_crew::text LIKE '%' || auth.uid()::text || '%'
    )
  );

CREATE POLICY "Office roles can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

CREATE POLICY "Office roles can update projects"
  ON public.projects FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

CREATE POLICY "Field crew can update assigned project status and points"
  ON public.projects FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('field_crew', 'party_chief')
    AND assigned_to = auth.uid()::text
  );

-- ============================================================
-- SURVEY_POINTS: Follow project access rules.
-- ============================================================
CREATE POLICY "Users can read points for accessible projects"
  ON public.survey_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = survey_points.project_id
      AND p.firm_id = public.get_my_firm_id()
    )
  );

CREATE POLICY "Field crew can insert points on assigned projects"
  ON public.survey_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = survey_points.project_id
      AND p.firm_id = public.get_my_firm_id()
      AND (
        public.get_my_role() IN ('owner', 'admin', 'pm')
        OR p.assigned_to = auth.uid()::text
      )
    )
  );

-- ============================================================
-- INVOICES: Office roles only. Clients access via share link
-- (which uses the anon key + a separate public access pattern).
-- ============================================================
CREATE POLICY "Office roles read firm invoices"
  ON public.invoices FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

CREATE POLICY "Office roles create invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

CREATE POLICY "Office roles update invoices"
  ON public.invoices FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- ============================================================
-- CLIENT PORTAL ACCESS: Unauthenticated via share token.
-- The ClientPortal uses ?share=<project_id> with anon key.
-- We need a special policy for anon access to specific records.
-- ============================================================

-- Projects: anon can read if they have the share token (project ID)
-- This is already the implicit behavior since App.jsx fetches with anon key.
-- We formalize it with a policy that allows SELECT on projects with
-- a specific flag or via a share_tokens table.

CREATE TABLE public.share_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_share_tokens_token ON public.share_tokens(token) WHERE is_active = TRUE;

-- Anon users can read projects via valid share token
CREATE POLICY "Anon can read shared projects"
  ON public.projects FOR SELECT
  USING (
    auth.uid() IS NULL
    AND EXISTS (
      SELECT 1 FROM public.share_tokens st
      WHERE st.project_id = projects.id
      AND st.is_active = TRUE
      AND (st.expires_at IS NULL OR st.expires_at > now())
    )
  );

-- ============================================================
-- EQUIPMENT: Firm-scoped.
-- ============================================================
CREATE POLICY "Users can read firm equipment"
  ON public.equipment FOR SELECT
  USING (firm_id = public.get_my_firm_id());

CREATE POLICY "Office roles manage equipment"
  ON public.equipment FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- ============================================================
-- STRIPE_ACCOUNTS: Only owners and admins.
-- ============================================================
CREATE POLICY "Owners and admins read stripe account"
  ON public.stripe_accounts FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- ============================================================
-- FIRM_INVITATIONS: Owners and admins manage invitations.
-- ============================================================
CREATE POLICY "Owners and admins manage invitations"
  ON public.firm_invitations FOR ALL
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- Anyone with a valid invite code can read the invitation (to accept it)
CREATE POLICY "Anyone can read invitation by code for acceptance"
  ON public.firm_invitations FOR SELECT
  USING (status = 'pending' AND expires_at > now());
```

### 2.5 Mapping Existing `user_profiles` to New Schema

The existing `user_profiles` table already contains `id`, `firm_id`, `first_name`, and `role`. The migration is additive, not destructive:

```sql
-- Step 1: Add new columns (all nullable or with defaults so existing rows survive)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Step 2: Backfill email from auth.users
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
AND up.email IS NULL;

-- Step 3: Normalize role values.
-- Current codebase uses: 'admin', 'owner', 'pm', 'field_crew', 'cad', 'drafter', 'technician', 'party_chief'
-- These are already consistent with constants.js ROLE_META keys.
-- No normalization needed unless data has drifted.

-- Step 4: Add NOT NULL constraint on email after backfill
ALTER TABLE public.user_profiles ALTER COLUMN email SET NOT NULL;
```

**Impact on existing code:**
- `App.jsx:87` queries `user_profiles` with `.select('role, first_name, firm_id, firms(name)')`. This continues to work unchanged since new columns are additive.
- `Auth.jsx:36-42` inserts `{ id, firm_id, first_name, role: 'field_crew' }`. This must be updated to also include `email` (from `authData.user.email`) and to use the new invitation flow instead of raw `firm_id`.
- `CommandCenter.jsx:122-123` queries `.select('id, first_name, last_name, email, role')`. This already expects `last_name` and `email`, which will now exist.

### 2.6 Invitation Flow: Complete Lifecycle

**Current state** (`Auth.jsx`): The sign-up form takes an "invite code" which is literally the firm's UUID. Anyone who knows the UUID can join the firm with `field_crew` role. There is no expiration, no email validation, and no role assignment.

**New flow:**

```
FIRM OWNER                          SYSTEM                              NEW EMPLOYEE
==========                          ======                              ============

1. Owner opens Team tab       2. POST to firm_invitations       3. Employee receives email
   in CommandCenter.              table:                             with link:
   Enters email + role.           { email, role, firm_id,            surveyos.app/join?code=BLS-7F3K2
   Clicks "Send Invite".          invite_code: "BLS-7F3K2",
                                  invited_by: owner.id,
                                  expires_at: now()+7d }
                                  
                                  Trigger: send email via
                                  Supabase Edge Function
                                  or SendGrid.

                                                                  4. Employee clicks link.
                                                                     Auth.jsx reads ?code= param.
                                                                     Shows sign-up form with:
                                                                     - Email (pre-filled, read-only)
                                                                     - First Name
                                                                     - Password
                                                                     
                                                                  5. On submit:
                                                                     a. supabase.auth.signUp({ email, password })
                                                                     b. Fetch invitation by code
                                                                     c. Verify email matches invitation.email
                                                                     d. Insert user_profiles with:
                                                                        firm_id from invitation,
                                                                        role from invitation
                                                                     e. Update invitation: status='accepted',
                                                                        accepted_by=user.id, accepted_at=now()

                              6. Owner sees new member
                                 appear in Team roster
                                 with correct role badge.
```

**Security constraints:**
- Invite code is a short, human-readable string (not the firm UUID). Generated server-side: `{firm_prefix}-{random_5_chars}`.
- Email address on the invitation must match the email used for sign-up. This prevents invite code sharing.
- Invitations expire after 7 days. Expired invitations cannot be used.
- Owners can revoke pending invitations.
- One active invitation per email per firm (enforced by unique index).
- The `invited_by` field creates an audit trail.

**Changes to `Auth.jsx`:**
- Read `?code=` from URL params (similar to how `App.jsx:32` reads `?share=`).
- If code is present, fetch the invitation to pre-fill email and display the firm name.
- On sign-up, validate against the invitation record instead of using raw `firm_id`.
- Remove the free-text "Firm Invite Code" input that currently accepts a UUID.

### 2.7 Entity Relationship Summary

```
firms
  |--- 1:N --- user_profiles (via firm_id)
  |--- 1:N --- projects (via firm_id)
  |--- 1:N --- invoices (via firm_id)
  |--- 1:N --- equipment (via firm_id)
  |--- 1:1 --- stripe_accounts (via firm_id)
  |--- 1:N --- firm_invitations (via firm_id)

projects
  |--- 1:N --- survey_points (via project_id)
  |--- 1:N --- invoices (via project_id)
  |--- 1:N --- share_tokens (via project_id)

invoices
  |--- 1:N --- payments (via invoice_id)

user_profiles
  |--- N:1 --- auth.users (via id, PK=FK)
  |--- referenced by --- firm_invitations.invited_by
  |--- referenced by --- invoices.created_by
```

### 2.8 Implementation Priority Order

| Phase | Work | Rationale |
|---|---|---|
| **Phase 1 (Week 1-2)** | Enable RLS on all existing tables. Deploy `get_my_firm_id()` and `get_my_role()` helper functions. Add basic firm-scoped SELECT policies on `projects`, `user_profiles`, `equipment`, `survey_points`. | Closes the biggest security gap immediately. Existing code already filters by `firm_id` so RLS will not break anything -- it just enforces what the code already assumes. |
| **Phase 2 (Week 2-3)** | Create `firm_invitations` table. Refactor `Auth.jsx` invitation flow. Add `firms` table expansion (subscription_tier, settings). | Replaces the insecure "paste UUID" onboarding. |
| **Phase 3 (Week 3-5)** | Create `stripe_accounts`, `invoices`, `payments` tables. Build `/api/stripe/connect-onboard` and `/api/stripe/webhook`. Replace `DemoStripeCheckout` with real Stripe Checkout. | Revenue engine goes live. |
| **Phase 4 (Week 5-6)** | Create `share_tokens` table. Refactor `ClientPortal.jsx` to use share tokens instead of raw project IDs. Add invoice view/pay flow to ClientPortal. | Secures the public-facing surface and connects payment to the client experience. |
| **Phase 5 (Week 7-8)** | Add granular RLS for field roles (assigned projects only). Add `permissions` table. Build admin UI for role management. | Tightens access for scaled firms with 10+ employees. |

---

**Files referenced in this analysis:**

- `/Users/theobower/Desktop/surveyos-app/src/supabaseClient.js` -- Supabase client initialization (note: anon key is hardcoded here; should move to `import.meta.env.VITE_SUPABASE_ANON_KEY`)
- `/Users/theobower/Desktop/surveyos-app/src/App.jsx` -- Main application shell, session management, realtime subscriptions, share link routing
- `/Users/theobower/Desktop/surveyos-app/src/Auth.jsx` -- Authentication and current (insecure) invitation flow
- `/Users/theobower/Desktop/surveyos-app/src/views/CommandCenter.jsx` -- Project management, team roster, role-based UI gating
- `/Users/theobower/Desktop/surveyos-app/src/views/ClientPortal.jsx` -- Public client view with `DemoStripeCheckout` mock
- `/Users/theobower/Desktop/surveyos-app/src/lib/stripe.js` -- Empty file, placeholder for Stripe integration
- `/Users/theobower/Desktop/surveyos-app/src/data/constants.js` -- Role definitions, fee schedules, mock data
- `/Users/theobower/Desktop/surveyos-app/src/surveyos-architecture.md` -- Existing architecture context document

---

## PILLAR 3: Field Operations -- Offline-First Sync Engine

### 3.1 Current State Analysis

#### offlineStore.js (src/lib/offlineStore.js)

The current offline store is minimal -- 35 lines total. It provides three operations against a single IndexedDB object store:

- **`initDB()`** -- Opens (or creates) the `SurveyOS_Field_Vault` database at version 1 with a single `mutation_queue` store using autoIncrement integer keys.
- **`vaultAction(actionType, payload)`** -- Appends a mutation with `{actionType, payload, status:'pending', timestamp}`.
- **`getVaultQueue()`** -- Returns the entire contents of the store (no filtering, no pagination).
- **`removeFromVault(id)`** -- Deletes a single record by its autoIncrement key.

Key observations:
- DB version is hardcoded to 1 with no migration path.
- No index on `status` or `timestamp`, so filtering pending items requires a full table scan.
- No idempotency key -- if the sync loop crashes after Supabase confirms but before `removeFromVault` completes, the item will be re-sent on next pass.
- No WAL (write-ahead log) semantics -- the `status` field exists but is never updated; items are either present (pending) or deleted (synced).
- No size tracking or quota management for IndexedDB.

#### TodaysWork.jsx Sync Loop (src/views/TodaysWork.jsx, lines 89-129)

The sync engine is a 5-second `setInterval` that:

1. Calls `getVaultQueue()` to load the entire queue.
2. Filters for `status === 'pending'`.
3. Iterates sequentially through each pending item.
4. Dispatches based on `actionType`: `csv_upload`, `photo_upload`, or `checklist_toggle`.
5. On success, calls `removeFromVault(item.id)`.
6. On failure (caught exception), silently continues to the next interval.

Key observations:
- **No retry counter or exponential backoff.** A permanently failing item (e.g., corrupt base64) will retry every 5 seconds forever, burning battery and bandwidth.
- **No ordering guarantee.** Items are processed in autoIncrement order, which is correct for append-only, but there is no sequence number or dependency tracking.
- **No partial sync.** A CSV with 500 points is inserted as a single `supabase.from('survey_points').insert(points)` call. If it fails partway, there is no way to know which rows succeeded.
- **No concurrency guard.** If the interval fires while a previous pass is still running, two passes will process the same items simultaneously.
- **No network detection.** The loop runs regardless of connectivity status.
- **Sync is tied to the component lifecycle.** When `TodaysWork` unmounts (user navigates away), the interval is cleared and sync stops entirely.
- **Photos are base64 data URIs.** A 5 MB JPEG becomes approximately 6.7 MB in base64. Ten photos in the vault consume 67 MB of IndexedDB. No compression, no chunking, no cleanup.

#### harrisonMath.js (src/lib/harrisonMath.js)

Pure calculation module. Computes deltaN, deltaE, deltaZ and a 3D vector magnitude. Tolerance gate at 0.02 ft. No offline concerns here, but it is invoked client-side during CSV processing, which means QA/QC validation happens before vault sync -- a correct design.

### 3.2 Gap Analysis

```
+-------------------------------+-------------------+---------------------+
| Requirement                   | Current State     | Gap Severity        |
+-------------------------------+-------------------+---------------------+
| Idempotent mutations          | None              | CRITICAL            |
| Retry backoff / dead letter   | None              | CRITICAL            |
| Concurrency guard on sync     | None              | HIGH                |
| Service Worker background sync| None              | CRITICAL (TSC5)     |
| Network state detection       | None              | HIGH                |
| IndexedDB schema versioning   | Hardcoded v1      | MEDIUM              |
| Queue ordering / dependencies | None              | MEDIUM              |
| Partial sync for large inserts| None              | HIGH                |
| Photo compression / chunking  | None              | HIGH                |
| Quota monitoring              | None              | MEDIUM              |
| Sync independent of component | Tied to mount     | CRITICAL            |
| WAL / transaction journaling  | None              | HIGH                |
| Conflict resolution strategy  | None (last write) | MEDIUM              |
| Offline-first deploy/demob    | Not vaulted       | HIGH                |
+-------------------------------+-------------------+---------------------+
```

The single most dangerous gap: **when a surveyor switches to the Trimble Access app on their TSC5, Chrome is suspended by Android.** The `setInterval` stops. If the surveyor was mid-upload, that upload is abandoned with no Service Worker to resume it. The data remains in IndexedDB (safe), but sync will not resume until the user manually returns to the SurveyOS tab and the `TodaysWork` component remounts.

### 3.3 Proposed Architecture

#### 3.3.1 System Overview

```
+================================================================+
|                    TSC5 / FIELD DEVICE                          |
|================================================================|
|                                                                  |
|  +------------------+    +------------------+                    |
|  | TodaysWork.jsx   |    | Any SurveyOS     |                   |
|  | (Field UI)       |    | Component        |                   |
|  +--------+---------+    +--------+---------+                   |
|           |                       |                              |
|           v                       v                              |
|  +------------------------------------------------+             |
|  |        offlineStore.js  (Vault API)             |             |
|  |  vaultAction() -> idempotencyKey + WAL entry    |             |
|  +-------------------------+----------------------+             |
|                            |                                     |
|                            v                                     |
|  +------------------------------------------------+             |
|  |        IndexedDB: SurveyOS_Field_Vault v3       |             |
|  |                                                  |             |
|  |  Object Stores:                                  |             |
|  |    mutation_queue  (keyPath: idempotencyKey)     |             |
|  |    photo_blobs     (keyPath: blobId)             |             |
|  |    wal_journal     (keyPath: seqNo)              |             |
|  |    sync_metadata   (keyPath: key)                |             |
|  +-------------------------+----------------------+             |
|                            |                                     |
|       +--------------------+--------------------+                |
|       |                                         |                |
|       v                                         v                |
|  +-----------+                        +------------------+       |
|  | Sync      |  (in-page fallback)    | Service Worker   |       |
|  | Manager   |<---------------------->| (sw-vault.js)    |       |
|  | (page)    |   MessageChannel       | Background Sync  |       |
|  +-----------+                        +------------------+       |
|       |                                         |                |
+======|=========================================|================+
       |                                         |
       v                                         v
+================================================================+
|                     NETWORK BOUNDARY                            |
+================================================================+
       |                                         |
       v                                         v
+----------------------------------------------------------------+
|                    SUPABASE BACKEND                              |
|                                                                  |
|  +------------------+  +------------------+  +----------------+ |
|  | survey_points    |  | project-photos   |  | projects       | |
|  | (Postgres)       |  | (Storage)        |  | (Postgres)     | |
|  +------------------+  +------------------+  +----------------+ |
|                                                                  |
|  +------------------+                                           |
|  | sync_receipts    |  (server-side idempotency ledger)         |
|  | (Postgres)       |                                           |
|  +------------------+                                           |
+----------------------------------------------------------------+
```

#### 3.3.2 IndexedDB Schema (Version 3 Migration Path)

```
Database: SurveyOS_Field_Vault

Version 1 (current):
  mutation_queue: { keyPath: 'id', autoIncrement: true }

Version 2 (migration):
  mutation_queue: { keyPath: 'idempotencyKey' }
    indexes: status, timestamp, actionType, retryCount
  photo_blobs: { keyPath: 'blobId' }
    indexes: mutationKey (links to mutation_queue)

Version 3 (target):
  mutation_queue: { keyPath: 'idempotencyKey' }
    indexes: status, timestamp, actionType, retryCount, priority
  photo_blobs: { keyPath: 'blobId' }
    indexes: mutationKey, chunkIndex
  wal_journal: { keyPath: 'seqNo', autoIncrement: true }
    indexes: mutationKey, phase
  sync_metadata: { keyPath: 'key' }
    (stores lastSyncTimestamp, deviceId, quotaUsed, etc.)
```

Proposed mutation record shape:

```
mutation_queue record:
{
  idempotencyKey: "mut_<projectId>_<actionType>_<uuid>",  // deterministic or UUID
  actionType: "csv_upload" | "photo_upload" | "checklist_toggle" | "deploy" | "demobilize",
  payload: { ... },                    // for photos, this is a pointer to photo_blobs
  status: "pending" | "in_flight" | "confirmed" | "failed" | "dead_letter",
  priority: 1-5,                       // 1=critical (deploy/demob), 5=low (photos)
  retryCount: 0,
  maxRetries: 10,
  lastAttempt: null | ISO timestamp,
  createdAt: ISO timestamp,
  deviceId: "device_<fingerprint>",
  batchId: null | "batch_<uuid>",      // groups related mutations
  serverReceiptId: null                 // filled after server confirms
}
```

#### 3.3.3 Idempotency Strategy

The critical problem: if `removeFromVault` fails after the Supabase call succeeds, the mutation is re-sent. For inserts, this creates duplicates. For updates, it is harmless but wasteful.

Solution -- two-layer idempotency:

**Client side:**
1. Every mutation gets a UUID-based `idempotencyKey` at creation time.
2. Before sending to Supabase, the status is set to `in_flight` inside a single IDB transaction.
3. On success, status is set to `confirmed` and `serverReceiptId` is recorded.
4. A separate garbage collection pass deletes `confirmed` items older than 24 hours.
5. If the app crashes between Supabase success and IDB update, the item remains `in_flight`. On next boot, `in_flight` items older than 30 seconds are re-sent with the same idempotency key.

**Server side (Supabase):**
A `sync_receipts` table:

```sql
CREATE TABLE sync_receipts (
  idempotency_key TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  device_id TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  payload_hash TEXT NOT NULL  -- SHA-256 of the payload for verification
);

-- RPC function that checks before insert:
CREATE OR REPLACE FUNCTION idempotent_sync(
  p_idempotency_key TEXT,
  p_action_type TEXT,
  p_project_id UUID,
  p_device_id TEXT,
  p_payload_hash TEXT,
  p_payload JSONB
) RETURNS JSONB AS $$
DECLARE
  existing RECORD;
BEGIN
  SELECT * INTO existing FROM sync_receipts WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_processed', 'receipt', existing.idempotency_key);
  END IF;

  INSERT INTO sync_receipts (idempotency_key, action_type, project_id, device_id, payload_hash)
  VALUES (p_idempotency_key, p_action_type, p_project_id, p_device_id, p_payload_hash);

  -- Dispatch based on action type
  IF p_action_type = 'csv_upload' THEN
    INSERT INTO survey_points SELECT * FROM jsonb_populate_recordset(null::survey_points, p_payload->'points');
  ELSIF p_action_type = 'checklist_toggle' THEN
    UPDATE projects SET scope_checklist = p_payload->'checklist' WHERE id = p_project_id;
  END IF;

  RETURN jsonb_build_object('status', 'processed', 'receipt', p_idempotency_key);
END;
$$ LANGUAGE plpgsql;
```

#### 3.3.4 Retry Backoff and Dead Letter Queue

```
Retry schedule (exponential with jitter):
  Attempt 1: immediate
  Attempt 2: 5s  + random(0-2s)
  Attempt 3: 15s + random(0-5s)
  Attempt 4: 45s + random(0-10s)
  Attempt 5: 2min + random(0-30s)
  Attempt 6: 5min + random(0-1min)
  Attempt 7-10: 10min + random(0-2min)
  After 10: status -> 'dead_letter'

Dead letter items:
  - Surfaced in the UI with a red banner: "X items failed to sync"
  - User can tap to inspect, retry manually, or discard
  - Never auto-deleted -- data loss prevention is paramount
```

#### 3.3.5 Conflict Resolution Strategy

Recommendation: **Server-Authority with Field-Priority Window**

Rationale for rejecting alternatives:
- **Last-Write-Wins** is dangerous for survey data. Two crew members uploading different point sets for the same project would silently overwrite each other.
- **CRDTs** are overkill. Survey data is append-heavy (points, photos) with rare updates (checklist toggles, status changes). The complexity of CRDT merge functions is not justified.
- **Pure server-authority** would reject field updates if a PM modifies the project simultaneously, which would frustrate field crews.

Proposed hybrid:

```
+---------------------------------------------------------------+
|                  CONFLICT RESOLUTION MATRIX                   |
+--------------------+-------------------+----------------------+
| Data Type          | Strategy          | Rationale            |
+--------------------+-------------------+----------------------+
| survey_points      | Append-only       | Points never conflict|
|                    | (INSERT only)     | -- they accumulate   |
+--------------------+-------------------+----------------------+
| photos             | Append-only       | Photos never conflict|
|                    | (INSERT only)     | -- unique filenames  |
+--------------------+-------------------+----------------------+
| scope_checklist    | Field-priority    | Field crew has ground |
|                    | within 15-min     | truth. Their toggle  |
|                    | window            | wins if within 15min |
+--------------------+-------------------+----------------------+
| project status     | State machine     | Only valid forward   |
|                    | (forward-only)    | transitions accepted |
+--------------------+-------------------+----------------------+
| equipment claims   | Server-authority  | Prevents double-     |
|                    | (optimistic lock) | checkout of gear     |
+--------------------+-------------------+----------------------+
```

Project status state machine (forward-only):

```
pending -> in_progress -> field_complete -> completed -> archived
                 |                              ^
                 +--- (no backward allowed) ----+
```

#### 3.3.6 Photo Pipeline

Current flow (from TodaysWork.jsx lines 226-265):

```
Camera capture -> fileToBase64() -> GPS geolocation -> vaultAction('photo_upload', {fileName, base64, contentType})
```

Problems:
1. `fileToBase64()` reads the entire file as a data URI. A 10 MB photo becomes ~13 MB base64 in IndexedDB.
2. No compression before vaulting.
3. No chunking for large files.
4. Photos and their metadata are in the same mutation_queue store, bloating queue scans.

Proposed pipeline:

```
+----------+     +------------+     +----------+     +-------------+
| Camera   |---->| Compress   |---->| GPS Tag  |---->| Chunk &     |
| Capture  |     | (canvas    |     | (geoloc  |     | Store in    |
| (file)   |     |  resize    |     |  API)    |     | photo_blobs |
|          |     |  to 1920px |     |          |     | (raw Blob)  |
|          |     |  quality   |     |          |     |             |
|          |     |  0.82)     |     |          |     |             |
+----------+     +------------+     +----------+     +------+------+
                                                            |
                                                            v
                                                     +-------------+
                                                     | Create      |
                                                     | mutation    |
                                                     | record with |
                                                     | blobId ref  |
                                                     +------+------+
                                                            |
                                                     (sync engine picks up)
                                                            |
                                                            v
                                                     +-------------+
                                                     | Read blob   |
                                                     | from IDB    |
                                                     | Chunk into  |
                                                     | 256KB parts |
                                                     +------+------+
                                                            |
                                                            v
                                                     +-------------+
                                                     | Upload to   |
                                                     | Supabase    |
                                                     | Storage via |
                                                     | resumable   |
                                                     | upload API  |
                                                     +------+------+
                                                            |
                                                            v
                                                     +-------------+
                                                     | On confirm: |
                                                     | Delete blob |
                                                     | from IDB    |
                                                     | Mark synced |
                                                     +-------------+
```

Key changes:
- Store photos as raw `Blob` in a separate `photo_blobs` store (not base64 -- saves 33% space).
- Compress before vaulting using canvas: resize to max 1920px wide, JPEG quality 0.82. This reduces a typical 10 MB field photo to approximately 800 KB.
- The mutation_queue record only holds a pointer (`blobId`), keeping queue scans fast.
- Use Supabase Storage's resumable upload (TUS protocol) for photos over 500 KB.
- If upload is interrupted (app switch on TSC5), the TUS protocol allows resumption from the last confirmed chunk.

#### 3.3.7 CSV Pipeline

Current flow (TodaysWork.jsx lines 193-223):

```
File input -> file.text() -> parseCSV() -> local state -> vaultAction('csv_upload', {points}) -> sync loop -> supabase.from('survey_points').insert(points)
```

Problems:
1. A CSV with 2000 points creates a single insert call. If it fails, all 2000 must be re-sent.
2. Harrison Math validation happens in the UI (useEffect on lines 61-76) but results are not persisted.
3. The `parseCSV` function (lines 426-454) does no coordinate system validation (State Plane vs. geographic).

Proposed pipeline:

```
+----------+     +------------+     +------------+     +-------------+
| File     |---->| parseCSV() |---->| Harrison   |---->| Batch into  |
| Input    |     | (existing) |     | Math QA/QC |     | chunks of   |
| (.csv)   |     |            |     | validation |     | 50 points   |
+----------+     +------------+     +-----+------+     +------+------+
                                          |                    |
                                          v                    v
                                   +-------------+     +-------------+
                                   | Store QA    |     | vault each  |
                                   | results in  |     | chunk as    |
                                   | IDB for     |     | separate    |
                                   | offline     |     | mutation    |
                                   | review      |     | with same   |
                                   +-------------+     | batchId     |
                                                       +------+------+
                                                              |
                                                       (sync engine)
                                                              |
                                                              v
                                                       +-------------+
                                                       | Insert 50   |
                                                       | points at a |
                                                       | time via    |
                                                       | idempotent  |
                                                       | RPC         |
                                                       +------+------+
                                                              |
                                                              v
                                                       +-------------+
                                                       | On all      |
                                                       | chunks      |
                                                       | confirmed:  |
                                                       | fire        |
                                                       | onSync      |
                                                       | Complete()  |
                                                       +-------------+
```

Batch chunking rationale: Supabase has a practical limit of approximately 1000 rows per insert before timeouts become likely on poor connections. Chunking to 50 points per mutation means each chunk syncs in under 1 second on 3G, and a failed chunk only needs to re-send 50 points instead of 2000.

#### 3.3.8 Service Worker Architecture

This is the most critical addition. Without a Service Worker, sync dies when Chrome is backgrounded on the TSC5.

```
+================================================================+
|                    SERVICE WORKER LIFECYCLE                      |
+================================================================+
|                                                                  |
|  sw-vault.js (registered at app boot)                           |
|                                                                  |
|  Events handled:                                                |
|    install    -> precache app shell (Vite manifest)             |
|    activate   -> claim all clients, clean old caches            |
|    fetch      -> network-first for API, cache-first for assets  |
|    sync       -> Background Sync API ("vault-drain")            |
|    message    -> MessageChannel from page for manual triggers   |
|    periodicsync -> Periodic Background Sync (if granted)        |
|                                                                  |
+================================================================+

Registration (in main.jsx or App.jsx):

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('/sw-vault.js');

    // Request Background Sync permission
    if ('sync' in reg) {
      // Tag registered when items are vaulted
    }

    // Request Periodic Background Sync (Chrome 80+)
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({name: 'periodic-background-sync'});
      if (status.state === 'granted') {
        await reg.periodicSync.register('vault-keepalive', {
          minInterval: 60 * 1000  // 1 minute minimum
        });
      }
    }
  }
```

Background Sync flow:

```
Page context:                          Service Worker:
                                       
vaultAction() called                   
  |                                    
  v                                    
Write to IndexedDB                     
  |                                    
  v                                    
reg.sync.register('vault-drain')  ---> sync event fires
  |                                      |
  v                                      v
(page may be suspended)                Open IndexedDB directly
                                         |
                                         v
                                       Read pending mutations
                                         |
                                         v
                                       Process each mutation:
                                         - fetch() to Supabase REST API
                                         - On success: delete from IDB
                                         - On failure: throw (OS will retry)
                                         |
                                         v
                                       (OS retries with backoff if failed)
```

Critical TSC5 behavior: When the browser tab is suspended, the Service Worker remains alive for Background Sync events. The OS will fire the `sync` event when connectivity is detected, even if the page is not visible. This is the only mechanism that survives app-switching on Android.

Fallback for browsers without Background Sync API:

```
if (!('sync' in registration)) {
  // Fall back to in-page sync with visibility-aware scheduling
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      drainVaultQueue();  // immediate sync on tab return
    }
  });
}
```

#### 3.3.9 Network State Detection and Adaptive Sync

```
+-------------------------------------------------------------+
|              NETWORK STATE MACHINE                           |
+-------------------------------------------------------------+
|                                                               |
|   +----------+   online event   +-----------+                |
|   |          |----------------->|           |                |
|   | OFFLINE  |                  |  ONLINE   |                |
|   |          |<-----------------|           |                |
|   +----------+   offline event  +-----+-----+                |
|                                       |                       |
|                                       v                       |
|                                 +-----------+                |
|                                 | Probe RTT |                |
|                                 | (HEAD to  |                |
|                                 | Supabase) |                |
|                                 +-----+-----+                |
|                                       |                       |
|                          +------------+------------+          |
|                          |            |            |          |
|                          v            v            v          |
|                     +--------+   +--------+   +--------+     |
|                     | FAST   |   | SLOW   |   | DEAD   |     |
|                     | <500ms |   | <5s    |   | >5s    |     |
|                     +--------+   +--------+   +--------+     |
|                          |            |            |          |
|                          v            v            v          |
|                     Sync every   Sync every   Vault only,    |
|                     5 seconds    30 seconds   wait for       |
|                     (current)    (throttled)  sync event     |
|                                                               |
+-------------------------------------------------------------+
```

Implementation approach:

```
class NetworkProbe {
  constructor(supabaseUrl) {
    this.url = supabaseUrl;
    this.state = navigator.onLine ? 'online' : 'offline';
    this.rtt = null;

    window.addEventListener('online', () => this.probe());
    window.addEventListener('offline', () => { this.state = 'offline'; });
  }

  async probe() {
    const start = performance.now();
    try {
      await fetch(this.url + '/rest/v1/', { method: 'HEAD', mode: 'cors' });
      this.rtt = performance.now() - start;
      this.state = this.rtt < 500 ? 'fast' : this.rtt < 5000 ? 'slow' : 'dead';
    } catch {
      this.state = 'dead';
    }
    return this.state;
  }

  getSyncInterval() {
    switch (this.state) {
      case 'fast': return 5000;
      case 'slow': return 30000;
      case 'dead':
      case 'offline':
      default: return null;  // no interval -- rely on sync event
    }
  }
}
```

#### 3.3.10 Data Integrity Guarantees on TSC5 App-Switch

The TSC5 runs Android with Chrome. When the user switches to Trimble Access, the following happens:

1. Chrome tab enters `visibilityState = 'hidden'`.
2. After approximately 5 minutes, Android may freeze the renderer process.
3. `setInterval` stops firing.
4. IndexedDB remains intact on disk.
5. The Service Worker process is independent and can be woken by the OS.

Guarantee chain:

```
+---------------------------------------------------------------+
|              ZERO DATA LOSS GUARANTEE CHAIN                   |
+---------------------------------------------------------------+
|                                                               |
|  1. VAULT-FIRST WRITE                                        |
|     Every user action writes to IndexedDB BEFORE any          |
|     network call. The data is on disk within ~2ms.            |
|     (Already implemented in TodaysWork.jsx)                   |
|                                                               |
|  2. WAL JOURNALING                                           |
|     Before writing to mutation_queue, a WAL entry is          |
|     written to wal_journal with phase='intent'. After         |
|     the mutation_queue write succeeds, the WAL entry          |
|     is updated to phase='committed'. On boot, any            |
|     'intent' entries without matching 'committed' are         |
|     replayed.                                                 |
|                                                               |
|  3. SERVICE WORKER BACKGROUND SYNC                           |
|     After vaulting, navigator.serviceWorker.ready then        |
|     reg.sync.register('vault-drain') schedules a sync        |
|     event that fires even when the page is frozen.            |
|                                                               |
|  4. VISIBILITY CHANGE DRAIN                                  |
|     When the user returns to the tab, a visibilitychange      |
|     listener immediately triggers a full queue drain.         |
|     This is the belt to the Service Worker's suspenders.      |
|                                                               |
|  5. BOOT-TIME RECOVERY                                       |
|     On app load, before rendering, the app checks for:        |
|       - WAL entries in 'intent' state (replay them)           |
|       - Mutations in 'in_flight' state >30s old (re-queue)   |
|       - photo_blobs without matching mutations (orphan GC)   |
|                                                               |
|  6. SERVER-SIDE IDEMPOTENCY                                  |
|     Even if a mutation is sent twice, the sync_receipts       |
|     table deduplicates by idempotency_key.                    |
|                                                               |
+---------------------------------------------------------------+
```

#### 3.3.11 Upgraded offlineStore.js API Surface

```
// Core vault operations
vaultAction(actionType, payload, options?)  -> idempotencyKey
vaultPhoto(file, gpsCoords?)               -> { idempotencyKey, blobId }
getVaultQueue(filter?)                      -> mutations[]
getVaultStats()                             -> { pending, inFlight, failed, deadLetter, quotaUsed }

// Sync lifecycle
markInFlight(idempotencyKey)               -> void
markConfirmed(idempotencyKey, receiptId)   -> void
markFailed(idempotencyKey, error)          -> void
markDeadLetter(idempotencyKey)             -> void
retryFailed(idempotencyKey)                -> void
retryAllFailed()                           -> void

// WAL
writeWalIntent(mutationKey, payload)       -> seqNo
commitWal(seqNo)                           -> void
recoverWal()                               -> replayed count

// Maintenance
garbageCollect(maxAge?)                    -> deleted count
getQuotaEstimate()                         -> { used, available }
exportVault()                              -> JSON (for support/debugging)
```

---



---

## PILLAR 4: Client Engagement Portal and Digital Signatures

### 4.1 Current State Analysis

#### ClientPortal.jsx (src/views/ClientPortal.jsx)

The current client portal is a single-component read-only view with the following features:

1. **Shareable Link Access** -- The portal is rendered when `?share=<projectId>` is present in the URL. In `App.jsx` (line 33), the share parameter is extracted and `fetchClientData(shareId)` is called. However, `fetchClientData` is referenced but **never defined** in `App.jsx` -- this is a bug. The portal currently depends on data being loaded from somewhere, but the function body is missing.

2. **Domino Progress Tracker** (lines 47-53) -- A 5-step pipeline visualization: Dispatched -> Fieldwork -> Drafting -> Invoicing -> Closed. Each step's activation is derived from project state:
   - `hasFieldData`: points array is non-empty
   - `isFieldComplete`: project status is `field_complete` or `completed`
   - `hasInvoice`: invoice_status is `generated` or `paid`
   - `isPaid`: invoice_status is `paid`

3. **Payment Integration** -- A demo Stripe checkout modal (`DemoStripeCheckout`, lines 5-34). This is a UI mock -- it simulates payment with a 2-second timeout. No actual Stripe API integration exists.

4. **Live CAD Geometry** -- Renders a `LiveCADViewer` component with `interactive={false}` (read-only for clients).

5. **Geotagged Photo Gallery** -- Displays photos with GPS coordinates extracted from filenames.

6. **Real-time Updates** -- Via Supabase Realtime channels in `App.jsx` (lines 66-84), the portal subscribes to `survey_points` INSERT events and `projects` UPDATE events, so clients see field progress in real time.

What is missing:
- The `fetchClientData` function (the portal cannot load data for shared links)
- Digital signature capture
- Certificate of Completion generation
- Client notification system (email/SMS)
- Secure, time-limited shareable links (current system uses raw project UUIDs)
- Audit trail
- CRM feedback loop

### 4.2 End-to-End Data Flow

```
+================================================================+
|                    COMPLETE DELIVERY PIPELINE                    |
+================================================================+

FIELD                    OFFICE                   CLIENT
-----                    ------                   ------

Party Chief              PM (Command Center)      Client (Portal)
    |                        |                        |
    | 1. Demobilize          |                        |
    | (status ->             |                        |
    |  field_complete)       |                        |
    |                        |                        |
    +------> Realtime ------>|                        |
    |        event           |                        |
    |                        | 2. PM reviews          |
    |                        |    deliverables         |
    |                        |    in ProjectDrawer     |
    |                        |                        |
    |                        | 3. PM clicks            |
    |                        |    "Generate            |
    |                        |     Deliverable         |
    |                        |     Package"            |
    |                        |                        |
    |                        | 4. System generates:    |
    |                        |    - Share token         |
    |                        |    - Certificate PDF     |
    |                        |    - Signed URL bundle   |
    |                        |                        |
    |                        | 5. Edge Function sends  |
    |                        |    notification          |
    |                        |    (email + SMS)         |
    |                        |        |                |
    |                        |        +--------------->|
    |                        |                        |
    |                        |                   6. Client clicks
    |                        |                      secure link
    |                        |                        |
    |                        |                   7. Portal loads:
    |                        |                      - Progress tracker
    |                        |                      - CAD geometry
    |                        |                      - Photo gallery
    |                        |                      - Certificate
    |                        |                      - Signature pad
    |                        |                        |
    |                        |                   8. Client signs
    |                        |                      (canvas e-sign)
    |                        |                        |
    |                        |                   9. Client pays
    |                        |                      (Stripe)
    |                        |                        |
    |                        |<---- Realtime ---------+
    |                        |      (signature +      |
    |                        |       payment events)  |
    |                        |                        |
    |                        | 10. Status ->          |
    |                        |     'completed'         |
    |                        |     Invoice ->          |
    |                        |     'paid'              |
    |                        |                        |
    |                        | 11. Trigger             |
    |                        |     invoicing           |
    |                        |     export (QB/Xero)    |
    |                        |                        |
+================================================================+
```

### 4.3 Shareable Link Architecture

Current system: `?share=<project_uuid>` in `App.jsx` line 33. This exposes the raw project UUID in the URL, which means:
- Anyone who guesses a UUID can access any project
- Links never expire
- No access control or audit trail

Proposed system: **Signed share tokens with time-limited access.**

```sql
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID REFERENCES auth.users(id),
  client_email TEXT,
  client_phone TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  access_count INTEGER DEFAULT 0,
  max_access INTEGER DEFAULT 100,
  permissions JSONB DEFAULT '{"view_geometry": true, "view_photos": true, "sign": true, "pay": true}',
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_share_tokens_token ON share_tokens(token) WHERE NOT revoked;

-- RLS policy: share tokens are readable by anyone (they are the auth mechanism)
-- but only creatable by authenticated PM/admin users
CREATE POLICY "Anyone can read valid share tokens"
  ON share_tokens FOR SELECT
  USING (NOT revoked AND expires_at > now() AND access_count < max_access);

CREATE POLICY "PMs can create share tokens"
  ON share_tokens FOR INSERT
  WITH CHECK (auth.uid() = created_by);
```

URL format change:

```
Current:  https://app.surveyos.com?share=<project_uuid>
Proposed: https://app.surveyos.com/portal/<share_token>
```

Token validation flow:

```
Client browser                         Supabase
     |                                      |
     | GET /portal/a1b2c3d4...              |
     |------------------------------------->|
     |                                      |
     |    RPC: validate_share_token(token)  |
     |    - Check not revoked               |
     |    - Check not expired               |
     |    - Check access_count < max        |
     |    - Increment access_count          |
     |    - Return project data + perms     |
     |<-------------------------------------|
     |                                      |
     | Render portal with permissions       |
     |                                      |
```

### 4.4 Digital Signature Capture

Architecture for canvas-based e-signature:

```
+---------------------------------------------------------------+
|                  SIGNATURE CAPTURE FLOW                        |
+---------------------------------------------------------------+
|                                                               |
|  +-------------------+                                        |
|  | SignaturePad      |  (React component)                    |
|  | Component         |                                        |
|  |                   |                                        |
|  | - HTML5 Canvas    |                                        |
|  | - Touch events    |                                        |
|  | - Pressure-aware  |                                        |
|  | - Undo/Redo       |                                        |
|  | - Clear           |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | On "Accept":      |                                        |
|  |                   |                                        |
|  | 1. canvas.toBlob  |                                        |
|  |    (PNG, 300 DPI) |                                        |
|  |                   |                                        |
|  | 2. Capture meta:  |                                        |
|  |    - timestamp    |                                        |
|  |    - IP address   |                                        |
|  |    - user agent   |                                        |
|  |    - share_token  |                                        |
|  |    - SHA-256 hash |                                        |
|  |      of canvas    |                                        |
|  |      pixel data   |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+       +-------------------+            |
|  | Upload to         |       | Insert into       |            |
|  | Supabase Storage  |------>| signatures table  |            |
|  | /signatures/      |       | (metadata +       |            |
|  | <project_id>/     |       |  storage path)    |            |
|  | sig_<timestamp>   |       |                   |            |
|  +-------------------+       +-------------------+            |
|                                                               |
+---------------------------------------------------------------+
```

Signatures table schema:

```sql
CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  share_token_id UUID REFERENCES share_tokens(id),
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_image_path TEXT NOT NULL,  -- path in Supabase Storage
  pixel_hash TEXT NOT NULL,            -- SHA-256 of raw canvas ImageData
  ip_address INET,
  user_agent TEXT,
  signed_at TIMESTAMPTZ DEFAULT now(),
  certificate_id UUID                  -- links to generated certificate
);

-- RLS: signatures insertable by anyone with a valid share token,
-- readable by project owner/PM
```

Legal validity considerations:
- The combination of timestamp, IP address, user agent, pixel hash, and the signer's typed name satisfies ESIGN Act and UETA requirements for electronic signatures.
- The SHA-256 hash of the raw canvas pixel data provides tamper evidence -- if the image is modified after signing, the hash will not match.
- Store the raw `ImageData` buffer hash, not the PNG hash, since PNG encoding is not deterministic across platforms.

### 4.5 Certificate of Completion

Auto-generated PDF containing all project deliverables and the client signature.

```
+---------------------------------------------------------------+
|              CERTIFICATE GENERATION PIPELINE                  |
+---------------------------------------------------------------+
|                                                               |
|  Trigger: Client signs on the portal                         |
|                                                               |
|  +-------------------+                                        |
|  | Supabase Edge     |                                        |
|  | Function:         |                                        |
|  | generate-cert     |                                        |
|  |                   |                                        |
|  | Inputs:           |                                        |
|  |  - project_id     |                                        |
|  |  - signature_id   |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | Fetch from DB:    |                                        |
|  |  - project record |                                        |
|  |  - survey_points  |                                        |
|  |  - math_logs      |                                        |
|  |  - signature img  |                                        |
|  |  - photos (URLs)  |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | Generate PDF      |                                        |
|  | (pdf-lib or       |                                        |
|  |  @react-pdf/      |                                        |
|  |  renderer in      |                                        |
|  |  Edge Function)   |                                        |
|  |                   |                                        |
|  | Contents:         |                                        |
|  |  Page 1: Cover    |                                        |
|  |   - Firm logo     |                                        |
|  |   - Project name  |                                        |
|  |   - Client name   |                                        |
|  |   - Date range    |                                        |
|  |   - Certificate # |                                        |
|  |                   |                                        |
|  |  Page 2: Summary  |                                        |
|  |   - Scope tasks   |                                        |
|  |   - Equipment log |                                        |
|  |   - Point count   |                                        |
|  |   - QA/QC summary |                                        |
|  |   - Harrison Math |                                        |
|  |     tolerance rpt |                                        |
|  |                   |                                        |
|  |  Page 3: Points   |                                        |
|  |   - Tabular data  |                                        |
|  |   - N, E, Z       |                                        |
|  |                   |                                        |
|  |  Page 4: Photos   |                                        |
|  |   - Grid layout   |                                        |
|  |   - GPS coords    |                                        |
|  |                   |                                        |
|  |  Page 5: Sign-off |                                        |
|  |   - Signature img |                                        |
|  |   - Signer name   |                                        |
|  |   - Timestamp     |                                        |
|  |   - Pixel hash    |                                        |
|  |   - Certificate # |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+       +-------------------+            |
|  | Upload PDF to     |       | Insert into       |            |
|  | Supabase Storage  |------>| certificates      |            |
|  | /certificates/    |       | table             |            |
|  | <project_id>/     |       |                   |            |
|  | cert_<uuid>.pdf   |       |                   |            |
|  +-------------------+       +-------------------+            |
|                                                               |
+---------------------------------------------------------------+
```

Certificates table:

```sql
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  signature_id UUID NOT NULL REFERENCES signatures(id),
  certificate_number TEXT UNIQUE NOT NULL,  -- e.g., "CERT-2026-00142"
  pdf_storage_path TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  point_count INTEGER,
  photo_count INTEGER,
  qa_summary JSONB,  -- { totalPoints, passCount, failCount, maxVector }
  firm_id UUID REFERENCES firms(id)
);

-- Certificate number generation:
CREATE SEQUENCE cert_seq START 1;
-- Format: CERT-<YEAR>-<5-digit-seq>
```

### 4.6 Client Notification Pipeline

```
+---------------------------------------------------------------+
|              NOTIFICATION SYSTEM                               |
+---------------------------------------------------------------+
|                                                               |
|  Trigger Events:                                              |
|    A. PM generates deliverable package                        |
|    B. Client signs certificate                                |
|    C. Payment received                                        |
|    D. Project status changes                                  |
|                                                               |
|  +-------------------+                                        |
|  | Supabase DB       |                                        |
|  | Trigger           |                                        |
|  | (on INSERT to     |                                        |
|  |  share_tokens or  |                                        |
|  |  status change)   |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | pg_net or         |                                        |
|  | Database Webhook  |                                        |
|  | -> Edge Function  |                                        |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | Edge Function:    |                                        |
|  | notify-client     |                                        |
|  |                   |                                        |
|  | 1. Fetch project  |                                        |
|  |    + share_token  |                                        |
|  |    + client info  |                                        |
|  |                   |                                        |
|  | 2. Render email   |                                        |
|  |    template       |                                        |
|  |                   |                                        |
|  | 3. Send via:      |                                        |
|  |    - Resend (email)|                                       |
|  |    - Twilio (SMS)  |                                       |
|  +--------+----------+                                        |
|           |                                                   |
|           v                                                   |
|  +-------------------+                                        |
|  | notification_log  |                                        |
|  | table (audit)     |                                        |
|  +-------------------+                                        |
|                                                               |
+---------------------------------------------------------------+
```

Notification log schema:

```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  share_token_id UUID REFERENCES share_tokens(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,  -- email address or phone number
  template TEXT NOT NULL,   -- 'deliverable_ready', 'signature_confirmed', 'payment_received'
  payload JSONB,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'failed')),
  external_id TEXT,         -- Resend/Twilio message ID
  sent_at TIMESTAMPTZ DEFAULT now()
);
```

Email templates (rendered in Edge Function with simple string interpolation):

- **deliverable_ready**: "Your survey for [project_name] is complete. View your results and sign off: [portal_link]"
- **signature_confirmed**: "Thank you for signing off on [project_name]. Your Certificate of Completion (#[cert_number]) is attached."
- **payment_received**: "Payment of $[amount] received for [project_name]. Thank you for choosing [firm_name]."

SMS variants are truncated to 160 characters with a link.

### 4.7 CRM Feedback Loop

When a client signs and pays, the system must update internal state to close the project lifecycle and trigger downstream accounting.

```
+---------------------------------------------------------------+
|              CRM FEEDBACK LOOP                                |
+---------------------------------------------------------------+
|                                                               |
|  Client signs                                                 |
|       |                                                       |
|       v                                                       |
|  signatures table INSERT                                      |
|       |                                                       |
|       v                                                       |
|  DB trigger -> Edge Function: on-signature                    |
|       |                                                       |
|       +---> Update projects SET                               |
|       |       client_signed = true,                           |
|       |       client_signed_at = now()                        |
|       |                                                       |
|       +---> Generate Certificate (see 4.5)                    |
|       |                                                       |
|       +---> Send confirmation notification                    |
|                                                               |
|  Client pays (Stripe webhook)                                 |
|       |                                                       |
|       v                                                       |
|  Edge Function: stripe-webhook                                |
|       |                                                       |
|       +---> Update projects SET                               |
|       |       invoice_status = 'paid',                        |
|       |       paid_at = now(),                                |
|       |       stripe_payment_id = event.id                    |
|       |                                                       |
|       +---> Update projects SET                               |
|       |       status = 'completed'                            |
|       |       (if client_signed = true AND                    |
|       |        invoice_status = 'paid')                       |
|       |                                                       |
|       +---> Export to accounting (optional webhook):          |
|       |       POST to QuickBooks/Xero API with                |
|       |       invoice data                                    |
|       |                                                       |
|       +---> Send payment confirmation notification            |
|                                                               |
|  Morning Brief (Owner dashboard) reflects:                    |
|       - Project moved to "Closed" column                      |
|       - Revenue recognized                                    |
|       - Equipment auto-returned to "In Office"                |
|                                                               |
+---------------------------------------------------------------+
```

Project completion state machine with signature and payment gates:

```
field_complete
     |
     v
 [PM reviews and generates deliverable package]
     |
     v
deliverable_sent  (new status)
     |
     +--------+--------+
     |                  |
     v                  v
client_signed      payment_received
     |                  |
     +--------+---------+
              |
              v
         completed  (both gates passed)
              |
              v
         archived  (manual or after 90 days)
```

### 4.8 Security Model

```
+---------------------------------------------------------------+
|              SECURITY ARCHITECTURE                            |
+---------------------------------------------------------------+
|                                                               |
|  LAYER 1: Share Token Authentication                          |
|  - 256-bit random token (32 bytes, hex-encoded = 64 chars)   |
|  - Not a JWT -- opaque token, server-validated every request  |
|  - Expires after 30 days (configurable per token)             |
|  - Max 100 accesses (configurable)                            |
|  - Revocable by PM at any time                                |
|                                                               |
|  LAYER 2: Supabase RLS Policies                              |
|  - share_tokens: SELECT for anyone, INSERT for auth'd PMs    |
|  - project data via RPC only (validate_share_token checks     |
|    token validity before returning any data)                  |
|  - No direct table access for unauthenticated users           |
|                                                               |
|  LAYER 3: Signed URLs for Storage Assets                     |
|  - Photos and certificates served via Supabase signed URLs    |
|  - Signed URLs expire after 1 hour                            |
|  - Generated server-side in the validate_share_token RPC      |
|  - Client never sees raw storage paths                        |
|                                                               |
|  LAYER 4: Audit Trail                                        |
|  - Every portal access logged:                                |
|    share_token_id, ip, user_agent, timestamp, action          |
|  - Stored in portal_audit_log table                           |
|  - Immutable (INSERT only, no UPDATE/DELETE policy)           |
|                                                               |
|  LAYER 5: Signature Integrity                                |
|  - SHA-256 hash of canvas ImageData stored at sign time       |
|  - Hash verified on certificate generation                    |
|  - Signature image stored in private bucket (not public)      |
|  - Only accessible via signed URL embedded in certificate     |
|                                                               |
+---------------------------------------------------------------+
```

Audit log schema:

```sql
CREATE TABLE portal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token_id UUID NOT NULL REFERENCES share_tokens(id),
  project_id UUID NOT NULL,
  action TEXT NOT NULL,  -- 'view', 'download_photo', 'sign', 'pay', 'download_cert'
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Immutable: no UPDATE or DELETE allowed
CREATE POLICY "Insert only" ON portal_audit_log
  FOR ALL USING (false)
  WITH CHECK (true);

-- Override for INSERT specifically
CREATE POLICY "Anyone can insert audit entries" ON portal_audit_log
  FOR INSERT WITH CHECK (true);
```

RPC for secure portal data retrieval (replaces the missing `fetchClientData`):

```sql
CREATE OR REPLACE FUNCTION get_portal_data(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_share share_tokens%ROWTYPE;
  v_project projects%ROWTYPE;
  v_points JSONB;
  v_photos JSONB;
  v_signature JSONB;
  v_certificate JSONB;
BEGIN
  -- Validate token
  SELECT * INTO v_share FROM share_tokens
  WHERE token = p_token
    AND NOT revoked
    AND expires_at > now()
    AND access_count < max_access;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired link');
  END IF;

  -- Increment access counter
  UPDATE share_tokens SET access_count = access_count + 1 WHERE id = v_share.id;

  -- Fetch project
  SELECT * INTO v_project FROM projects WHERE id = v_share.project_id;

  -- Fetch points (if permitted)
  IF (v_share.permissions->>'view_geometry')::boolean THEN
    SELECT jsonb_agg(row_to_json(sp)) INTO v_points
    FROM survey_points sp WHERE sp.project_id = v_share.project_id;
  END IF;

  -- Fetch signature if exists
  SELECT row_to_json(s)::jsonb INTO v_signature
  FROM signatures s WHERE s.project_id = v_share.project_id
  ORDER BY signed_at DESC LIMIT 1;

  -- Fetch certificate if exists
  SELECT row_to_json(c)::jsonb INTO v_certificate
  FROM certificates c WHERE c.project_id = v_share.project_id
  ORDER BY generated_at DESC LIMIT 1;

  -- Log access
  INSERT INTO portal_audit_log (share_token_id, project_id, action)
  VALUES (v_share.id, v_share.project_id, 'view');

  RETURN jsonb_build_object(
    'project', row_to_json(v_project),
    'points', COALESCE(v_points, '[]'::jsonb),
    'permissions', v_share.permissions,
    'signature', v_signature,
    'certificate', v_certificate,
    'token_id', v_share.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.9 Implementation Priority

```
+-------+--------------------------------------+----------+------------+
| Phase | Deliverable                          | Effort   | Depends On |
+-------+--------------------------------------+----------+------------+
|   1   | Fix fetchClientData bug in App.jsx   | 1 hour   | None       |
|   1   | share_tokens table + RLS             | 2 hours  | None       |
|   1   | get_portal_data RPC                  | 3 hours  | share_tokens|
|   2   | SignaturePad component               | 4 hours  | Phase 1    |
|   2   | signatures table + storage bucket    | 2 hours  | Phase 1    |
|   2   | portal_audit_log table               | 1 hour   | Phase 1    |
|   3   | Edge Function: generate-cert         | 6 hours  | Phase 2    |
|   3   | certificates table                   | 1 hour   | Phase 2    |
|   3   | Edge Function: notify-client         | 4 hours  | Phase 1    |
|   4   | Stripe webhook Edge Function         | 4 hours  | Phase 3    |
|   4   | CRM feedback (status machine)        | 3 hours  | Phase 3    |
|   4   | Accounting export webhook            | 4 hours  | Phase 4    |
+-------+--------------------------------------+----------+------------+
```

### 4.10 Relevant Existing Files

| File | Current Role | Required Changes |
|------|-------------|-----------------|
| `/Users/theobower/Desktop/surveyos-app/src/lib/offlineStore.js` | Minimal IndexedDB vault (35 lines) | Expand to ~300 lines with idempotency, WAL, photo blob store, sync metadata, retry tracking, quota management |
| `/Users/theobower/Desktop/surveyos-app/src/views/TodaysWork.jsx` | Field UI with 5s sync loop (473 lines) | Extract sync engine to standalone module; add Service Worker registration; add network probe; add visibility change handler |
| `/Users/theobower/Desktop/surveyos-app/src/lib/harrisonMath.js` | Pure calculation (41 lines) | No changes needed; will be called by certificate generation Edge Function server-side |
| `/Users/theobower/Desktop/surveyos-app/src/views/ClientPortal.jsx` | Read-only portal with demo Stripe (152 lines) | Add SignaturePad, certificate download, real Stripe integration, token-based auth |
| `/Users/theobower/Desktop/surveyos-app/src/App.jsx` | Routing and data fetching | Fix missing `fetchClientData`, switch to token-based portal routing, add SW registration |
| `/Users/theobower/Desktop/surveyos-app/src/components/ProjectDrawer.jsx` | PM project detail view | Add "Generate Deliverable Package" action that creates share token and triggers notification |

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- Enable RLS on all existing tables (projects, user_profiles, equipment, survey_points)
- Deploy `get_my_firm_id()` and `get_my_role()` helper functions
- Fix the missing `fetchClientData` function in App.jsx
- Create `share_tokens` table with RLS policies
- Deploy `get_portal_data` RPC for secure client portal access

### Phase 2: Identity & Invitations (Week 2-3)
- Create `firm_invitations` table with expiring invite codes
- Refactor `Auth.jsx` to use invite-code-based onboarding (replace raw UUID)
- Expand `firms` table with business details, subscription tier, invoice settings
- Backfill `user_profiles` with email, last_name, phone from auth.users

### Phase 3: Payments Engine (Week 3-5)
- Create `stripe_accounts`, `invoices`, `payments` tables
- Build Stripe Connect onboarding flow (`/api/stripe/connect-onboard`)
- Build invoice creation + Checkout Session (`/api/stripe/create-invoice`)
- Build webhook handler with signature verification (`/api/stripe/webhook`)
- Replace `DemoStripeCheckout` in ClientPortal.jsx with real Stripe Checkout
- Wire invoice data into the share token portal flow

### Phase 4: Offline Engine Upgrade (Week 4-6)
- Upgrade `offlineStore.js`: idempotency keys, WAL journaling, photo blob store, retry tracking
- Create `sync_receipts` table + `idempotent_sync` RPC (server-side dedup)
- Build Service Worker (`sw-vault.js`) with Background Sync API for TSC5 survival
- Implement `NetworkProbe` with adaptive sync intervals
- Add `visibilitychange` listener for immediate drain on tab return
- Implement boot-time recovery (WAL replay, in-flight re-queue, orphan GC)
- Chunk CSV inserts (50 points per mutation) and photo uploads (TUS resumable)

### Phase 5: Client Portal & Signatures (Week 5-7)
- Build `SignaturePad` component (canvas-based, SHA-256 tamper hash)
- Create `signatures`, `certificates`, `notification_log`, `portal_audit_log` tables
- Build Edge Function: `generate-cert` (PDF with pdf-lib)
- Build Edge Function: `notify-client` (Resend for email, Twilio for SMS)
- Implement token-based portal routing (replace raw project UUID URLs)
- Wire CRM feedback loop: signature + payment gates -> project completion

### Phase 6: Polish & Launch (Week 7-8)
- Add granular RLS for field roles (assigned projects only)
- Build admin UI for role management and permission customization
- Implement accounting export webhooks (QuickBooks/Xero)
- TSC5 field testing: validate offline sync, app-switch survival, photo pipeline
- Load testing: 50 concurrent firms, 500 survey points per project
- Security audit: RLS policy verification, share token expiration, webhook signatures

---

## Appendix A: Complete Database Schema Reference

| # | Table | Pillar | Purpose |
|---|-------|--------|---------|
| 1 | `firms` | 2 | Top-level tenant entity with subscription and business details |
| 2 | `user_profiles` | 2 | Extended user identity with role, firm membership, invitation tracking |
| 3 | `firm_invitations` | 2 | Secure, expiring invite codes replacing raw UUID sharing |
| 4 | `permissions` | 2 | RBAC lookup table for role-resource-action matrix |
| 5 | `projects` | Existing | Central project entity (expanded with signature/payment gates) |
| 6 | `survey_points` | Existing | Field coordinate data with point provenance |
| 7 | `equipment` | Existing | Firm equipment inventory and checkout tracking |
| 8 | `stripe_accounts` | 1 | One-per-firm Stripe Connect Express account linkage |
| 9 | `invoices` | 1 | Financial documents with line items, Stripe references, status machine |
| 10 | `payments` | 1 | Immutable ledger of all payment events and settlement details |
| 11 | `share_tokens` | 2/4 | Secure, time-limited, revocable client portal access tokens |
| 12 | `sync_receipts` | 3 | Server-side idempotency ledger for offline sync deduplication |
| 13 | `math_logs` | 3 | Harrison Math QA/QC tolerance calculations per point |
| 14 | `signatures` | 4 | Digital signature metadata with canvas pixel hash for tamper evidence |
| 15 | `certificates` | 4 | Auto-generated Certificate of Completion PDF references |
| 16 | `notification_log` | 4 | Audit trail for all email/SMS notifications sent to clients |
| 17 | `portal_audit_log` | 4 | Immutable log of all client portal access events |

---

## Appendix B: API Route Reference

### Vercel Serverless Functions (or Supabase Edge Functions)

| Route | Method | Auth | Pillar | Purpose |
|-------|--------|------|--------|---------|
| `/api/stripe/connect-onboard` | POST | JWT (owner/admin) | 1 | Create Express account + return Account Link URL |
| `/api/stripe/connect-refresh` | GET | JWT (owner/admin) | 1 | Regenerate Account Link if onboarding expired |
| `/api/stripe/connect-status` | GET | JWT (owner/admin) | 1 | Check onboarding completion for current firm |
| `/api/stripe/create-invoice` | POST | JWT (owner/admin/pm) | 1 | Create invoice + Stripe Checkout Session |
| `/api/stripe/get-invoice` | GET | JWT or share token | 1 | Retrieve invoice details for portal |
| `/api/stripe/webhook` | POST | Stripe signature | 1 | Handle payment + account events |
| `/api/stripe/payout-schedule` | GET | JWT (owner/admin) | 1 | Get firm payout schedule from Stripe |
| `/api/stripe/dashboard-link` | POST | JWT (owner/admin) | 1 | Generate Express Dashboard login link |

### Supabase Edge Functions

| Function | Trigger | Pillar | Purpose |
|----------|---------|--------|---------|
| `generate-cert` | On signature insert | 4 | Generate Certificate of Completion PDF |
| `notify-client` | On share token create / status change | 4 | Send email (Resend) + SMS (Twilio) |
| `on-signature` | DB trigger on signatures INSERT | 4 | Update project state, trigger cert generation |
| `stripe-webhook-handler` | Stripe webhook | 1/4 | Update invoice/payment status, trigger completion |

### Supabase RPC Functions

| Function | Auth | Pillar | Purpose |
|----------|------|--------|---------|
| `get_my_firm_id()` | JWT | 2 | Helper: return current user's firm_id |
| `get_my_role()` | JWT | 2 | Helper: return current user's role |
| `idempotent_sync()` | JWT | 3 | Deduplicated mutation processing |
| `get_portal_data()` | None (token-validated) | 4 | Secure portal data retrieval |
| `validate_share_token()` | None | 4 | Token validation + access counter |

---

## Appendix C: File Change Manifest

| File | Current State | Required Changes |
|------|--------------|-----------------|
| `src/supabaseClient.js` | Hardcoded anon key | Move to `import.meta.env.VITE_SUPABASE_ANON_KEY` |
| `src/App.jsx` | Main shell, routing, realtime | Fix missing `fetchClientData`, add SW registration, token-based portal routing |
| `src/Auth.jsx` | Raw UUID invite code | Refactor to invite-code-based flow with email pre-fill |
| `src/lib/offlineStore.js` | Minimal vault (35 lines) | Expand to ~300 lines: idempotency, WAL, photo blobs, retry, quota |
| `src/lib/stripe.js` | Empty placeholder | Full Stripe client initialization |
| `src/lib/harrisonMath.js` | Pure calculation (41 lines) | No changes (also used server-side in cert generation) |
| `src/views/TodaysWork.jsx` | Field UI + 5s sync loop | Extract sync to standalone module, add SW registration, network probe, visibility handler |
| `src/views/CommandCenter.jsx` | PM dashboard + dispatch | Add "Generate Deliverable Package" action, invoice creation UI |
| `src/views/ClientPortal.jsx` | Read-only + demo Stripe | Add SignaturePad, real Stripe Checkout, certificate download, token auth |
| `src/views/MorningBrief.jsx` | Dark mode morning brief | Wire to real invoice/payment data from new tables |
| `src/views/NetworkOps.jsx` | Equipment management | Add Stripe Connect onboarding section for firm owners |
| `src/components/ProjectDrawer.jsx` | Intelligence drawer | Add "Generate Deliverable Package" button, certificate view |
| `src/components/DeploymentModal.jsx` | New project dispatch | No changes needed |
| `public/sw-vault.js` | Does not exist | NEW: Service Worker with Background Sync for offline vault drain |
| `api/stripe/*.js` | Does not exist | NEW: 8 Vercel serverless functions for Stripe Connect |

---

*This document was compiled by three AI architect agents analyzing the SurveyOS codebase. All SQL schemas, API routes, and implementation plans are designed to be additive and non-breaking against the existing React + Supabase architecture.*
