import React from 'react';

export default function CrewToday({ user, userProfile }) {
    return (
        <div style={{ padding: '20px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Today's work</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Assignments list lands in Stage 9.2.
            </p>
        </div>
    );
}
