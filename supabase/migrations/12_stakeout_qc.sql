-- ================================================================
-- SurveyOS Migration 12: Stakeout QC
-- ================================================================
-- Implements Pillar 5: field-to-office stakeout verification.
--
-- Introduces the schema for a per-firm feature-code library, design-
-- point rosters, per-day stakeout assignments, submitted QC runs,
-- observed QC points, an export audit trail, and monthly per-person
-- accuracy narratives. Also adds the stakeout-reports storage bucket
-- (CSV / XLSX / PDF deliverables) and extends public.permissions
-- with the new resources.
--
-- Vocabulary note: the word "review" is already owned by
-- projects.reviewed_at (migration 11 — PM sign-off on a completed
-- project). To avoid collision, this migration uses "QC run" for a
-- submitted field observation set and "reconciled" for the office
-- acceptance step. A project may contain many QC runs; a QC run is
-- not a project review.
--
-- Per-person accuracy attribution: accuracy metrics attach to the
-- party_chief_id on the QC run, not to a crew. SurveyOS has no
-- crews table (see CLAUDE.md — crews are formed per-project via
-- projects.assigned_to + projects.assigned_crew). The monthly
-- crew_accuracy_narratives table therefore carries user_id, not a
-- crew identifier.
--
-- Foreign keys to user_profiles use ON DELETE SET NULL for
-- assignee columns so deactivating a user via is_active=false (or
-- eventual hard-delete) leaves historical runs, reports, and
-- narratives intact with the uid cleared.
-- ================================================================

BEGIN;

-- ================================================================
-- SECTION 1: SCHEMA — FEATURE CODES
-- ================================================================
-- Per-firm library of survey feature codes (TBC, EP, SSMH, etc.)
-- with default offsets, stake types, and tolerances. Codes are
-- referenced from stakeout_design_points.feature_code by value —
-- not a hard FK, because design points may be imported before a
-- firm has finished populating its code library.

CREATE TABLE IF NOT EXISTS public.feature_codes (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                   UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    code                      TEXT NOT NULL,
    feature_type              TEXT NOT NULL,
    description               TEXT,
    default_offset_distance   NUMERIC(6,2),
    default_offset_direction  TEXT CHECK (default_offset_direction IN ('N','S','E','W','perpendicular')),
    default_stake_type        TEXT CHECK (default_stake_type IN ('N','H','L','P','S','F')),
    default_tolerance_h       NUMERIC(6,3) DEFAULT 0.020,
    default_tolerance_v       NUMERIC(6,3) DEFAULT 0.050,
    geometry_mode             TEXT CHECK (geometry_mode IN ('point','line','alignment')) DEFAULT 'point',
    is_active                 BOOLEAN DEFAULT TRUE,
    created_at                TIMESTAMPTZ DEFAULT now(),
    updated_at                TIMESTAMPTZ DEFAULT now(),
    UNIQUE (firm_id, code)
);

CREATE INDEX IF NOT EXISTS idx_feature_codes_firm ON public.feature_codes(firm_id);


-- ================================================================
-- SECTION 2: SCHEMA — STAKEOUT DESIGN POINTS
-- ================================================================
-- The all-points roster for a project. Imported from CSV/JXL or
-- entered manually. Per-point tolerance overrides fall back to
-- the feature_codes default when NULL.

CREATE TABLE IF NOT EXISTS public.stakeout_design_points (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id             UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    point_id               TEXT NOT NULL,
    feature_code           TEXT,
    feature_description    TEXT,
    northing               NUMERIC(12,3) NOT NULL,
    easting                NUMERIC(12,3) NOT NULL,
    elevation              NUMERIC(10,3),
    tolerance_h_override   NUMERIC(6,3),
    tolerance_v_override   NUMERIC(6,3),
    source_file            TEXT,
    source_format          TEXT CHECK (source_format IN ('csv','jxl','manual')),
    imported_at            TIMESTAMPTZ DEFAULT now(),
    imported_by            UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    UNIQUE (project_id, point_id)
);

CREATE INDEX IF NOT EXISTS idx_stakeout_design_points_project
    ON public.stakeout_design_points(project_id);


-- ================================================================
-- SECTION 3: SCHEMA — STAKEOUT ASSIGNMENTS
-- ================================================================
-- A day's worth of stakeout work on a project. Carries defaults
-- (offset, stake type, tolerance) that the party chief can
-- override per-point via stakeout_assignment_points. Status flows:
-- draft -> sent -> in_progress -> submitted -> reconciled.

