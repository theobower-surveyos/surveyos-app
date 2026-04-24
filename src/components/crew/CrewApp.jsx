import React, { useState } from 'react';
import CrewToday from './CrewToday.jsx';
import CrewUpcoming from './CrewUpcoming.jsx';
import CrewProfile from './CrewProfile.jsx';
import CrewAssignmentDetail from './CrewAssignmentDetail.jsx';

// ─── CrewApp ──────────────────────────────────────────────────────────
// Mobile-first shell for field_crew and party_chief users. Three-tab
// layout: Today / Upcoming / Profile. Header carries brand + avatar
// (tap → Profile). Bottom nav is sticky and respects iPhone safe-area
// insets via env(safe-area-inset-*). Viewport-fit=cover is set in
// index.html so those inset variables resolve to non-zero on notched
// devices.
//
// Routing to this component is purely role-based (see App.jsx). A
// crew user on a desktop browser still lands here — intentional,
// their workflow is field-first regardless of the screen they happen
// to be looking at.

const TABS = [
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'profile', label: 'Profile' },
];

export default function CrewApp({ user, userProfile, onSignOut }) {
    const [activeTab, setActiveTab] = useState('today');
    // When non-null, the content area renders CrewAssignmentDetail
    // instead of the active tab's component. Bottom nav stays visible —
    // tapping a tab clears the detail AND switches tabs.
    const [detailAssignmentId, setDetailAssignmentId] = useState(null);

    const firstInitial =
        (userProfile?.first_name?.[0] || user?.email?.[0] || '?').toUpperCase();

    function handleAssignmentTap(a) {
        setDetailAssignmentId(a.id);
    }

    function handleBackFromDetail() {
        setDetailAssignmentId(null);
    }

    function handleTabChange(tab) {
        setDetailAssignmentId(null);
        setActiveTab(tab);
    }

    function renderContent() {
        if (detailAssignmentId) {
            return (
                <CrewAssignmentDetail
                    assignmentId={detailAssignmentId}
                    onBack={handleBackFromDetail}
                />
            );
        }
        if (activeTab === 'upcoming') {
            return (
                <CrewUpcoming
                    user={user}
                    userProfile={userProfile}
                    onAssignmentTap={handleAssignmentTap}
                />
            );
        }
        if (activeTab === 'profile') {
            return (
                <CrewProfile
                    user={user}
                    userProfile={userProfile}
                    onSignOut={onSignOut}
                />
            );
        }
        return (
            <CrewToday
                user={user}
                userProfile={userProfile}
                onAssignmentTap={handleAssignmentTap}
            />
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                background: 'var(--bg-dark)',
                color: 'var(--text-main)',
                fontFamily: 'Inter, sans-serif',
            }}
        >
            {/* ── Header ───────────────────────────────────────── */}
            <header
                style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '52px',
                    paddingLeft: '16px',
                    paddingRight: '16px',
                    paddingTop: 'env(safe-area-inset-top)',
                    background: 'var(--bg-surface)',
                    borderBottom: '1px solid var(--border-subtle)',
                    boxSizing: 'content-box',
                }}
            >
                <span
                    style={{
                        color: 'var(--brand-teal-light)',
                        fontSize: '16px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                    }}
                >
                    SurveyOS
                </span>
                <button
                    type="button"
                    onClick={() => handleTabChange('profile')}
                    aria-label="Open profile"
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--brand-teal)',
                        color: '#fff',
                        border: 'none',
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {firstInitial}
                </button>
            </header>

            {/* ── Content ──────────────────────────────────────── */}
            <main
                style={{
                    flex: '1 1 auto',
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    minHeight: 0,
                }}
            >
                {renderContent()}
            </main>

            {/* ── Bottom nav ───────────────────────────────────── */}
            <nav
                style={{
                    flex: '0 0 auto',
                    position: 'sticky',
                    bottom: 0,
                    display: 'flex',
                    background: 'var(--bg-surface)',
                    borderTop: '1px solid var(--border-subtle)',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                {TABS.map((tab) => {
                    const isActive = !detailAssignmentId && activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => handleTabChange(tab.key)}
                            style={{
                                flex: 1,
                                minHeight: '64px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: 'none',
                                borderTop: isActive
                                    ? '2px solid var(--brand-teal-light)'
                                    : '2px solid transparent',
                                color: isActive
                                    ? 'var(--brand-teal-light)'
                                    : 'var(--text-muted)',
                                fontSize: '13px',
                                fontWeight: 600,
                                letterSpacing: '0.3px',
                                cursor: 'pointer',
                                padding: '8px 4px',
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
