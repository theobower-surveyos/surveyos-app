import React from 'react';

export default function CrewUpcoming({ user, userProfile }) {
    return (
        <div style={{ padding: '20px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Upcoming</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Future assignments land in Stage 9.3.
            </p>
        </div>
    );
}
