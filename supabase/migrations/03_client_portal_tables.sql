-- ================================================================
-- SurveyOS Migration 03: Client Portal Tables
-- ================================================================
-- Implements Pillar 4: signatures, certificates, notifications, audit.
-- Run AFTER 01 and 02 migrations.
-- ================================================================

BEGIN;

-- ============================================================
-- SIGNATURES: Digital sign-off with tamper evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.signatures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    share_token_id      UUID REFERENCES public.share_tokens(id),
    signer_name         TEXT NOT NULL,
    signer_email        TEXT,
    signature_image_path TEXT NOT NULL,
    pixel_hash          TEXT NOT NULL,    -- SHA-256 of raw canvas ImageData
    ip_address          INET,
    user_agent          TEXT,
    signed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    certificate_id      UUID
);

CREATE INDEX IF NOT EXISTS idx_signatures_project ON public.signatures(project_id);

-- ============================================================
-- CERTIFICATES: Auto-generated completion PDFs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.certificates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    signature_id        UUID REFERENCES public.signatures(id),
    certificate_number  TEXT UNIQUE NOT NULL,
    pdf_storage_path    TEXT NOT NULL,
    point_count         INTEGER,
    photo_count         INTEGER,
    qa_summary          JSONB,
    firm_id             UUID REFERENCES public.firms(id),
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS cert_seq START 1;
CREATE INDEX IF NOT EXISTS idx_certificates_project ON public.certificates(project_id);

-- ============================================================
-- NOTIFICATION LOG: Audit trail for all client notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    share_token_id      UUID REFERENCES public.share_tokens(id),
    channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient           TEXT NOT NULL,
    template            TEXT NOT NULL,
    payload             JSONB,
    status              TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'failed')),
    external_id         TEXT,
    sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_project ON public.notification_log(project_id);

-- ============================================================
-- PORTAL AUDIT LOG: Immutable access log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portal_audit_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token_id      UUID NOT NULL REFERENCES public.share_tokens(id),
    project_id          UUID NOT NULL,
    action              TEXT NOT NULL,
    ip_address          INET,
    user_agent          TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_audit_project ON public.portal_audit_log(project_id);

-- ============================================================
-- ADD client_signed COLUMNS TO PROJECTS
-- ============================================================
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS client_signed    BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS client_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS signature_id     UUID;

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_audit_log ENABLE ROW LEVEL SECURITY;

-- Signatures: office roles read. Anon can insert via share token.
CREATE POLICY "Office roles read signatures"
    ON public.signatures FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = signatures.project_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

CREATE POLICY "Anon can insert signature via share token"
    ON public.signatures FOR INSERT
    WITH CHECK (
        share_token_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.share_tokens st
            WHERE st.id = signatures.share_token_id
              AND st.is_active = TRUE
              AND (st.expires_at IS NULL OR st.expires_at > now())
        )
    );

-- Certificates: office roles + anon with share token
CREATE POLICY "Office roles read certificates"
    ON public.certificates FOR SELECT
    USING (
        firm_id = public.get_my_firm_id()
    );

CREATE POLICY "Anon read certificate via share token"
    ON public.certificates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.share_tokens st
            WHERE st.project_id = certificates.project_id
              AND st.is_active = TRUE
        )
    );

-- Notification log: office roles only
CREATE POLICY "Office roles read notification log"
    ON public.notification_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = notification_log.project_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

-- Portal audit log: insert-only for anyone, read for office roles
CREATE POLICY "Anyone can insert audit entries"
    ON public.portal_audit_log FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Office roles read audit log"
    ON public.portal_audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = portal_audit_log.project_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

COMMIT;
