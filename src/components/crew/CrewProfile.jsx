import React from 'react';

export default function CrewProfile({ user, userProfile, onSignOut }) {
    const fullName = [userProfile?.first_name, userProfile?.last_name]
        .filter(Boolean)
        .join(' ') || 'Crew member';
    return (
        <div style={{ padding: '20px', color: 'var(--text-main)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>{fullName}</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
                {userProfile?.role || 'crew'} · {user?.email || ''}
            </div>
            <button
                onClick={onSignOut}
                style={{
                    width: '100%',
                    minHeight: '52px',
                    background: 'transparent',
                    color: 'var(--error)',
                    border: '1px solid var(--error)',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                Sign out
            </button>
        </div>
    );
}
