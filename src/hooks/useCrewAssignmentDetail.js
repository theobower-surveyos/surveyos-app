import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─── useCrewAssignmentDetail ──────────────────────────────────────────
// Fetches a single stakeout_assignment with its project and (via the
// assignment_points join) its design points flattened into the shape
// DesignPointsPlanView expects. Exposes refresh() so the detail screen
// can refetch after a status transition without re-mounting.

export function useCrewAssignmentDetail({ assignmentId }) {
    const [assignment, setAssignment] = useState(null);
    const [designPoints, setDesignPoints] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!assignmentId) return;
        setLoading(true);
        setError(null);

        const { data: aData, error: aError } = await supabase
            .from('stakeout_assignments')
            .select(`
                id, title, assignment_date, status, notes,
                expected_hours, default_tolerance_h, default_tolerance_v,
                sent_at, submitted_at, reconciled_at,
                client_contact_name, client_contact_phone,
                client_contact_role, client_contact_notes,
                project:projects (
                    id, project_name, location, client_name
                )
            `)
            .eq('id', assignmentId)
            .maybeSingle();

        if (aError) {
            setError(aError.message);
            setLoading(false);
            return;
        }
        setAssignment(aData);

        const { data: pData, error: pError } = await supabase
            .from('stakeout_assignment_points')
            .select(`
                sort_order,
                override_tolerance_h,
                override_tolerance_v,
                design_point:stakeout_design_points (
                    id, point_id, feature_code,
                    northing, easting, elevation
                )
            `)
            .eq('assignment_id', assignmentId)
            .order('sort_order');

        if (pError) {
            setError(pError.message);
            setLoading(false);
            return;
        }
        const flattened = (pData || [])
            .map((ap) => ap.design_point)
            .filter(Boolean);
        setDesignPoints(flattened);
        setLoading(false);
    }, [assignmentId]);

    useEffect(() => {
        load();
    }, [load]);

    return { assignment, designPoints, error, loading, refresh: load };
}