CREATE TABLE IF NOT EXISTS public.stakeout_assignments (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id                UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    assignment_date           DATE NOT NULL,
    title                     TEXT NOT NULL,
    notes                     TEXT,
    default_offset_distance   NUMERIC(6,2),
    default_offset_direction  TEXT,
    default_stake_type        TEXT,
    default_tolerance_h       NUMERIC(6,3),
    party_chief_id            UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    status                    TEXT CHECK (status IN ('draft','sent','in_progress','submitted','reconciled')) DEFAULT 'draft',
    created_by                UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at                TIMESTAMPTZ DEFAULT now(),
    updated_at                TIMESTAMPTZ DEFAULT now(),
    sent_at                   TIMESTAMPTZ,
    submitted_at              TIMESTAMPTZ,
    reconciled_at             TIMESTAMPTZ,
    reconciled_by             UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stakeout_assignments_project_date
    ON public.stakeout_assignments(project_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_stakeout_assignments_party_chief_date
    ON public.stakeout_assignments(party_chief_id, assignment_date);


-- ================================================================
-- SECTION 4: SCHEMA — STAKEOUT ASSIGNMENT POINTS
-- ================================================================
-- Join between an assignment and the design points pulled into it.
-- Per-point overrides take precedence over assignment defaults,
-- which take precedence over feature-code defaults.

CREATE TABLE IF NOT EXISTS public.stakeout_assignment_points (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id              UUID NOT NULL REFERENCES public.stakeout_assignments(id) ON DELETE CASCADE,
    design_point_id            UUID NOT NULL REFERENCES public.stakeout_design_points(id) ON DELETE CASCADE,
    sort_order                 INTEGER,
    override_offset_distance   NUMERIC(6,2),
    override_offset_direction  TEXT,
    override_stake_type        TEXT,
    override_tolerance_h       NUMERIC(6,3),
    UNIQUE (assignment_id, design_point_id)
);

CREATE INDEX IF NOT EXISTS idx_stakeout_assignment_points_assignment
    ON public.stakeout_assignment_points(assignment_id);


-- ================================================================
-- SECTION 5: SCHEMA — STAKEOUT QC RUNS
-- ================================================================
-- One row per submitted field session. Carries roll-up metrics
-- computed at submission time. bias_flag is set true when either
-- mean_delta_n or mean_delta_e exceeds 0.03' (indicates a likely
-- systematic offset — bad setup, wrong calibration, etc.) —
-- computation happens in the submit edge function, not here.

CREATE TABLE IF NOT EXISTS public.stakeout_qc_runs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id         UUID NOT NULL REFERENCES public.stakeout_assignments(id) ON DELETE CASCADE,
    party_chief_id        UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    instrument            TEXT,
    weather_notes         TEXT,
    total_points          INTEGER,
    points_in_tol         INTEGER,
    points_out_of_tol     INTEGER,
    points_field_fit      INTEGER,
    points_built_on       INTEGER,
    max_delta_h           NUMERIC(6,3),
    mean_delta_n          NUMERIC(6,3),
    mean_delta_e          NUMERIC(6,3),
    bias_flag             BOOLEAN DEFAULT FALSE,
    submitted_at          TIMESTAMPTZ DEFAULT now(),
    submitted_from        TEXT CHECK (submitted_from IN ('office','field_pwa','api')) DEFAULT 'field_pwa'
);

CREATE INDEX IF NOT EXISTS idx_stakeout_qc_runs_assignment
    ON public.stakeout_qc_runs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_stakeout_qc_runs_chief_submitted
    ON public.stakeout_qc_runs(party_chief_id, submitted_at);


-- ================================================================
-- SECTION 6: SCHEMA — STAKEOUT QC POINTS
-- ================================================================
-- One row per observed point in a run. raw_code is the string
-- emitted by the instrument ("TBC2.0N"); parsed_* is what the
-- field parser extracted; declared_* is what the assignment said
-- the stake should be; actual_* is what the field crew typed when
-- their on-site reality differed from either. offset_variance is
-- declared minus actual offset distance (when both exist).

