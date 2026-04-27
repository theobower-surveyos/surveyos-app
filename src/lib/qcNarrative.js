import { supabase } from '../supabaseClient';

// ─── qcNarrative ──────────────────────────────────────────────────────
// Frontend wrapper for the generate-qc-narrative Edge Function. Used
// by sosProcessRun.js after a successful QC run insert and (in
// Stage 11.2) by a regenerate button on the narrative block.
//
// Fire-and-forget by design — the chief's submit flow must not wait
// on Anthropic. Errors are logged to the console but never thrown;
// the Edge Function persists generation failures into
// stakeout_qc_narratives.error so the polling hook can surface a
// "summary unavailable" state to the PM.

export function triggerNarrativeGeneration({ runId, narrativeType = 'run_summary' }) {
    if (!runId) return;

    supabase.functions
        .invoke('generate-qc-narrative', {
            body: { run_id: runId, narrative_type: narrativeType },
        })
        .then((result) => {
            if (result.error) {
                console.warn('[qcNarrative] generation failed:', result.error);
            }
        })
        .catch((err) => {
            console.warn('[qcNarrative] invoke threw:', err);
        });
}
