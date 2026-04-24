import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─── useCrewAssignments ───────────────────────────────────────────────
// Fetch stakeout_assignments where the current user is the party_chief,
// filtered by date mode and excluding already-reconciled work.
//
// @param {object} params
// @param {string} params.userId  user_profiles.id of the party chief
// @param {'today_and_prior'|'upcoming'} params.filter  date filter mode
//   - 'today_and_prior': assignment_date <= today, NOT reconciled
//   - 'upcoming':         assignment_date > today,  NOT reconciled
// @returns {{ assignments: Array|null, error: string|null, loading: boolean }}
//
// `loading` is derived from state instead of tracked separately —
// assignments === null AND no error means the fetch is in flight. This
// keeps the hook honest about its three states (loading / data / error)
// without a stale useState pair.
export function useCrewAssignments({ userId, filter }) {
    const [assignments, setAssignments] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;

        async function load() {
            setError(null);
            const today = new Date().toISOString().slice(0, 10);

            let query = supabase
                .from('stakeout_assignments')
                .select(`
                    id,
                    title,
                    assignment_date,
                    status,
                    notes,
                    expected_hours,
                    default_tolerance_h,
                    default_tolerance_v,
                    project:projects (
                        id,
                        project_name,
                        location,
                        client_name
                    ),
                    points:stakeout_assignment_points (id)
                `)
                .eq('party_chief_id', userId)
                .neq('status', 'reconciled');

            if (filter === 'today_and_prior') {
                query = query
                    .lte('assignment_date', today)
                    .order('assignment_date', { ascending: false });
            } else if (filter === 'upcoming') {
                query = query
                    .gt('assignment_date', today)
                    .order('assignment_date', { ascending: true });
            } else {
                if (!cancelled) setError(`Unknown filter: ${filter}`);
                return;
            }

            const { data, error: queryError } = await query;
            if (cancelled) return;
            if (queryError) {
                setError(queryError.message);
                setAssignments([]);
                return;
            }
            const enriched = (data || []).map((a) => ({
                ...a,
                point_count: a.points?.length ?? 0,
            }));
            setAssignments(enriched);
        }

        load();
        return () => { cancelled = true; };
    }, [userId, filter]);

    return { assignments, error, loading: assignments === null && !error };
}
