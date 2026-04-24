import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─── useCrewAssignmentDetail ──────────────────────────────────────────
// Fetches a single stakeout_assignment with its project. Exposes
// refresh() so the detail screen can refetch after a status transition
// or checklist update without re-mounting.
//
// Stage 9.4b: dropped the design-points fetch. Chiefs navigate with
// Trimble Access on the data collector — the SurveyOS plan view added
// noise without field value. A PDF attachment area will replace it in
// a future stage.

export function useCrewAssignmentDetail({ assignmentId }) {
    const [assignment, setAssignment] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!assignmentId) return;
        setLoading(true);
        setError(null);

        const { data, error: qError } = await supabase
            .from('stakeout_assignments')
            .select(`
                id, title, assignment_date, status, notes,
                expected_hours, default_tolerance_h, default_tolerance_v,
                sent_at, submitted_at, reconciled_at,
                client_contact_name, client_contact_phone,
                client_contact_role, client_contact_notes,
                scope_checklist, chief_field_notes,
                project:projects (
                    id, project_name, location, client_name
                )
            `)
            .eq('id', assignmentId)
            .maybeSingle();

        if (qError) {
            setError(qError.message);
            setLoading(false);
            return;
        }
        setAssignment(data);
        setLoading(false);
    }, [assignmentId]);

    useEffect(() => {
        load();
    }, [load]);

    return { assignment, error, loading, refresh: load };
}
