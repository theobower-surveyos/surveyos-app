import React, { useMemo, useState } from 'react';
import { Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

const PAGE_SIZE = 50;

const COLS = [
    { key: 'point_id', label: 'Point', align: 'left', mono: true },
    { key: 'feature_code', label: 'Feature', align: 'left', mono: false },
    { key: 'northing', label: 'Northing', align: 'right', mono: true, fmt: (v) => (v == null ? '' : Number(v).toFixed(3)) },
    { key: 'easting', label: 'Easting', align: 'right', mono: true, fmt: (v) => (v == null ? '' : Number(v).toFixed(3)) },
    { key: 'elevation', label: 'Elev', align: 'right', mono: true, fmt: (v) => (v == null ? '' : Number(v).toFixed(3)) },
    { key: 'tolerance_h_override', label: 'Tol ±', align: 'right', mono: true, fmt: (v) => (v == null ? 'default' : Number(v).toFixed(3)) },
    { key: 'imported_at', label: 'Imported', align: 'left', mono: false, fmt: (v) => (v ? new Date(v).toLocaleDateString() : '') },
];

export default function DesignPointsTable({ points }) {
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState({ key: 'point_id', dir: 'asc' });
    const [page, setPage] = useState(0);

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return points;
        return points.filter((p) => {
            const hay = [
                p.point_id,
                p.feature_code,
                p.feature_description,
                p.northing,
                p.easting,
                p.elevation,
            ]
                .map((v) => (v == null ? '' : String(v).toLowerCase()))
                .join(' ');
            return hay.includes(q);
        });
    }, [points, filter]);

    const sorted = useMemo(() => {
        const copy = [...filtered];
        copy.sort((a, b) => {
            const av = a[sort.key];
            const bv = b[sort.key];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') {
                return sort.dir === 'asc' ? av - bv : bv - av;
            }
            const as = String(av);
            const bs = String(bv);
            return sort.dir === 'asc'
                ? as.localeCompare(bs, undefined, { numeric: true })
                : bs.localeCompare(as, undefined, { numeric: true });
        });
        return copy;
    }, [filtered, sort]);

    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    function changeSort(key) {
        setSort((prev) => {
            if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
            return { key, dir: 'asc' };
        });
    }

    return (
        <div>
            {/* Filter bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
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
                        flex: '1 1 280px',
                        maxWidth: '420px',
                    }}
                >
                    <Search size={16} color="var(--text-muted)" />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => {
                            setFilter(e.target.value);
                            setPage(0);
                        }}
                        placeholder="Filter by point, feature, coordinates"
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: 'var(--text-main)',
                            fontSize: '14px',
                        }}
                    />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {filter
                        ? `${sorted.length} of ${points.length} matched`
                        : `${points.length} points`}
                </span>
            </div>

            {/* Desktop table */}
            <div
                className="dp-desktop"
                style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--bg-dark)',
                }}
            >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                            {COLS.map((c) => {
                                const active = sort.key === c.key;
                                return (
                                    <th
                                        key={c.key}
                                        onClick={() => changeSort(c.key)}
                                        style={{
                                            textAlign: c.align,
                                            padding: '10px 14px',
                                            fontSize: '11px',
                                            letterSpacing: '0.6px',
                                            textTransform: 'uppercase',
                                            color: active ? 'var(--brand-amber)' : 'var(--text-muted)',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            borderBottom: '1px solid var(--border-subtle)',
                                            userSelect: 'none',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            {c.label}
                                            {active
                                                ? sort.dir === 'asc'
                                                    ? <ArrowUp size={12} />
                                                    : <ArrowDown size={12} />
                                                : null}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {pageRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={COLS.length}
                                    style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}
                                >
                                    No points match this filter.
                                </td>
                            </tr>
                        ) : (
                            pageRows.map((p, i) => (
                                <tr
                                    key={p.id || i}
                                    style={{
                                        borderBottom:
                                            i !== pageRows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                    }}
                                >
                                    {COLS.map((c) => {
                                        const raw = p[c.key];
                                        const display = c.fmt ? c.fmt(raw) : raw == null ? '' : String(raw);
                                        const isMono = c.mono;
                                        return (
                                            <td
                                                key={c.key}
                                                className={isMono ? 'coordinate-data' : undefined}
                                                style={{
                                                    padding: '10px 14px',
                                                    textAlign: c.align,
                                                    fontSize: '13px',
                                                    color: c.key === 'point_id' ? 'var(--brand-amber)' : 'var(--text-main)',
                                                    fontWeight: c.key === 'point_id' ? 600 : 400,
                                                }}
                                            >
                                                {display || (c.key === 'feature_code' ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>unset</span> : '')}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile card list */}
            <div className="dp-mobile" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
                {pageRows.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
                        No points match this filter.
                    </div>
                ) : (
                    pageRows.map((p, i) => (
                        <div
                            key={p.id || i}
                            style={{
                                backgroundColor: 'var(--bg-dark)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>
                                    <MapPin size={13} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                    {p.point_id}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.feature_code || '—'}</span>
                            </div>
                            <div className="coordinate-data" style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                                N {p.northing == null ? '—' : Number(p.northing).toFixed(3)}
                                {'   '}
                                E {p.easting == null ? '—' : Number(p.easting).toFixed(3)}
                                {p.elevation != null && (
                                    <>
                                        {'   '}
                                        Z {Number(p.elevation).toFixed(3)}
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '16px',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                    }}
                >
                    <span>
                        Page {currentPage + 1} of {pageCount}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            style={paginationBtn(currentPage === 0)}
                        >
                            <ChevronLeft size={14} /> Prev
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            disabled={currentPage >= pageCount - 1}
                            style={paginationBtn(currentPage >= pageCount - 1)}
                        >
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @media (max-width: 768px) {
                    .dp-desktop { display: none !important; }
                    .dp-mobile  { display: flex !important; }
                }
            `}</style>
        </div>
    );
}

function paginationBtn(disabled) {
    return {
        background: disabled ? 'transparent' : 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
        padding: '6px 12px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '13px',
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
    };
}
