-- ================================================================
-- SurveyOS Migration 18: Stakeout QC narratives
-- ================================================================
-- Stage 11.1: storage for Claude-generated natural-language summaries
-- of QC runs. The frontend (sosProcessRun.js) fires a fire-and-forget
-- invocation of the generate-qc-narrative Edge Function after every
-- successful upload; that function fetches run context, calls the
-- Anthropic API, and upserts the result here.
--
-- One row per (run_id, narrative_type). Re-generation overwrites in
-- place via the UNIQUE constraint upsert. Stage 11.2 will add a
-- regenerate UI that targets the same row.
--
-- The error column lets us persist failed generations so the PM sees
-- something happened ("summary unavailable: <reason>") instead of an
-- indefinite spinner. body+error are mutually exclusive in successful
-- writes — body populated on success, error populated on failure.
--
-- RLS mirrors stakeout_qc_runs: office roles see all firm rows,
-- chiefs see narratives for runs on assignments they own. Inserts
-- by chief are permitted because the Edge Function executes under
-- the caller's JWT (so the chief role inserts after their own
-- upload).
-- ================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.stakeout_qc_narratives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES public.stakeout_qc_runs(id) ON DELETE CASCADE,
    narrative_type  TEXT NOT NULL DEFAULT 'run_summary',
    body            TEXT,
    model           TEXT,
    prompt_version  TEXT,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    error           TEXT,

    CONSTRAINT valid_narrative_type CHECK (
        narrative_type IN ('run_summary', 'no_match_summary')
    ),

    CONSTRAINT one_narrative_per_run_and_type UNIQUE (run_id, narrative_type)
);

CREATE INDEX IF NOT EXISTS idx_qc_narratives_run_id
    ON public.stakeout_qc_narratives(run_id);

COMMENT ON TABLE public.stakeout_qc_narratives IS
    'Claude-generated natural-language summaries of QC runs. One row per (run_id, narrative_type) — re-generation overwrites via UNIQUE constraint upsert.';

COMMENT ON COLUMN public.stakeout_qc_narratives.body IS
    'The narrative text itself, ~80-150 words. NULL if generation failed (see error column).';

COMMENT ON COLUMN public.stakeout_qc_narratives.error IS
    'Error message if generation failed. NULL on success. Allows retry via Stage 11.2 regenerate UI.';

COMMENT ON COLUMN public.stakeout_qc_narratives.prompt_version IS
    'Prompt template version (e.g., "v1"). Increment when prompt template changes; allows targeted regeneration of stale narratives.';


-- ── ROW LEVEL SECURITY ──────────────────────────────────────────
ALTER TABLE public.stakeout_qc_narratives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office roles full access on qc_narratives"
    ON public.stakeout_qc_narratives;
CREATE POLICY "Office roles full access on qc_narratives"
    ON public.stakeout_qc_narratives
    FOR ALL
    TO authenticated
    USING (
        public.get_my_role() = ANY (ARRAY['owner', 'admin', 'pm'])
    )
    WITH CHECK (
        public.get_my_role() = ANY (ARRAY['owner', 'admin', 'pm'])
    );

DROP POLICY IF EXISTS "Chief reads own assignment narratives"
    ON public.stakeout_qc_narratives;
CREATE POLICY "Chief reads own assignment narratives"
    ON public.stakeout_qc_narratives
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.stakeout_qc_runs r
            JOIN public.stakeout_assignments a ON a.id = r.assignment_id
            WHERE r.id = stakeout_qc_narratives.run_id
              AND a.party_chief_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Chief inserts narratives for own runs"
    ON public.stakeout_qc_narratives;
CREATE POLICY "Chief inserts narratives for own runs"
    ON public.stakeout_qc_narratives
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.stakeout_qc_runs r
            JOIN public.stakeout_assignments a ON a.id = r.assignment_id
            WHERE r.id = stakeout_qc_narratives.run_id
              AND a.party_chief_id = auth.uid()
        )
    );

-- Chief also needs UPDATE permission so the Edge Function's upsert
-- (ON CONFLICT DO UPDATE) can overwrite an existing row. Without
-- this, the second upload from a chief would fail when the
-- narrative row already exists and the upsert tries to update.
DROP POLICY IF EXISTS "Chief updates own assignment narratives"
    ON public.stakeout_qc_narratives;
CREATE POLICY "Chief updates own assignment narratives"
    ON public.stakeout_qc_narratives
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.stakeout_qc_runs r
            JOIN public.stakeout_assignments a ON a.id = r.assignment_id
            WHERE r.id = stakeout_qc_narratives.run_id
              AND a.party_chief_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.stakeout_qc_runs r
            JOIN public.stakeout_assignments a ON a.id = r.assignment_id
            WHERE r.id = stakeout_qc_narratives.run_id
              AND a.party_chief_id = auth.uid()
        )
    );

COMMIT;


-- ================================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ================================================================
-- Uncomment and run these to verify:
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'stakeout_qc_narratives'
--   ORDER BY ordinal_position;
--
-- SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename = 'stakeout_qc_narratives';