CREATE TABLE IF NOT EXISTS public.stakeout_qc_points (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                        UUID NOT NULL REFERENCES public.stakeout_qc_runs(id) ON DELETE CASCADE,
    assignment_id                 UUID NOT NULL REFERENCES public.stakeout_assignments(id) ON DELETE CASCADE,
    design_point_id               UUID REFERENCES public.stakeout_design_points(id) ON DELETE SET NULL,
    observed_point_id             TEXT NOT NULL,
    observed_northing             NUMERIC(12,3) NOT NULL,
    observed_easting              NUMERIC(12,3) NOT NULL,
    observed_elevation            NUMERIC(10,3),
    raw_code                      TEXT,
    parsed_feature                TEXT,
    parsed_offset_distance        NUMERIC(6,2),
    parsed_offset_direction       TEXT,
    parsed_stake_type             TEXT,
    declared_offset_distance      NUMERIC(6,2),
    declared_offset_direction     TEXT,
    declared_stake_type           TEXT,
    actual_offset_distance        NUMERIC(6,2),
    actual_offset_direction       TEXT,
    offset_variance               NUMERIC(6,3),
    delta_n                       NUMERIC(6,3),
    delta_e                       NUMERIC(6,3),
    delta_z                       NUMERIC(6,3),
    delta_h                       NUMERIC(6,3),
    effective_tolerance_h         NUMERIC(6,3),
    h_status                      TEXT CHECK (h_status IN ('in_tol','out_of_tol','field_fit','built_on','pending')) DEFAULT 'pending',
    field_fit_reason              TEXT CHECK (field_fit_reason IN ('adjacent_line','utility_conflict','design_math_error','grade_adjustment','other')),
    field_fit_note                TEXT,
    built_on_status               TEXT CHECK (built_on_status IN ('dirt','poured','unknown')),
    observed_at                   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stakeout_qc_points_run
    ON public.stakeout_qc_points(run_id);
CREATE INDEX IF NOT EXISTS idx_stakeout_qc_points_assignment
    ON public.stakeout_qc_points(assignment_id);
CREATE INDEX IF NOT EXISTS idx_stakeout_qc_points_status
    ON public.stakeout_qc_points(h_status);


-- ================================================================
-- SECTION 7: SCHEMA — STAKEOUT QC REPORTS
-- ================================================================
-- Audit trail of exports (CSV / XLSX / PDF). storage_path points
-- at the stakeout-reports bucket, convention {project_id}/{filename}.

CREATE TABLE IF NOT EXISTS public.stakeout_qc_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES public.stakeout_assignments(id) ON DELETE CASCADE,
    run_id          UUID REFERENCES public.stakeout_qc_runs(id) ON DELETE SET NULL,
    format          TEXT CHECK (format IN ('csv','xlsx','pdf')),
    storage_path    TEXT NOT NULL,
    generated_at    TIMESTAMPTZ DEFAULT now(),
    generated_by    UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_stakeout_qc_reports_assignment
    ON public.stakeout_qc_reports(assignment_id);


-- ================================================================
-- SECTION 8: SCHEMA — CREW ACCURACY NARRATIVES
-- ================================================================
-- Monthly per-person accuracy summaries produced by an edge
-- function. Attribution is to user_profiles.id, not a crew
-- identifier — SurveyOS has no crews table.

CREATE TABLE IF NOT EXISTS public.crew_accuracy_narratives (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    firm_id           UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    period_start      DATE NOT NULL,
    period_end        DATE NOT NULL,
    pass_rate         NUMERIC(5,2),
    run_count         INTEGER,
    total_points      INTEGER,
    mean_delta_h      NUMERIC(6,3),
    stddev_delta_h    NUMERIC(6,3),
    bias_n            NUMERIC(6,3),
    bias_e            NUMERIC(6,3),
    narrative_text    TEXT,
    generated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_crew_accuracy_narratives_firm_period
    ON public.crew_accuracy_narratives(firm_id, period_start);


-- ================================================================
-- SECTION 9: UPDATED_AT TRIGGERS
-- ================================================================
-- Reuses public.handle_updated_at() from migration 01.

DROP TRIGGER IF EXISTS set_updated_at ON public.feature_codes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.feature_codes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.stakeout_assignments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stakeout_assignments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ================================================================
-- SECTION 9.5: CHECK CONSTRAINTS — OFFSET DIRECTION AND STAKE TYPE
-- ================================================================
-- feature_codes already constrains default_offset_direction and
-- default_stake_type to fixed value sets. The same discipline is
-- applied here to every other TEXT column carrying an offset
-- direction or a stake type — assignment defaults, per-point
-- overrides, and the parsed/declared/actual variants on QC points.
-- NULL is permitted (CHECK … IN (…) passes on NULL in Postgres),
-- which matches feature_codes' nullable behavior.
--
-- Named constraints are wrapped in DO blocks that drop-if-exists
-- before adding, mirroring the valid_role pattern from migration 04,
-- so the migration stays re-runnable.

DO $$
BEGIN
    ALTER TABLE public.stakeout_assignments
        DROP CONSTRAINT IF EXISTS valid_offset_direction_assignments_default;
    ALTER TABLE public.stakeout_assignments
        ADD CONSTRAINT valid_offset_direction_assignments_default CHECK (
            default_offset_direction IN ('N','S','E','W','perpendicular')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_offset_direction_assignments_default: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_assignments
        DROP CONSTRAINT IF EXISTS valid_stake_type_assignments_default;
    ALTER TABLE public.stakeout_assignments
        ADD CONSTRAINT valid_stake_type_assignments_default CHECK (
            default_stake_type IN ('N','H','L','P','S','F')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_stake_type_assignments_default: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_assignment_points
        DROP CONSTRAINT IF EXISTS valid_offset_direction_assignment_points_override;
    ALTER TABLE public.stakeout_assignment_points
        ADD CONSTRAINT valid_offset_direction_assignment_points_override CHECK (
            override_offset_direction IN ('N','S','E','W','perpendicular')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_offset_direction_assignment_points_override: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_assignment_points
        DROP CONSTRAINT IF EXISTS valid_stake_type_assignment_points_override;
    ALTER TABLE public.stakeout_assignment_points
        ADD CONSTRAINT valid_stake_type_assignment_points_override CHECK (
            override_stake_type IN ('N','H','L','P','S','F')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_stake_type_assignment_points_override: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_offset_direction_qc_points_parsed;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_offset_direction_qc_points_parsed CHECK (
            parsed_offset_direction IN ('N','S','E','W','perpendicular')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_offset_direction_qc_points_parsed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_stake_type_qc_points_parsed;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_stake_type_qc_points_parsed CHECK (
            parsed_stake_type IN ('N','H','L','P','S','F')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_stake_type_qc_points_parsed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_offset_direction_qc_points_declared;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_offset_direction_qc_points_declared CHECK (
            declared_offset_direction IN ('N','S','E','W','perpendicular')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_offset_direction_qc_points_declared: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_stake_type_qc_points_declared;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_stake_type_qc_points_declared CHECK (
            declared_stake_type IN ('N','H','L','P','S','F')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_stake_type_qc_points_declared: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    ALTER TABLE public.stakeout_qc_points
        DROP CONSTRAINT IF EXISTS valid_offset_direction_qc_points_actual;
    ALTER TABLE public.stakeout_qc_points
        ADD CONSTRAINT valid_offset_direction_qc_points_actual CHECK (
            actual_offset_direction IN ('N','S','E','W','perpendicular')
        );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'valid_offset_direction_qc_points_actual: %', SQLERRM;
END;
$$;


-- ================================================================
-- SECTION 9.6: COLUMN PROTECTION — QC POINTS
-- ================================================================
-- RLS can gate row-level access but cannot restrict which columns
-- a party chief may modify on their own observations. Without this
-- trigger, the "Party chief updates own qc points" policy would
-- let a field user rewrite delta_h, observed_northing, h_status,
-- etc. after submission — effectively letting them grade their own
-- work.
--
-- Enforcement: office roles (owner/admin/pm) pass through. Any
-- other caller may only change field_fit_reason, field_fit_note,
-- and built_on_status. A diff on any other column raises an
-- exception that names the offending column. IS DISTINCT FROM is
-- used throughout so NULL ↔ value transitions are detected
-- correctly. Function is SECURITY DEFINER with a pinned search
-- path, matching public.handle_updated_at() from migration 01.

CREATE OR REPLACE FUNCTION public.enforce_qc_point_column_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Office roles retain full authority.
    IF public.get_my_role() IN ('owner','admin','pm') THEN
        RETURN NEW;
    END IF;

    -- Field roles: only field_fit_reason, field_fit_note, built_on_status
    -- may change. Any other column diff is rejected.
    IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column run_id is not editable by field roles.';
    END IF;
    IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column assignment_id is not editable by field roles.';
    END IF;
    IF NEW.design_point_id IS DISTINCT FROM OLD.design_point_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column design_point_id is not editable by field roles.';
    END IF;
    IF NEW.observed_point_id IS DISTINCT FROM OLD.observed_point_id THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_point_id is not editable by field roles.';
    END IF;
    IF NEW.observed_northing IS DISTINCT FROM OLD.observed_northing THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_northing is not editable by field roles.';
    END IF;
    IF NEW.observed_easting IS DISTINCT FROM OLD.observed_easting THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_easting is not editable by field roles.';
    END IF;
    IF NEW.observed_elevation IS DISTINCT FROM OLD.observed_elevation THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_elevation is not editable by field roles.';
    END IF;
    IF NEW.raw_code IS DISTINCT FROM OLD.raw_code THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column raw_code is not editable by field roles.';
    END IF;
    IF NEW.parsed_feature IS DISTINCT FROM OLD.parsed_feature THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_feature is not editable by field roles.';
    END IF;
    IF NEW.parsed_offset_distance IS DISTINCT FROM OLD.parsed_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.parsed_offset_direction IS DISTINCT FROM OLD.parsed_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.parsed_stake_type IS DISTINCT FROM OLD.parsed_stake_type THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column parsed_stake_type is not editable by field roles.';
    END IF;
    IF NEW.declared_offset_distance IS DISTINCT FROM OLD.declared_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.declared_offset_direction IS DISTINCT FROM OLD.declared_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.declared_stake_type IS DISTINCT FROM OLD.declared_stake_type THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column declared_stake_type is not editable by field roles.';
    END IF;
    IF NEW.actual_offset_distance IS DISTINCT FROM OLD.actual_offset_distance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column actual_offset_distance is not editable by field roles.';
    END IF;
    IF NEW.actual_offset_direction IS DISTINCT FROM OLD.actual_offset_direction THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column actual_offset_direction is not editable by field roles.';
    END IF;
    IF NEW.offset_variance IS DISTINCT FROM OLD.offset_variance THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column offset_variance is not editable by field roles.';
    END IF;
    IF NEW.delta_n IS DISTINCT FROM OLD.delta_n THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_n is not editable by field roles.';
    END IF;
    IF NEW.delta_e IS DISTINCT FROM OLD.delta_e THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_e is not editable by field roles.';
    END IF;
    IF NEW.delta_z IS DISTINCT FROM OLD.delta_z THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_z is not editable by field roles.';
    END IF;
    IF NEW.delta_h IS DISTINCT FROM OLD.delta_h THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column delta_h is not editable by field roles.';
    END IF;
    IF NEW.effective_tolerance_h IS DISTINCT FROM OLD.effective_tolerance_h THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column effective_tolerance_h is not editable by field roles.';
    END IF;
    IF NEW.h_status IS DISTINCT FROM OLD.h_status THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column h_status is not editable by field roles.';
    END IF;
    IF NEW.observed_at IS DISTINCT FROM OLD.observed_at THEN
        RAISE EXCEPTION 'Party chief may only update field_fit_reason, field_fit_note, and built_on_status on QC points. Column observed_at is not editable by field roles.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_column_protection ON public.stakeout_qc_points;
CREATE TRIGGER enforce_column_protection
    BEFORE UPDATE ON public.stakeout_qc_points
    FOR EACH ROW EXECUTE FUNCTION public.enforce_qc_point_column_protection();


-- ================================================================
-- SECTION 10: ENABLE ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE public.feature_codes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_design_points      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_assignment_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_qc_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_qc_points          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeout_qc_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_accuracy_narratives    ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- SECTION 11: RLS POLICIES — FEATURE CODES
-- ================================================================

DROP POLICY IF EXISTS "Firm members read feature codes" ON public.feature_codes;
CREATE POLICY "Firm members read feature codes"
    ON public.feature_codes FOR SELECT
    USING (firm_id = public.get_my_firm_id());

DROP POLICY IF EXISTS "Office roles manage feature codes" ON public.feature_codes;
CREATE POLICY "Office roles manage feature codes"
    ON public.feature_codes FOR ALL
    USING (
        firm_id = public.get_my_firm_id()
        AND public.get_my_role() IN ('owner','admin','pm')
    )
    WITH CHECK (
        firm_id = public.get_my_firm_id()
        AND public.get_my_role() IN ('owner','admin','pm')
    );


-- ================================================================
-- SECTION 12: RLS POLICIES — STAKEOUT DESIGN POINTS
-- ================================================================
-- Mirrors the survey_points read pattern from migration 01:
-- firm scope gates read; anon read via valid share_token.

DROP POLICY IF EXISTS "Firm members read design points" ON public.stakeout_design_points;
CREATE POLICY "Firm members read design points"
    ON public.stakeout_design_points FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_design_points.project_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Anon read design points via share token" ON public.stakeout_design_points;
CREATE POLICY "Anon read design points via share token"
    ON public.stakeout_design_points FOR SELECT
    USING (
        auth.uid() IS NULL
        AND EXISTS (
            SELECT 1 FROM public.share_tokens st
            WHERE st.project_id = stakeout_design_points.project_id
              AND st.is_active = TRUE
              AND (st.expires_at IS NULL OR st.expires_at > now())
        )
    );

DROP POLICY IF EXISTS "Office roles manage design points" ON public.stakeout_design_points;
CREATE POLICY "Office roles manage design points"
    ON public.stakeout_design_points FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_design_points.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_design_points.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 13: RLS POLICIES — STAKEOUT ASSIGNMENTS
-- ================================================================
-- Office roles see all firm assignments. Field roles see an
-- assignment when they are its party_chief OR they're on the
-- parent project's assigned_crew uuid[] (per CLAUDE.md).

DROP POLICY IF EXISTS "Office roles read firm assignments" ON public.stakeout_assignments;
CREATE POLICY "Office roles read firm assignments"
    ON public.stakeout_assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_assignments.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );

DROP POLICY IF EXISTS "Field roles read own assignments" ON public.stakeout_assignments;
CREATE POLICY "Field roles read own assignments"
    ON public.stakeout_assignments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_assignments.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('party_chief','field_crew','cad','drafter','technician')
              AND (
                  stakeout_assignments.party_chief_id = auth.uid()
                  OR (p.assigned_to->>'id')::text = auth.uid()::text
                  OR (p.assigned_crew IS NOT NULL AND auth.uid() = ANY(p.assigned_crew))
              )
        )
    );

DROP POLICY IF EXISTS "Office roles manage assignments" ON public.stakeout_assignments;
CREATE POLICY "Office roles manage assignments"
    ON public.stakeout_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_assignments.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = stakeout_assignments.project_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 14: RLS POLICIES — STAKEOUT ASSIGNMENT POINTS
-- ================================================================
-- Inherits visibility from the parent assignment.

DROP POLICY IF EXISTS "Firm members read assignment points" ON public.stakeout_assignment_points;
CREATE POLICY "Firm members read assignment points"
    ON public.stakeout_assignment_points FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_assignment_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND (
                  public.get_my_role() IN ('owner','admin','pm')
                  OR a.party_chief_id = auth.uid()
                  OR (p.assigned_to->>'id')::text = auth.uid()::text
                  OR (p.assigned_crew IS NOT NULL AND auth.uid() = ANY(p.assigned_crew))
              )
        )
    );

DROP POLICY IF EXISTS "Office roles manage assignment points" ON public.stakeout_assignment_points;
CREATE POLICY "Office roles manage assignment points"
    ON public.stakeout_assignment_points FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_assignment_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_assignment_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 15: RLS POLICIES — STAKEOUT QC RUNS
-- ================================================================

DROP POLICY IF EXISTS "Firm members read qc runs" ON public.stakeout_qc_runs;
CREATE POLICY "Firm members read qc runs"
    ON public.stakeout_qc_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_runs.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND (
                  public.get_my_role() IN ('owner','admin','pm')
                  OR stakeout_qc_runs.party_chief_id = auth.uid()
                  OR a.party_chief_id = auth.uid()
                  OR (p.assigned_to->>'id')::text = auth.uid()::text
                  OR (p.assigned_crew IS NOT NULL AND auth.uid() = ANY(p.assigned_crew))
              )
        )
    );

DROP POLICY IF EXISTS "Party chief or office can insert qc runs" ON public.stakeout_qc_runs;
CREATE POLICY "Party chief or office can insert qc runs"
    ON public.stakeout_qc_runs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_runs.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND (
                  public.get_my_role() IN ('owner','admin','pm')
                  OR (a.party_chief_id = auth.uid() AND stakeout_qc_runs.party_chief_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "Office roles update qc runs" ON public.stakeout_qc_runs;
CREATE POLICY "Office roles update qc runs"
    ON public.stakeout_qc_runs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_runs.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );

DROP POLICY IF EXISTS "Office roles delete qc runs" ON public.stakeout_qc_runs;
CREATE POLICY "Office roles delete qc runs"
    ON public.stakeout_qc_runs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_runs.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 16: RLS POLICIES — STAKEOUT QC POINTS
-- ================================================================
-- Party chief may update field_fit_* and built_on_* on their own
-- observations; column-level gating is enforced by the BEFORE
-- UPDATE trigger defined in section 9.6
-- (public.enforce_qc_point_column_protection), which rejects any
-- diff outside the allow-list for non-office callers.

DROP POLICY IF EXISTS "Firm members read qc points" ON public.stakeout_qc_points;
CREATE POLICY "Firm members read qc points"
    ON public.stakeout_qc_points FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND (
                  public.get_my_role() IN ('owner','admin','pm')
                  OR a.party_chief_id = auth.uid()
                  OR (p.assigned_to->>'id')::text = auth.uid()::text
                  OR (p.assigned_crew IS NOT NULL AND auth.uid() = ANY(p.assigned_crew))
              )
        )
    );

DROP POLICY IF EXISTS "Party chief or office can insert qc points" ON public.stakeout_qc_points;
CREATE POLICY "Party chief or office can insert qc points"
    ON public.stakeout_qc_points FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND (
                  public.get_my_role() IN ('owner','admin','pm')
                  OR a.party_chief_id = auth.uid()
              )
        )
    );

