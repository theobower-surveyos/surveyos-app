import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import AssignmentCard from './AssignmentCard.jsx';

// ─── CrewToday ────────────────────────────────────────────────────────
// Filter rule: assignments where the signed-in user is the party_chief,
// assignment_date is TODAY OR EARLIER, and status is not yet
// 'reconciled'. The "and prior" inclusion catches overdue work so
// chiefs don't lose yesterday's assignment if it slipped. Sort by
// assignment_date descending so today appears first, then yesterday,
// etc.

export default function CrewToday({ user, userProfile, onAssignmentTap }) {
    // null = still loading; [] = empty after fetch; [...] = populated
    const [assignments, setAssignments] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!userProfile?.id) return;
        let cancelled = false;

        async function load() {
            setError(null);
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

            const { data, error: queryError } = await supabase
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
                .eq('party_chief_id', userProfile.id)
                .lte('assignment_date', today)
                .neq('status', 'reconciled')
                .order('assignment_date', { ascending: false });

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
    }, [userProfile?.id]);

    return (
        <div style={{ padding: '20px 16px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 600 }}>
                Today's work
            </h2>

            {assignments === null && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                    Loading…
                </div>
            )}

            {error && (
                <div style={{
                    color: 'var(--error)',
                    background: 'rgba(220, 38, 38, 0.10)',
                    border: '1px solid rgba(220, 38, 38, 0.40)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '13px',
                    marginBottom: '16px',
                }}>
                    Couldn't load assignments: {error}
                </div>
            )}

            {assignments !== null && assignments.length === 0 && !error && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 16px', textAlign: 'center' }}>
                    No assignments scheduled for today or earlier. Check the Upcoming tab for future work.
                </div>
            )}

            {assignments && assignments.length > 0 && assignments.map((a) => (
                <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onTap={onAssignmentTap}
                />
            ))}
        </div>
    );
}
