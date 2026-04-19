import React, { useEffect, useMemo, useState } from 'react';
import {
    Plus,
    Search,
    ChevronRight,
    ClipboardList,
    Loader,
    ChevronLeft,
    ChevronRight as ChevronRightPg,
} from 'lucide-react';

const STATUSES = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Sent' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'reconciled', label: 'Reconciled' },
];

const STATUS_STYLES = {
    draft:       { bg: 'transparent',              border: 'var(--border-subtle)', color: 'var(--text-muted)'      },
    sent:        { bg: 'var(--brand-amber-muted)', border: 'var(--brand-amber)',   color: 'var(--brand-amber)'     },
    in_progress: { bg: 'rgba(26, 107, 107, 0.18)', border: 'var(--brand-teal-light)', color: 'var(--brand-teal-light)' },
    submitted:   { bg: 'rgba(13, 79, 79, 0.32)',   border: 'var(--brand-teal)',    color: '#fff'                   },
    reconciled:  { bg: 'rgba(16, 185, 129, 0.16)', border: 'var(--success)',       color: 'var(--success)'         },
};

const SORT_OPTIONS = [
    { key: 'date-desc', label: 'Date (newest first)' },
    { key: 'date-asc', label: 'Date (oldest first)' },
    { key: 'title-asc', label: 'Title A–Z' },
    { key: 'title-desc', label: 'Title Z–A' },
    { key: 'status', label: 'Status' },
];

const STATUS_ORDER = { draft: 0, sent: 1, in_progress: 2, submitted: 3, reconciled: 4 };
const PAGE_SIZE = 20;

function chiefLabelFromProfile(p) {
    if (!p) return null;
    return `${p.first_name || ''} ${p.last_name || ''}`.trim() || null;
}