DROP POLICY IF EXISTS "Party chief updates own qc points" ON public.stakeout_qc_points;
CREATE POLICY "Party chief updates own qc points"
    ON public.stakeout_qc_points FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_qc_runs r
            JOIN public.stakeout_assignments a ON a.id = r.assignment_id
            JOIN public.projects p ON p.id = a.project_id
            WHERE r.id = stakeout_qc_points.run_id
              AND p.firm_id = public.get_my_firm_id()
              AND r.party_chief_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Office roles update qc points" ON public.stakeout_qc_points;
CREATE POLICY "Office roles update qc points"
    ON public.stakeout_qc_points FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );

DROP POLICY IF EXISTS "Office roles delete qc points" ON public.stakeout_qc_points;
CREATE POLICY "Office roles delete qc points"
    ON public.stakeout_qc_points FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_points.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 17: RLS POLICIES — STAKEOUT QC REPORTS
-- ================================================================

DROP POLICY IF EXISTS "Firm members read qc reports" ON public.stakeout_qc_reports;
CREATE POLICY "Firm members read qc reports"
    ON public.stakeout_qc_reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_reports.assignment_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Firm members can insert qc reports" ON public.stakeout_qc_reports;
CREATE POLICY "Firm members can insert qc reports"
    ON public.stakeout_qc_reports FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_reports.assignment_id
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Office roles update qc reports" ON public.stakeout_qc_reports;
CREATE POLICY "Office roles update qc reports"
    ON public.stakeout_qc_reports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_reports.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );

