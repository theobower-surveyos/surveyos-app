import { supabase } from '../supabaseClient';

// ─── qcNarrative ──────────────────────────────────────────────────────
// Two entry points wrapping the generate-qc-narrative Edge Function:
//
//   • triggerNarrativeGeneration — fire-and-forget. Used by
//     sosProcessRun.js after a successful run insert; the chief's
//     submit flow must not wait on Anthropic.
//
//   • regenerateNarrative — awaited. Used by the Stage 11.2 manual
//     regenerate button (PM-side) and the error-state retry button
//     (chief-side). Returns { ok, error? } so the caller can react.
//
// In both cases the Edge Function persists generation failures to
// stakeout_qc_narratives.error so the polling hook surfaces a
// "summary unavailable" state rather than spinning forever.

export function triggerNarrativeGeneration({ runId, narrativeType = 'run_summary' }) {
    if (!runId) return;
    invokeNarrativeFunction({ runId, narrativeType }).catch((err) => {
        console.warn('[qcNarrative] fire-and-forget invoke threw:', err?.message || err);
    });
}

export async function regenerateNarrative({ runId, narrativeType = 'run_summary' }) {
    if (!runId) return { ok: false, error: 'No run id' };
    try {
        const result = await invokeNarrativeFunction({ runId, narrativeType });
        if (result?.error) {
            return { ok: false, error: result.error.message || String(result.error) };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err?.message || 'Unknown error' };
    }
}

async function invokeNarrativeFunction({ runId, narrativeType }) {
    return await supabase.functions.invoke('generate-qc-narrative', {
        body: { run_id: runId, narrative_type: narrativeType },
    });
}
