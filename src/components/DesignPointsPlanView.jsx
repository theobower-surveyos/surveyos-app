import React, { useEffect, useMemo, useRef, useState } from 'react';

// ─── DesignPointsPlanView ───────────────────────────────────────────────
// SVG canvas showing every design point in survey coordinate space.
// Supports click-to-toggle, shift-click, and drag-to-lasso selection.
// Survey northing grows up; SVG y grows down — we flip y in the render
// transform (svg_y = -northing) so the plan reads "north is up".
//
// No zoom, no pan. Stage 6 scope.

const DRAG_THRESHOLD_PX = 3;
const GRID_STEP_FT = 50;

function toSvgCoords(svgEl, clientX, clientY) {
    if (!svgEl || !svgEl.getScreenCTM) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
}

export default function DesignPointsPlanView({
    designPoints,
    selectedIds,
    onSelectionChange,
    hoveredId,
    onHoverChange,
}) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [lasso, setLasso] = useState(null);
    const [cursor, setCursor] = useState(null);

    const bounds = useMemo(() => computeBounds(designPoints), [designPoints]);

    const gridLines = useMemo(() => {
        if (!bounds) return [];
        const lines = [];
        const startE = Math.floor(bounds.minE / GRID_STEP_FT) * GRID_STEP_FT;
        const endE = Math.ceil(bounds.maxE / GRID_STEP_FT) * GRID_STEP_FT;
        const startN = Math.floor(bounds.minN / GRID_STEP_FT) * GRID_STEP_FT;
        const endN = Math.ceil(bounds.maxN / GRID_STEP_FT) * GRID_STEP_FT;
        for (let e = startE; e <= endE; e += GRID_STEP_FT) {
            lines.push({ type: 'v', c: e });
        }
        for (let n = startN; n <= endN; n += GRID_STEP_FT) {
            lines.push({ type: 'h', c: n });
        }
        return lines;
    }, [bounds]);

    // Clear selection on Escape.
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') {
                if (selectedIds && selectedIds.size > 0) {
                    onSelectionChange(new Set());
                }
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedIds, onSelectionChange]);

    // Fallback pointerup handler so a drag that ends outside the svg still
    // commits. Also catches touch releases outside the element.
    useEffect(() => {
        if (!lasso) return;
        function onUp(e) {
            finalizeLasso(e);
        }
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lasso]);

    function commitLasso(l) {
        if (!l || !l.isDrag) return;
        const minX = Math.min(l.startX, l.currentX);
        const maxX = Math.max(l.startX, l.currentX);
        const minY = Math.min(l.startY, l.currentY);
        const maxY = Math.max(l.startY, l.currentY);
        const inside = new Set();
        for (const p of designPoints) {
            if (typeof p.northing !== 'number' || typeof p.easting !== 'number') continue;
            const x = p.easting;
            const y = -p.northing;
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) inside.add(p.id);
        }
        if (l.shiftKey) {
            const merged = new Set(selectedIds);
            inside.forEach((id) => merged.add(id));
            onSelectionChange(merged);
        } else {
            onSelectionChange(inside);
        }
    }

    function finalizeLasso(e) {
        setLasso((prev) => {
            if (!prev) return null;
            if (prev.isDrag) {
                commitLasso(prev);
            } else {
                // Empty-canvas click — clear selection
                if (selectedIds && selectedIds.size > 0) onSelectionChange(new Set());
            }
            return null;
        });
    }

    function onSvgPointerDown(e) {
        // Only left/primary button for mouse; always allow touch/pen.
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // If the pointer hit a point circle, let that handler run and skip lasso.
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-pid')) return;
        // Suppress the browser's native text-selection gesture for the drag
        // we're about to start — the amber lasso rect is the only visual
        // feedback we want during a drag.
        e.preventDefault();
        const pt = toSvgCoords(svgRef.current, e.clientX, e.clientY);
        if (!pt) return;
        setLasso({
            startX: pt.x,
            startY: pt.y,
            currentX: pt.x,
            currentY: pt.y,
            startScreenX: e.clientX,
            startScreenY: e.clientY,
            shiftKey: e.shiftKey,
            isDrag: false,
            pointerId: e.pointerId,
        });
    }

    function onSvgPointerMove(e) {
        // Track cursor for the hover tooltip
        setCursor({ x: e.clientX, y: e.clientY });
        if (!lasso) return;
        // Actively suppress text-selection on every move-while-dragging tick
        // — some browsers begin selecting after the first few pixels even if
        // pointerdown preventDefault was called.
        e.preventDefault();
        const dx = e.clientX - lasso.startScreenX;
        const dy = e.clientY - lasso.startScreenY;
        const pxDist = Math.sqrt(dx * dx + dy * dy);
        const pt = toSvgCoords(svgRef.current, e.clientX, e.clientY);
        if (!pt) return;
        setLasso({
            ...lasso,
            currentX: pt.x,
            currentY: pt.y,
            isDrag: lasso.isDrag || pxDist > DRAG_THRESHOLD_PX,
        });
    }

    function togglePoint(id, shiftKey) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange(next);
    }

    // ── Empty state ───────────────────────────────────────────────
    if (!bounds) {
        return (
            <div style={emptyCanvas}>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    No design points loaded for this project yet.
                </span>
            </div>
        );
    }

    // Size hierarchy: unselected (1x) < hovered (1.5x) < selected (2x).
    // Gives a decisive amber "this point is part of my assignment" read
    // without blowing out the plan density on large imports.
    const baseRadius = Math.max(bounds.w, bounds.h) * 0.006;
    const hoverRadius = Math.max(bounds.w, bounds.h) * 0.009;
    const selectedRadius = Math.max(bounds.w, bounds.h) * 0.012;
    const arrowSize = bounds.pad * 0.6;

    // Arrow in top-right, scale bar in bottom-left — both in viewBox coords.
    const arrowCx = bounds.vbX + bounds.vbW - bounds.pad * 0.5;
    const arrowCy = bounds.vbY + bounds.pad * 0.5;

    const sbX = bounds.vbX + bounds.pad * 0.4;
    const sbY = bounds.vbY + bounds.vbH - bounds.pad * 0.4;
    const sbLen = 50; // 50 feet in viewBox units

    // Tooltip content
    const hoveredPoint = hoveredId ? designPoints.find((p) => p.id === hoveredId) : null;

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                touchAction: 'none',
            }}
        >
            <svg
                ref={svgRef}
                viewBox={`${bounds.vbX} ${bounds.vbY} ${bounds.vbW} ${bounds.vbH}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={`Design point plan — ${designPoints.length} points`}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: lasso ? 'crosshair' : 'crosshair',
                    backgroundColor: 'var(--bg-dark)',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    touchAction: 'none',
                }}
                onPointerDown={onSvgPointerDown}
                onPointerMove={onSvgPointerMove}
                onPointerLeave={() => setCursor(null)}
            >
                {/* Grid */}
                <g>
                    {gridLines.map((ln, i) =>
                        ln.type === 'v' ? (
                            <line
                                key={`v${i}`}
                                x1={ln.c}
                                y1={bounds.vbY}
                                x2={ln.c}
                                y2={bounds.vbY + bounds.vbH}
                                stroke="var(--border-subtle)"
                                strokeOpacity="0.4"
                                strokeWidth="1"
                                vectorEffect="non-scaling-stroke"
                            />
                        ) : (
                            <line
                                key={`h${i}`}
                                x1={bounds.vbX}
                                y1={-ln.c}
                                x2={bounds.vbX + bounds.vbW}
                                y2={-ln.c}
                                stroke="var(--border-subtle)"
                                strokeOpacity="0.4"
                                strokeWidth="1"
                                vectorEffect="non-scaling-stroke"
                            />
                        )
                    )}
                </g>

                {/* Lasso rectangle */}
                {lasso && lasso.isDrag && (
                    <rect
                        x={Math.min(lasso.startX, lasso.currentX)}
                        y={Math.min(lasso.startY, lasso.currentY)}
                        width={Math.abs(lasso.currentX - lasso.startX)}
                        height={Math.abs(lasso.currentY - lasso.startY)}
                        fill="rgba(212, 145, 42, 0.08)"
                        stroke="var(--brand-amber)"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="none"
                    />
                )}

                {/* Points */}
                <g>
                    {designPoints.map((p) => {
                        if (typeof p.northing !== 'number' || typeof p.easting !== 'number') return null;
                        const isSelected = selectedIds && selectedIds.has(p.id);
                        const isHovered = hoveredId === p.id;
                        const r = isSelected
                            ? selectedRadius
                            : isHovered
                                ? hoverRadius
                                : baseRadius;
                        const fill = isSelected
                            ? 'var(--brand-amber)'
                            : isHovered
                                ? 'var(--brand-teal-light)'
                                : 'var(--brand-teal)';
                        return (
                            <circle
                                key={p.id}
                                data-pid={p.id}
                                cx={p.easting}
                                cy={-p.northing}
                                r={r}
                                fill={fill}
                                stroke="rgba(255,255,255,0.15)"
                                strokeWidth="0.5"
                                vectorEffect="non-scaling-stroke"
                                style={{ cursor: 'pointer' }}
                                onPointerEnter={() => onHoverChange && onHoverChange(p.id)}
                                onPointerLeave={() => onHoverChange && onHoverChange(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    togglePoint(p.id, e.shiftKey);
                                }}
                            />
                        );
                    })}
                </g>

                {/* North arrow (top-right) */}
                <g transform={`translate(${arrowCx}, ${arrowCy})`}>
                    <path
                        d={`M 0 ${-arrowSize / 2} L ${arrowSize / 3} ${arrowSize / 2} L 0 ${arrowSize / 4} L ${-arrowSize / 3} ${arrowSize / 2} Z`}
                        fill="var(--brand-amber)"
                    />
                    <text
                        x={0}
                        y={-arrowSize / 2 - arrowSize * 0.2}
                        textAnchor="middle"
                        fill="var(--brand-amber)"
                        fontSize={arrowSize * 0.5}
                        fontWeight="700"
                        fontFamily="'JetBrains Mono', monospace"
                    >
                        N
                    </text>
                </g>

                {/* Scale bar (bottom-left) */}
                <g>
                    <line
                        x1={sbX}
                        y1={sbY}
                        x2={sbX + sbLen}
                        y2={sbY}
                        stroke="var(--text-muted)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                    />
                    <line
                        x1={sbX}
                        y1={sbY - arrowSize * 0.15}
                        x2={sbX}
                        y2={sbY + arrowSize * 0.15}
                        stroke="var(--text-muted)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                    />
                    <line
                        x1={sbX + sbLen}
                        y1={sbY - arrowSize * 0.15}
                        x2={sbX + sbLen}
                        y2={sbY + arrowSize * 0.15}
                        stroke="var(--text-muted)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                    />
                    <text
                        x={sbX + sbLen / 2}
                        y={sbY + arrowSize * 0.45}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                        fontSize={arrowSize * 0.4}
                        fontFamily="'JetBrains Mono', monospace"
                    >
                        50 ft
                    </text>
                </g>
            </svg>

            {/* Tooltip */}
            {hoveredPoint && cursor && containerRef.current && (
                <Tooltip point={hoveredPoint} cursor={cursor} containerEl={containerRef.current} />
            )}
        </div>
    );
}

function Tooltip({ point, cursor, containerEl }) {
    // Position tooltip relative to the container, offset from the cursor.
    const rect = containerEl.getBoundingClientRect();
    const left = Math.min(cursor.x - rect.left + 14, rect.width - 220);
    const top = Math.max(cursor.y - rect.top + 14, 8);
    return (
        <div
            style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                pointerEvents: 'none',
                backgroundColor: 'rgba(10, 15, 30, 0.96)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px 14px',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.65,
                maxWidth: '220px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                zIndex: 5,
            }}
        >
            <div
                style={{
                    color: 'var(--brand-amber)',
                    fontWeight: 700,
                    fontSize: '14px',
                    marginBottom: '2px',
                    letterSpacing: '0.2px',
                }}
            >
                {point.point_id}
            </div>
            {point.feature_code && (
                <div
                    style={{
                        color: 'var(--text-muted)',
                        fontSize: '11.5px',
                        marginBottom: '6px',
                    }}
                >
                    {point.feature_code}
                </div>
            )}
            <div className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                N {Number(point.northing).toFixed(3)}
            </div>
            <div className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                E {Number(point.easting).toFixed(3)}
            </div>
            {point.elevation != null && (
                <div className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                    Z {Number(point.elevation).toFixed(3)}
                </div>
            )}
        </div>
    );
}

function computeBounds(points) {
    if (!points || points.length === 0) return null;
    let minN = Infinity,
        maxN = -Infinity,
        minE = Infinity,
        maxE = -Infinity;
    for (const p of points) {
        if (typeof p.northing !== 'number' || typeof p.easting !== 'number') continue;
        if (p.northing < minN) minN = p.northing;
        if (p.northing > maxN) maxN = p.northing;
        if (p.easting < minE) minE = p.easting;
        if (p.easting > maxE) maxE = p.easting;
    }
    if (!Number.isFinite(minN)) return null;
    const w = Math.max(maxE - minE, 1);
    const h = Math.max(maxN - minN, 1);
    const pad = 0.1 * Math.max(w, h, 50);
    return {
        minN,
        maxN,
        minE,
        maxE,
        w,
        h,
        pad,
        vbX: minE - pad,
        vbY: -(maxN + pad),
        vbW: w + 2 * pad,
        vbH: h + 2 * pad,
    };
}

const emptyCanvas = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    minHeight: '300px',
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-muted)',
};