DROP POLICY IF EXISTS "Office roles delete qc reports" ON public.stakeout_qc_reports;
CREATE POLICY "Office roles delete qc reports"
    ON public.stakeout_qc_reports FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.stakeout_assignments a
            JOIN public.projects p ON p.id = a.project_id
            WHERE a.id = stakeout_qc_reports.assignment_id
              AND p.firm_id = public.get_my_firm_id()
              AND public.get_my_role() IN ('owner','admin','pm')
        )
    );


-- ================================================================
-- SECTION 18: RLS POLICIES — CREW ACCURACY NARRATIVES
-- ================================================================
-- Written by an edge function running with the service_role,
-- which bypasses RLS. No INSERT/UPDATE/DELETE policies are
-- defined for authenticated users — only reads.

DROP POLICY IF EXISTS "Users read own narratives" ON public.crew_accuracy_narratives;
CREATE POLICY "Users read own narratives"
    ON public.crew_accuracy_narratives FOR SELECT
    USING (
        user_id = auth.uid()
        AND firm_id = public.get_my_firm_id()
    );

DROP POLICY IF EXISTS "Office roles read firm narratives" ON public.crew_accuracy_narratives;
CREATE POLICY "Office roles read firm narratives"
    ON public.crew_accuracy_narratives FOR SELECT
    USING (
        firm_id = public.get_my_firm_id()
        AND public.get_my_role() IN ('owner','admin','pm')
    );


