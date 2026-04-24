import React from 'react';
import { useCrewAssignments } from '../../hooks/useCrewAssignments';
import AssignmentCard from './AssignmentCard.jsx';

// ─── CrewUpcoming ─────────────────────────────────────────────────────
// Assignments scheduled AFTER today where the user is the party chief
// and status is not yet 'reconciled'. Sorted ascending so the closest
// future date surfaces first.

export default function CrewUpcoming({ user, userProfile, onAssignmentTap }) {
    const { assignments, error, loading } = useCrewAssignments({
        userId: userProfile?.id,
        filter: 'upcoming',
    });

    return (
        <div style={{ padding: '20px 16px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 600 }}>
                Upcoming
            </h2>

            {loading && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
                    Loading…
                </div>
            )}

            {!loading && assignments && assignments.length === 0 && !error && (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', padding: '40px 16px', textAlign: 'center' }}>
                    Nothing scheduled past today.
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
