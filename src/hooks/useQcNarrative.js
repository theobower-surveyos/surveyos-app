import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { regenerateNarrative } from '../lib/qcNarrative';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 16; // ~40s total; generation typically completes in 3-8s

// ─── useQcNarrative ───────────────────────────────────────────────────
// Fetch the narrative for a given run, polling while the row hasn't
// landed yet. Stops polling when a row appears (success OR error
// stored) or after MAX_POLL_ATTEMPTS.
//
// Stage 11.2 adds regenerate(): invokes the Edge Function awaited,
// then restarts polling. The polling tick treats a row as "new"
// only when generated_at differs from the previously-known value,
// so the upsert in the Edge Function (which overwrites the row in
// place) is detected correctly.

export function useQcNarrative({ runId, narrativeType = 'run_summary' }) {
    const [narrative, setNarrative] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const intervalRef = useRef(null);
    const pollAttemptsRef = useRef(0);
    // Tracks the generated_at of the narrative we're trying to
    // supersede during a regenerate; null means "any narrative wins."
    const supersedingRef = useRef(null);

    const fetchNarrative = useCallback(async () => {
        if (!runId) return null;
        const { data, error: fetchErr } = await supabase
            .from('stakeout_qc_narratives')
            .select('*')
            .eq('run_id', runId)
            .eq('narrative_type', narrativeType)
            .maybeSingle();
        if (fetchErr) {
            setError(fetchErr.message);
            return null;
        }
        return data;
    }, [runId, narrativeType]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();
        pollAttemptsRef.current = 0;

        const tick = async () => {
            const data = await fetchNarrative();
            if (data) {
                // During a regenerate, only accept a row whose
                // generated_at differs from the value we are
                // trying to supersede.
                const sup = supersedingRef.current;
                const isFresh = !sup || (data.generated_at && data.generated_at !== sup);
                if (isFresh) {
                    setNarrative(data);
                    setLoading(false);
                    supersedingRef.current = null;
                    stopPolling();
                    return;
                }
            }
            pollAttemptsRef.current += 1;
            if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
                setLoading(false);
                stopPolling();
            }
        };

        // Run once immediately to avoid waiting one full interval.
        tick();
        intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
    }, [fetchNarrative, stopPolling]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        supersedingRef.current = null;
        startPolling();
    }, [startPolling]);

    const regenerate = useCallback(async () => {
        // Capture the row currently on screen so the polling tick
        // can recognise the upserted replacement by its newer
        // generated_at value.
        supersedingRef.current = narrative?.generated_at ?? null;
        setLoading(true);
        setError(null);
        const result = await regenerateNarrative({ runId, narrativeType });
        if (!result.ok) {
            setError(result.error || 'Regeneration failed');
            setLoading(false);
            supersedingRef.current = null;
            return;
        }
        // Edge Function may take a few seconds to land the row;
        // restart polling and let the tick swap state.
        startPolling();
    }, [runId, narrativeType, narrative, startPolling]);

    useEffect(() => {
        if (!runId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setNarrative(null);
        setError(null);
        supersedingRef.current = null;
        startPolling();
        return () => {
            stopPolling();
        };
    }, [runId, narrativeType, startPolling, stopPolling]);

    return { narrative, loading, error, refresh, regenerate };
}