-- ================================================================
-- SECTION 19: VIEW — STAKEOUT QC SUMMARY
-- ================================================================
-- Joins design points → assignment points → observations → feature
-- codes, and resolves the effective horizontal tolerance in this
-- priority order:
--   1. observed qc point's stored effective_tolerance_h
--   2. assignment-point override
--   3. design-point override
--   4. assignment default
--   5. feature-code default
--   6. 0.020 fallback
-- Design points with no observation still appear (LEFT JOIN on qc
-- points) so the office can see what was staked vs. what was
-- skipped. Views inherit RLS from the base tables.

DROP VIEW IF EXISTS public.stakeout_qc_summary;
CREATE VIEW public.stakeout_qc_summary AS
SELECT
    a.id                    AS assignment_id,
    a.project_id             AS project_id,
    a.assignment_date        AS assignment_date,
    a.party_chief_id         AS party_chief_id,
    dp.id                    AS design_point_id,
    qp.id                    AS observation_id,
    dp.point_id              AS point_id,
    dp.feature_code          AS design_feature_code,
    dp.feature_description   AS feature_description,
    dp.northing              AS design_n,
    dp.easting               AS design_e,
    dp.elevation             AS design_z,
    qp.observed_northing     AS staked_n,
    qp.observed_easting      AS staked_e,
    qp.observed_elevation    AS staked_z,
    qp.raw_code              AS raw_code,
    qp.parsed_feature        AS parsed_feature,
    qp.declared_offset_distance   AS declared_offset_distance,
    qp.declared_offset_direction  AS declared_offset_direction,
    qp.actual_offset_distance     AS actual_offset_distance,
    qp.actual_offset_direction    AS actual_offset_direction,
    qp.offset_variance            AS offset_variance,
    qp.delta_n                    AS delta_n,
    qp.delta_e                    AS delta_e,
    qp.delta_z                    AS delta_z,
    qp.delta_h                    AS delta_h,
    COALESCE(
        qp.effective_tolerance_h,
        ap.override_tolerance_h,
        dp.tolerance_h_override,
        a.default_tolerance_h,
        fc.default_tolerance_h,
        0.020
    )                             AS effective_tolerance_h,
    qp.h_status                   AS h_status,
    qp.field_fit_reason           AS field_fit_reason,
    qp.field_fit_note             AS field_fit_note,
    qp.built_on_status            AS built_on_status
