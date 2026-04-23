import React, { useMemo } from 'react';
import { Locate } from 'lucide-react';
import { FEATURE_GROUPS, classifyPointToGroup } from './featureCodeGroups.js';

// ─── CanvasToolbar ────────────────────────────────────────────────────
// Horizontal strip above the plan view holding the feature-group filter
// chips, the Find-Point trigger, and the Legend toggle. State is owned
// by DesignPointsPlanView — this component is purely presentational plus
// event callbacks.
//
// Interaction model:
//   click chip        → ISOLATE that group (others off)
//   shift-click chip  → toggle in the active set
//   click "All"       → toggle all-on / all-off

export default function CanvasToolbar({
    points,
    classification,
    filterState,        // Set<groupId> | null (null = all active)
    onFilterChange,
    legendVisible,
    onLegendToggle,
    onZoomPopoverToggle,
}) {
    const counts = useMemo(() => {
        const c = {};
        for (const g of FEATURE_GROUPS) c[g.id] = 0;
        for (const p of points || []) {
            const gid = classifyPointToGroup(p, classification);
            if (c[gid] != null) c[gid] += 1;
        }
        return c;
    }, [points, classification]);

    const totalPoints = (points || []).length;
    const allActive = !filterState;
    const noneActive = filterState && filterState.size === 0;

    function isActive(id) {
        if (!filterState) return true;
        return filterState.has(id);
    }

    function toggleAll() {
        if (allActive) {
            // Turn everything off — empty Set, not null
            onFilterChange(new Set());
        } else {
            // Re-enable all
            onFilterChange(null);
        }
    }

    function onChipClick(e, id) {
        e.preventDefault();
        if (e.shiftKey) {
            // Toggle within current active set
            const current = filterState || new Set(FEATURE_GROUPS.map((g) => g.id));
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            // Normalize back to null if user ended up re-selecting everything
            if (next.size === FEATURE_GROUPS.length) onFilterChange(null);
            else onFilterChange(next);
        } else {
            // Isolate
            if (filterState && filterState.size === 1 && filterState.has(id)) {
                // Clicking the only-active chip returns to all
                onFilterChange(null);
            } else {
                onFilterChange(new Set([id]));
            }
        }
    }

    return (
        <div className="ct-root">
            <style>{`
                .ct-root {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 10px;
                    background-color: var(--bg-surface);
                    border-bottom: 1px solid var(--border-subtle);
                    flex-wrap: nowrap;
                    overflow: hidden;
                }
                .ct-chip-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 1;
                    min-width: 0;
                    overflow-x: auto;
                    overflow-y: hidden;
                    padding: 2px 0;
                    scrollbar-width: thin;
                }
                .ct-chip-row::-webkit-scrollbar { height: 6px; }
                .ct-chip-row::-webkit-scrollbar-thumb {
                    background: var(--border-subtle);
                    border-radius: 3px;
                }
                .ct-chip {
                    flex: 0 0 auto;
                    border: 1px solid var(--border-subtle);
                    background: var(--bg-dark);
                    color: var(--text-muted);
                    padding: 5px 11px;
                    border-radius: 999px;
                    font-size: 12px;
                    font-family: inherit;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                }
                .ct-chip:hover {
                    color: var(--text-main);
                    border-color: var(--text-muted);
                }
                .ct-chip.active {
                    background: var(--brand-teal);
                    border-color: var(--brand-teal);
                    color: #fff;
                }
                .ct-chip.active:hover {
                    background: var(--brand-teal-light);
                    border-color: var(--brand-teal-light);
                }
                .ct-chip.partial {
                    border-color: var(--brand-teal);
                    color: var(--brand-teal-light);
                    background: rgba(13, 79, 79, 0.12);
                }
                .ct-chip.empty {
                    opacity: 0.45;
                    font-size: 11px;
                }
                .ct-chip-count {
                    margin-left: 5px;
                    opacity: 0.8;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 10.5px;
                }
                .ct-actions {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 0 0 auto;
                    padding-left: 6px;
                    border-left: 1px solid var(--border-subtle);
                }
                .ct-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: var(--bg-dark);
                    border: 1px solid var(--border-subtle);
                    color: var(--text-main);
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 12px;
                    font-family: inherit;
                    font-weight: 500;
                    transition: all 0.15s ease;
                }
                .ct-btn:hover {
                    border-color: var(--brand-teal-light);
                    color: var(--brand-teal-light);
                }
                .ct-btn.active {
                    background: var(--brand-teal);
                    border-color: var(--brand-teal);
                    color: #fff;
                }
                .ct-legend-swatches {
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                    margin-right: 2px;
                }
                .ct-legend-swatches > span {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    display: inline-block;
                }
                @media (max-width: 600px) {
                    .ct-btn > span:not(.ct-legend-swatches) { display: none; }
                }
            `}</style>

            <div className="ct-chip-row">
                <button
                    type="button"
                    className={`ct-chip ${allActive ? 'active' : noneActive ? '' : 'partial'}`}
                    onClick={toggleAll}
                    title="Toggle all filters"
                >
                    All
                    <span className="ct-chip-count">{totalPoints}</span>
                </button>
                {FEATURE_GROUPS.map((g) => {
                    const active = isActive(g.id);
                    const count = counts[g.id] || 0;
                    return (
                        <button
                            key={g.id}
                            type="button"
                            className={`ct-chip ${active ? 'active' : ''} ${count === 0 ? 'empty' : ''}`}
                            onClick={(e) => onChipClick(e, g.id)}
                            title={`${g.label} (${count})  ·  shift-click to add/remove`}
                        >
                            {g.label}
                            <span className="ct-chip-count">{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="ct-actions">
                <button
                    type="button"
                    className="ct-btn"
                    onClick={onZoomPopoverToggle}
                    title="Zoom to a specific point"
                >
                    <Locate size={14} />
                    <span>Find point</span>
                </button>
                <button
                    type="button"
                    className={`ct-btn ${legendVisible ? 'active' : ''}`}
                    onClick={onLegendToggle}
                    title={legendVisible ? 'Hide feature legend' : 'Show feature legend'}
                >
                    <span className="ct-legend-swatches" aria-hidden="true">
                        <span style={{ background: '#F97316' }} />
                        <span style={{ background: '#2563EB' }} />
                        <span style={{ background: '#14B8A6' }} />
                        <span style={{ background: '#16A34A' }} />
                        <span style={{ background: '#9CA3AF' }} />
                    </span>
                    <span>Legend</span>
                </button>
            </div>
        </div>
    );
}