export default function AssignmentsList({
    supabase,
    profile,
    projectId,
    onToast,
    onOpenBuilder,
    onOpenAssignment,
}) {
    const [assignments, setAssignments] = useState([]);
    const [chiefMap, setChiefMap] = useState({});
    const [qcCounts, setQcCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sort, setSort] = useState('date-desc');
    const [page, setPage] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!projectId) return;
            setLoading(true);
            try {
                const { data: asgs, error } = await supabase
                    .from('stakeout_assignments')
                    .select(
                        'id, title, status, assignment_date, party_chief_id, expected_hours, default_tolerance_h, default_tolerance_v, notes, sent_at, created_at',
                    )
                    .eq('project_id', projectId)
                    .order('assignment_date', { ascending: false })
                    .order('created_at', { ascending: false });
                if (error) throw error;
                if (cancelled) return;

                const list = asgs || [];
                setAssignments(list);

                const chiefIds = [...new Set(list.map((a) => a.party_chief_id).filter(Boolean))];
                const asgIds = list.map((a) => a.id);

                const [chiefRes, summaryRes] = await Promise.all([
                    chiefIds.length > 0
                        ? supabase
                              .from('user_profiles')
                              .select('id, first_name, last_name')
                              .in('id', chiefIds)
                        : Promise.resolve({ data: [] }),
                    asgIds.length > 0
                        ? supabase
                              .from('stakeout_qc_summary')
                              .select('assignment_id, h_status')
                              .in('assignment_id', asgIds)
                        : Promise.resolve({ data: [] }),
                ]);
                if (cancelled) return;

                const cMap = {};
                (chiefRes.data || []).forEach((u) => {
                    cMap[u.id] = u;
                });
                setChiefMap(cMap);

                const counts = {};
                (summaryRes.data || []).forEach((r) => {
                    if (!counts[r.assignment_id]) {
                        counts[r.assignment_id] = {
                            total: 0,
                            in_tol: 0,
                            out_of_tol: 0,
                            field_fit: 0,
                            built_on: 0,
                            pending: 0,
                        };
                    }
                    counts[r.assignment_id].total += 1;
                    const s = r.h_status || 'pending';
                    if (counts[r.assignment_id][s] != null) counts[r.assignment_id][s] += 1;
                    else counts[r.assignment_id].pending += 1;
                });
                setQcCounts(counts);
            } catch (err) {
                if (cancelled) return;
                console.error('[AssignmentsList] load error:', err);
                if (onToast) onToast('error', 'Failed to load assignments. Check console.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Filter / sort / paginate ──────────────────────────────────
    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return assignments.filter((a) => {
            if (statusFilter !== 'all' && a.status !== statusFilter) return false;
            if (!q) return true;
            const chief = chiefLabelFromProfile(chiefMap[a.party_chief_id]) || '';
            const hay = `${a.title || ''} ${chief}`.toLowerCase();
            return hay.includes(q);
        });
    }, [assignments, filter, statusFilter, chiefMap]);

    const sorted = useMemo(() => {
        const copy = [...filtered];
        copy.sort((a, b) => {
            switch (sort) {
                case 'date-asc':
                    return (a.assignment_date || '').localeCompare(b.assignment_date || '');
                case 'date-desc':
                    return (b.assignment_date || '').localeCompare(a.assignment_date || '');
                case 'title-asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'title-desc':
                    return (b.title || '').localeCompare(a.title || '');
                case 'status':
                    return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
                default:
                    return 0;
            }
        });
        return copy;
    }, [filtered, sort]);

    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    // ── Render ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div role="status" aria-label="Loading assignments" style={loadingCard}>
                <Loader size={20} className="spinning" color="var(--brand-teal-light)" />
                <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>
                    Loading assignments…
                </span>
                <style>{`
                    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    .spinning { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        );
    }

    const emptyAssignments = assignments.length === 0;

    return (
        <div>
            <style>{`
                .asg-card {
                    background-color: var(--bg-surface);
                    border: 1px solid var(--border-subtle);
                    border-radius: 8px;
                    padding: 16px 18px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    cursor: pointer;
                    text-align: left;
                    color: var(--text-main);
                    font-family: inherit;
                    width: 100%;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
                }
                .asg-card:hover {
                    border-color: var(--brand-teal-light);
                    box-shadow: 0 6px 18px rgba(0,0,0,0.3);
                }
                .asg-card > .asg-body { flex: 1; min-width: 0; }
                .asg-card > .asg-body > h3 {
                    margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: var(--text-main);
                }
                .asg-card > .asg-body > .asg-sub {
                    color: var(--text-muted); font-size: 12.5px; display: flex; gap: 8px; flex-wrap: wrap;
                }
                .asg-card > .asg-counts {
                    font-size: 12px; color: var(--text-muted); white-space: nowrap;
                }
                .asg-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    border: 1px solid;
                }
                .asg-filter-chip {
                    background: transparent;
                    border: 1px solid var(--border-subtle);
                    color: var(--text-muted);
                    padding: 5px 12px;
                    border-radius: 999px;
                    cursor: pointer;
                    font-size: 12px;
                    font-family: inherit;
                    transition: all 0.15s ease;
                }
                .asg-filter-chip:hover { color: var(--text-main); border-color: var(--text-muted); }
                .asg-filter-chip.active {
                    background: rgba(13, 79, 79, 0.22);
                    border-color: var(--brand-teal-light);
                    color: var(--brand-teal-light);
                }
                @media (max-width: 600px) {
                    .asg-card > .asg-counts { display: none; }
                }
            `}</style>

            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '18px',
                }}
            >
                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-main)' }}>Assignments</h2>
                <button type="button" onClick={onOpenBuilder} style={primaryBtn}>
                    <Plus size={14} /> New assignment
                </button>
            </div>

            {emptyAssignments ? (
                <div style={emptyCard}>
                    <ClipboardList size={28} color="var(--text-muted)" style={{ marginBottom: '10px' }} />
                    <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '4px' }}>
                        No assignments yet
                    </div>
                    <div
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '13px',
                            marginBottom: '16px',
                            maxWidth: '320px',
                            margin: '0 auto 16px auto',
                            lineHeight: 1.5,
                        }}
                    >
                        Open the canvas builder to lasso design points into a day's work.
                    </div>
                    <button type="button" onClick={onOpenBuilder} style={primaryBtn}>
                        <Plus size={14} /> New assignment
                    </button>
                </div>
            ) : (
                <>
                    {/* Filter / sort bar */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '10px',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            marginBottom: '14px',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: 'var(--bg-dark)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '8px',
                                flex: '1 1 240px',
                                maxWidth: '360px',
                            }}
                        >
                            <Search size={14} color="var(--text-muted)" />
                            <input
                                type="text"
                                value={filter}
                                onChange={(e) => {
                                    setFilter(e.target.value);
                                    setPage(0);
                                }}
                                placeholder="Filter by title or party chief"
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    color: 'var(--text-main)',
                                    fontSize: '13px',
                                }}
                            />
                        </div>

                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            style={selectStyle}
                            aria-label="Sort assignments"
                        >
                            {SORT_OPTIONS.map((o) => (
                                <option key={o.key} value={o.key}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                            marginBottom: '18px',
                        }}
                    >
                        {STATUSES.map((s) => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => {
                                    setStatusFilter(s.key);
                                    setPage(0);
                                }}
                                className={`asg-filter-chip ${statusFilter === s.key ? 'active' : ''}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {sorted.length === 0 ? (
                        <div style={emptyCard}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                                No assignments match these filters.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {pageRows.map((a) => (
                                <AssignmentCard
                                    key={a.id}
                                    assignment={a}
                                    chief={chiefMap[a.party_chief_id]}
                                    counts={qcCounts[a.id]}
                                    onOpen={() => onOpenAssignment(a.id)}
                                />
                            ))}
                        </div>
                    )}

                    {pageCount > 1 && (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: '18px',
                                color: 'var(--text-muted)',
                                fontSize: '13px',
                            }}
                        >
                            <span>
                                Page {currentPage + 1} of {pageCount}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={currentPage === 0}
                                    style={pgBtn(currentPage === 0)}
                                >
                                    <ChevronLeft size={14} /> Prev
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                                    disabled={currentPage >= pageCount - 1}
                                    style={pgBtn(currentPage >= pageCount - 1)}
                                >
                                    Next <ChevronRightPg size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function AssignmentCard({ assignment, chief, counts, onOpen }) {
    const chiefLabel = chiefLabelFromProfile(chief) || 'Unassigned';
    const statusStyle = STATUS_STYLES[assignment.status] || STATUS_STYLES.draft;

    return (
        <button type="button" onClick={onOpen} className="asg-card">
            <div className="asg-body">
                <h3>{assignment.title || '(untitled)'}</h3>
                <div className="asg-sub">
                    <span>{assignment.assignment_date || '—'}</span>
                    <span>·</span>
                    <span>{chiefLabel}</span>
                    {counts?.total ? (
                        <>
                            <span>·</span>
                            <span>
                                <span className="coordinate-data">{counts.total}</span> point
                                {counts.total === 1 ? '' : 's'}
                            </span>
                        </>
                    ) : null}
                </div>
            </div>

            {counts && counts.total > 0 && (
                <div className="asg-counts">
                    {counts.in_tol > 0 && (
                        <CountPill color="var(--success)" value={counts.in_tol} label="in tol" />
                    )}
                    {counts.out_of_tol > 0 && (
                        <CountPill color="var(--error)" value={counts.out_of_tol} label="out" />
                    )}
                    {counts.field_fit > 0 && (
                        <CountPill color="var(--brand-amber)" value={counts.field_fit} label="field fit" />
                    )}
                    {counts.built_on > 0 && (
                        <CountPill color="rgba(201, 116, 242, 1)" value={counts.built_on} label="built" />
                    )}
                </div>
            )}

            <span
                className="asg-chip"
                aria-label={`Status: ${assignment.status}`}
                style={{
                    backgroundColor: statusStyle.bg,
                    borderColor: statusStyle.border,
                    color: statusStyle.color,
                }}
            >
                {(assignment.status || 'draft').replace('_', ' ')}
            </span>
            <ChevronRight size={16} color="var(--text-muted)" />
        </button>
    );
}

function CountPill({ color, value, label }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginLeft: '10px',
            }}
        >
            <span className="coordinate-data" style={{ color, fontWeight: 600 }}>
                {value}
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        </span>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────

const loadingCard = {
    padding: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
};

const emptyCard = {
    padding: '48px 24px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px dashed var(--border-subtle)',
    borderRadius: '12px',
};

const primaryBtn = {
    backgroundColor: 'var(--brand-teal)',
    color: '#fff',
    border: '1px solid var(--brand-teal)',
    padding: '9px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
};

const selectStyle = {
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'inherit',
};

function pgBtn(disabled) {
    return {
        backgroundColor: disabled ? 'transparent' : 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
        padding: '6px 12px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: 'inherit',
    };
}