FROM public.stakeout_assignments a
JOIN public.stakeout_assignment_points ap
    ON ap.assignment_id = a.id
JOIN public.stakeout_design_points dp
    ON dp.id = ap.design_point_id
LEFT JOIN public.stakeout_qc_points qp
    ON qp.assignment_id = a.id
   AND qp.design_point_id = dp.id
LEFT JOIN public.projects proj
    ON proj.id = a.project_id
LEFT JOIN public.feature_codes fc
    ON fc.firm_id = proj.firm_id
   AND fc.code = dp.feature_code;


-- ================================================================
-- SECTION 20: STORAGE — STAKEOUT-REPORTS BUCKET
-- ================================================================
-- Private bucket, 50MB per-file cap. Path convention:
--   stakeout-reports/{project_id}/{filename}
-- Mirrors the project-vault policy structure from migration 05.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('stakeout-reports', 'stakeout-reports', FALSE, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Firm members can read stakeout reports" ON storage.objects;
CREATE POLICY "Firm members can read stakeout reports"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'stakeout-reports'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id::text = (string_to_array(name, '/'))[1]
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Firm members can upload stakeout reports" ON storage.objects;
CREATE POLICY "Firm members can upload stakeout reports"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'stakeout-reports'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id::text = (string_to_array(name, '/'))[1]
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Office roles can update stakeout reports" ON storage.objects;
CREATE POLICY "Office roles can update stakeout reports"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'stakeout-reports'
        AND auth.uid() IS NOT NULL
        AND public.get_my_role() IN ('owner','admin','pm')
        AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id::text = (string_to_array(name, '/'))[1]
              AND p.firm_id = public.get_my_firm_id()
        )
    );

DROP POLICY IF EXISTS "Office roles can delete stakeout reports" ON storage.objects;
CREATE POLICY "Office roles can delete stakeout reports"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'stakeout-reports'
        AND auth.uid() IS NOT NULL
        AND public.get_my_role() IN ('owner','admin','pm')
        AND EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id::text = (string_to_array(name, '/'))[1]
              AND p.firm_id = public.get_my_firm_id()
        )
    );


-- ================================================================
-- SECTION 21: PERMISSIONS MATRIX UPDATES
-- ================================================================
-- Append rows for the new Stakeout QC resources. Action vocabulary:
-- create, read, update, delete, export, reconcile. Scope '{}' for
-- office roles (firm-wide authority); '{"scope": "assigned"}' for
-- party_chief on qc_runs and qc_points.

