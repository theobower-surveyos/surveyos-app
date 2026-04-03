-- ================================================================
-- SurveyOS Migration 02: Stripe Connect Tables
-- ================================================================
-- Creates the financial tables required for Pillar 1.
-- Run AFTER 01_core_multitenant_rbac.sql
-- ================================================================

BEGIN;

-- ============================================================
-- STRIPE ACCOUNTS: One per firm. Links firm to Stripe Connect.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stripe_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id           UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL UNIQUE,
    account_type      TEXT NOT NULL DEFAULT 'express',
    onboarding_status TEXT NOT NULL DEFAULT 'pending',
    charges_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    default_take_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0275,
    capabilities      JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT one_stripe_per_firm UNIQUE (firm_id),
    CONSTRAINT valid_onboarding_status CHECK (onboarding_status IN ('pending', 'incomplete', 'complete'))
);

CREATE INDEX IF NOT EXISTS idx_stripe_accounts_stripe_id ON public.stripe_accounts(stripe_account_id);

-- ============================================================
-- INVOICES: Financial documents tied to projects.
-- All monetary values stored in cents (BIGINT).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                    UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    project_id                 UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    invoice_number             TEXT NOT NULL,
    subtotal_cents             BIGINT NOT NULL,
    tax_cents                  BIGINT NOT NULL DEFAULT 0,
    total_cents                BIGINT NOT NULL,
    platform_fee_cents         BIGINT NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'draft',
    due_date                   DATE,
    sent_at                    TIMESTAMPTZ,
    viewed_at                  TIMESTAMPTZ,
    paid_at                    TIMESTAMPTZ,
    voided_at                  TIMESTAMPTZ,
    stripe_payment_intent_id   TEXT,
    stripe_checkout_session_id TEXT,
    checkout_url               TEXT,
    client_name                TEXT NOT NULL,
    client_email               TEXT,
    client_company             TEXT,
    line_items                 JSONB NOT NULL DEFAULT '[]',
    notes                      TEXT,
    created_by                 UUID,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_invoice_status CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'void', 'overdue'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_firm_number ON public.invoices(firm_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_pi ON public.invoices(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_cs ON public.invoices(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(firm_id, status);

-- ============================================================
-- PAYMENTS: Immutable ledger of all payment events.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id                 UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    firm_id                    UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    amount_cents               BIGINT NOT NULL,
    platform_fee_cents         BIGINT NOT NULL,
    stripe_fee_cents           BIGINT,
    net_to_firm_cents          BIGINT,
    stripe_payment_intent_id   TEXT NOT NULL,
    stripe_charge_id           TEXT,
    stripe_transfer_id         TEXT,
    status                     TEXT NOT NULL DEFAULT 'pending',
    failure_reason             TEXT,
    payment_method             TEXT,
    card_brand                 TEXT,
    card_last4                 TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_firm_status ON public.payments(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON public.payments(stripe_payment_intent_id);

-- ============================================================
-- RLS POLICIES FOR FINANCIAL TABLES
-- ============================================================

ALTER TABLE public.stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Stripe Accounts: only owners and admins
DROP POLICY IF EXISTS "Owners and admins read stripe account" ON public.stripe_accounts;
CREATE POLICY "Owners and admins read stripe account"
  ON public.stripe_accounts FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin')
  );

-- Invoices: office roles only (clients access via Edge Function RPC)
DROP POLICY IF EXISTS "Office roles read firm invoices" ON public.invoices;
CREATE POLICY "Office roles read firm invoices"
  ON public.invoices FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

DROP POLICY IF EXISTS "Office roles create invoices" ON public.invoices;
CREATE POLICY "Office roles create invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

DROP POLICY IF EXISTS "Office roles update invoices" ON public.invoices;
CREATE POLICY "Office roles update invoices"
  ON public.invoices FOR UPDATE
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- Payments: read-only for office roles (inserts come from webhook via service role)
DROP POLICY IF EXISTS "Office roles read firm payments" ON public.payments;
CREATE POLICY "Office roles read firm payments"
  ON public.payments FOR SELECT
  USING (
    firm_id = public.get_my_firm_id()
    AND public.get_my_role() IN ('owner', 'admin', 'pm')
  );

-- updated_at triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.stripe_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMIT;
