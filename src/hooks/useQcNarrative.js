import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 16; // ~40s total; generation typically completes in 3-8s

// ─── useQcNarrative ───────────────────────────────────────────────────
// Fetch the narrative for a given run, polling while the row hasn't
// landed yet. Stops polling when the row appears (success OR error
// stored) or after MAX_POLL_ATTEMPTS.
//
// Stage 11.1 keeps the contract simple: { narrative, loading, error,
// refresh }. Stage 11.2 will hang a regenerate-button onto refresh.

export function useQcNarrative({ runId, narrativeType = 'run_summary' }) {
    const [narrative, setNarrative] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const pollAttemptsRef = useRef(0);
    const intervalRef = useRef(null);

    const fetchNarrative = useCallback(async () => {
        if (!runId) {
            setLoading(false);
            return null;
        }

        const { data, error: fetchErr } = await supabase
            .from('stakeout_qc_narratives')
            .select('*')
            .eq('run_id', runId)
            .eq('narrative_type', narrativeType)
            .maybeSingle();

        if (fetchErr) {
            setError(fetchErr.message);
            setLoading(false);
            return null;
        }

        return data;
    }, [runId, narrativeType]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        pollAttemptsRef.current = 0;
        const data = await fetchNarrative();
        setNarrative(data);
        setLoading(false);
        return data;
    }, [fetchNarrative]);

    useEffect(() => {
        if (!runId) return;

        let cancelled = false;
        pollAttemptsRef.current = 0;
        setLoading(true);
        setNarrative(null);

        async function tick() {
            if (cancelled) return;
            const data = await fetchNarrative();
            if (cancelled) return;

            if (data) {
                setNarrative(data);
                setLoading(false);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                return;
            }

            pollAttemptsRef.current += 1;
            if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
                setLoading(false);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }
        }

        // Initial fetch immediately, then poll until landed or exhausted.
        tick();
        intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [runId, fetchNarrative]);

    return { narrative, loading, error, refresh };
}