INSERT INTO public.permissions (role, resource, action, conditions) VALUES
    -- ── FEATURE CODES ──
    ('owner',       'feature_codes',             'create',    '{}'),
    ('owner',       'feature_codes',             'read',      '{}'),
    ('owner',       'feature_codes',             'update',    '{}'),
    ('owner',       'feature_codes',             'delete',    '{}'),
    ('admin',       'feature_codes',             'create',    '{}'),
    ('admin',       'feature_codes',             'read',      '{}'),
    ('admin',       'feature_codes',             'update',    '{}'),
    ('admin',       'feature_codes',             'delete',    '{}'),
    ('pm',          'feature_codes',             'create',    '{}'),
    ('pm',          'feature_codes',             'read',      '{}'),
    ('pm',          'feature_codes',             'update',    '{}'),
    ('pm',          'feature_codes',             'delete',    '{}'),
    ('party_chief', 'feature_codes',             'read',      '{}'),
    ('field_crew',  'feature_codes',             'read',      '{}'),

    -- ── STAKEOUT DESIGN POINTS ──
    ('owner',       'stakeout_design_points',    'create',    '{}'),
    ('owner',       'stakeout_design_points',    'read',      '{}'),
    ('owner',       'stakeout_design_points',    'update',    '{}'),
    ('owner',       'stakeout_design_points',    'delete',    '{}'),
    ('admin',       'stakeout_design_points',    'create',    '{}'),
    ('admin',       'stakeout_design_points',    'read',      '{}'),
    ('admin',       'stakeout_design_points',    'update',    '{}'),
    ('admin',       'stakeout_design_points',    'delete',    '{}'),
    ('pm',          'stakeout_design_points',    'create',    '{}'),
    ('pm',          'stakeout_design_points',    'read',      '{}'),
    ('pm',          'stakeout_design_points',    'update',    '{}'),
    ('pm',          'stakeout_design_points',    'delete',    '{}'),
    ('party_chief', 'stakeout_design_points',    'read',      '{"scope": "assigned"}'),
    ('field_crew',  'stakeout_design_points',    'read',      '{"scope": "assigned"}'),

    -- ── STAKEOUT ASSIGNMENTS ──
    ('owner',       'stakeout_assignments',      'create',    '{}'),
    ('owner',       'stakeout_assignments',      'read',      '{}'),
    ('owner',       'stakeout_assignments',      'update',    '{}'),
    ('owner',       'stakeout_assignments',      'delete',    '{}'),
    ('admin',       'stakeout_assignments',      'create',    '{}'),
    ('admin',       'stakeout_assignments',      'read',      '{}'),
    ('admin',       'stakeout_assignments',      'update',    '{}'),
    ('admin',       'stakeout_assignments',      'delete',    '{}'),
    ('pm',          'stakeout_assignments',      'create',    '{}'),
    ('pm',          'stakeout_assignments',      'read',      '{}'),
    ('pm',          'stakeout_assignments',      'update',    '{}'),
    ('pm',          'stakeout_assignments',      'delete',    '{}'),
    ('party_chief', 'stakeout_assignments',      'read',      '{"scope": "assigned"}'),
    ('field_crew',  'stakeout_assignments',      'read',      '{"scope": "assigned"}'),

    -- ── STAKEOUT QC RUNS ──
    ('owner',       'stakeout_qc_runs',          'read',      '{}'),
    ('owner',       'stakeout_qc_runs',          'update',    '{}'),
    ('owner',       'stakeout_qc_runs',          'delete',    '{}'),
    ('owner',       'stakeout_qc_runs',          'reconcile', '{}'),
    ('admin',       'stakeout_qc_runs',          'read',      '{}'),
    ('admin',       'stakeout_qc_runs',          'update',    '{}'),
    ('admin',       'stakeout_qc_runs',          'delete',    '{}'),
    ('admin',       'stakeout_qc_runs',          'reconcile', '{}'),
    ('pm',          'stakeout_qc_runs',          'read',      '{}'),
    ('pm',          'stakeout_qc_runs',          'update',    '{}'),
    ('pm',          'stakeout_qc_runs',          'delete',    '{}'),
    ('pm',          'stakeout_qc_runs',          'reconcile', '{}'),
    ('party_chief', 'stakeout_qc_runs',          'create',    '{"scope": "assigned"}'),
    ('party_chief', 'stakeout_qc_runs',          'read',      '{"scope": "assigned"}'),

    -- ── STAKEOUT QC POINTS ──
    ('owner',       'stakeout_qc_points',        'read',      '{}'),
    ('owner',       'stakeout_qc_points',        'update',    '{}'),
    ('owner',       'stakeout_qc_points',        'delete',    '{}'),
    ('admin',       'stakeout_qc_points',        'read',      '{}'),
    ('admin',       'stakeout_qc_points',        'update',    '{}'),
    ('admin',       'stakeout_qc_points',        'delete',    '{}'),
    ('pm',          'stakeout_qc_points',        'read',      '{}'),
    ('pm',          'stakeout_qc_points',        'update',    '{}'),
    ('pm',          'stakeout_qc_points',        'delete',    '{}'),
    ('party_chief', 'stakeout_qc_points',        'create',    '{"scope": "assigned"}'),
    ('party_chief', 'stakeout_qc_points',        'read',      '{"scope": "assigned"}'),
    ('party_chief', 'stakeout_qc_points',        'update',    '{"scope": "assigned"}'),

    -- ── STAKEOUT QC REPORTS ──
    ('owner',       'stakeout_qc_reports',       'read',      '{}'),
    ('owner',       'stakeout_qc_reports',       'export',    '{}'),
    ('owner',       'stakeout_qc_reports',       'delete',    '{}'),
    ('admin',       'stakeout_qc_reports',       'read',      '{}'),
    ('admin',       'stakeout_qc_reports',       'export',    '{}'),
    ('admin',       'stakeout_qc_reports',       'delete',    '{}'),
    ('pm',          'stakeout_qc_reports',       'read',      '{}'),
    ('pm',          'stakeout_qc_reports',       'export',    '{}'),
    ('pm',          'stakeout_qc_reports',       'delete',    '{}'),
    ('party_chief', 'stakeout_qc_reports',       'read',      '{"scope": "assigned"}'),
    ('party_chief', 'stakeout_qc_reports',       'export',    '{"scope": "assigned"}'),

    -- ── CREW ACCURACY NARRATIVES ──
    ('owner',       'crew_accuracy_narratives',  'read',      '{}'),
    ('admin',       'crew_accuracy_narratives',  'read',      '{}'),
    ('pm',          'crew_accuracy_narratives',  'read',      '{}'),
    ('party_chief', 'crew_accuracy_narratives',  'read',      '{"scope": "self"}')
ON CONFLICT (role, resource, action) DO NOTHING;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify the migration:
--
-- SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (tablename LIKE 'stakeout%'
--          OR tablename IN ('feature_codes','crew_accuracy_narratives'))
--   ORDER BY tablename, policyname;
--
-- SELECT firm_id, code, feature_type
--   FROM public.feature_codes
--   ORDER BY firm_id, code;
--
-- SELECT role, resource, action
--   FROM public.permissions
--   WHERE resource IN (
--     'feature_codes','stakeout_design_points','stakeout_assignments',
--     'stakeout_qc_runs','stakeout_qc_points','stakeout_qc_reports',
--     'crew_accuracy_narratives'
--   )
--   ORDER BY resource, role, action;

COMMIT;
