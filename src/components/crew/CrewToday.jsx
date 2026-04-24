import React from 'react';
import { useCrewAssignments } from '../../hooks/useCrewAssignments';
import AssignmentCard from './AssignmentCard.jsx';

// ─── CrewToday ────────────────────────────────────────────────────────
// Lists assignments where the signed-in user is the party_chief,
// assignment_date is TODAY OR EARLIER, and status is not yet
// 'reconciled'. The "and prior" inclusion catches overdue work so
// chiefs don't lose yesterday's assignment if it slipped. Fetch logic
// lives in useCrewAssignments so CrewUpcoming can share it.

export default function CrewToday({ user, userProfile, onAssignmentTap }) {
    const { assignments, error, loading } = useCrewAssignments({
        userId: userProfile?.id,
        filter: 'today_and_prior',
    });

    return (
        <div style={{ padding: '20px 16px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 600 }}>
                Today's work
            </h2>

            {loading && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                    Loading…
                </div>
            )}

            {!loading && assignments && assignments.length === 0 && !error && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 16px', textAlign: 'center' }}>
                    No assignments scheduled for today or earlier. Check the Upcoming tab for future work.
                </div>
            )}

            {error && (
                <div style={errorStyle}>
                    Couldn't load assignments: {error}
                </div>
            )}

            {assignments && assignments.length > 0 && assignments.map((a) => (
                <AssignmentCard key={a.id} assignment={a} onTap={onAssignmentTap} />
            ))}
        </div>
    );
}

const errorStyle = {
    color: 'var(--error)',
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.40)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '13px',
    marginBottom: '16px',
};
