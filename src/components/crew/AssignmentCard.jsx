import React from 'react';

const STATUS_COLORS = {
    draft:       { bg: 'rgba(148, 163, 184, 0.15)', fg: '#94a3b8' },
    sent:        { bg: 'rgba(13, 79, 79, 0.25)',    fg: 'var(--brand-teal-light)' },
    in_progress: { bg: 'rgba(212, 145, 42, 0.20)',  fg: 'var(--brand-amber)' },
    submitted:   { bg: 'rgba(168, 85, 247, 0.18)',  fg: '#c084fc' },
    reconciled:  { bg: 'rgba(22, 163, 74, 0.18)',   fg: 'var(--success)' },
};

const STATUS_LABELS = {
    draft: 'Draft',
    sent: 'Sent to crew',
    in_progress: 'In progress',
    submitted: 'Submitted',
    reconciled: 'Reconciled',
};

function formatDate(dateStr) {
    // Render as "Today" / "Tomorrow" / "Yesterday" / day-of-week (within a
    // week) / "Mon Apr 22" otherwise. assignment_date is a plain DATE in
    // Postgres — appending T00:00:00 avoids UTC drift on the client.
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function AssignmentCard({ assignment, onTap }) {
    const status = assignment.status || 'draft';
    const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.draft;
    const project = assignment.project;
    const pointCount = assignment.point_count ?? 0;

    return (
        <button
            onClick={() => onTap?.(assignment)}
            style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '16px',
                marginBottom: '12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                color: 'var(--text-main)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                minHeight: '88px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ color: 'var(--brand-amber)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    {formatDate(assignment.assignment_date)}
                </span>
                <span style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: statusStyle.bg,
                    color: statusStyle.fg,
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.3px',
                }}>
                    {STATUS_LABELS[status] || status}
                </span>
            </div>
            <div style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px', lineHeight: 1.2 }}>
                {assignment.title}
            </div>
            {project && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {project.project_name}
                    {project.location && ` · ${project.location}`}
                </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {pointCount} {pointCount === 1 ? 'point' : 'points'}
                {assignment.expected_hours != null && ` · ~${assignment.expected_hours} hr`}
            </div>
        </button>
    );
}
