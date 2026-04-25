import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─── useCrewQcRun ─────────────────────────────────────────────────────
// Fetches the latest stakeout_qc_runs row for an assignment and that
// run's stakeout_qc_points. Exposes refresh() so the scoreboard can
// re-fetch after a field-fit update without re-mounting.
//
// Why "latest run only" rather than all observations across all runs:
// processRun() in Stage 10.2 deletes prior runs on every upload, so
// only one run per assignment ever exists in steady state. The
// ordering is defensive — if a future change preserves history, we
// still surface the most recent.

export function useCrewQcRun({ assignmentId }) {
    const [run, setRun] = useState(null);
    const [points, setPoints] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!assignmentId) return;
        setLoading(true);
        setError(null);

        const { data: runs, error: rError } = await supabase
            .from('stakeout_qc_runs')
            .select('*')
            .eq('assignment_id', assignmentId)
            .order('submitted_at', { ascending: false })
            .limit(1);

        if (rError) {
            setError(rError.message);
            setLoading(false);
            return;
        }

        if (!runs || runs.length === 0) {
            setRun(null);
            setPoints([]);
            setLoading(false);
            return;
        }

        const latestRun = runs[0];
        setRun(latestRun);

        const { data: ptsData, error: pError } = await supabase
            .from('stakeout_qc_points')
            .select('*')
            .eq('run_id', latestRun.id)
            .order('shot_type', { ascending: true })
            .order('observed_point_id', { ascending: true });

        if (pError) {
            setError(pError.message);
            setLoading(false);
            return;
        }

        setPoints(ptsData || []);
        setLoading(false);
    }, [assignmentId]);

    useEffect(() => {
        load();
    }, [load]);

    return { run, points, loading, error, refresh: load };
}
