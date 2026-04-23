import React, { useEffect, useMemo, useRef, useState } from 'react';
import { classifyPoints } from './planview/pointClassification.js';
import { resolveFeatureStyle } from './planview/featureCodeStyles.js';

// ─── DesignPointsPlanView ───────────────────────────────────────────────
// SVG canvas showing every design point in survey coordinate space.
// Supports click-to-toggle, shift-click, and drag-to-lasso selection,
// plus Stage 8.5a additions: control-point detection + distinct glyph,
// fit-to-staking default zoom, wheel zoom, spacebar + drag pan, and
// two-finger pinch/pan on touch devices.
//
// Survey northing grows up; SVG y grows down — we flip y in the render
// transform (svg_y = -northing) so the plan reads "north is up".
//
// Pan/zoom state is deliberately internal to the component — each mount
// gets a fresh default view. Lifting would leak an ephemeral interaction
// concern into three consumer components that don't care.

// ── Constants ──────────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 3;

// Zoom limits, expressed as multipliers against the default "fit to
// staking" viewBox. Larger multiplier = zoomed-in (smaller viewBox).
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 20;
const WHEEL_ZOOM_STEP = 1.1;

const STAKING_PAD_FRAC = 0.05; // 5% padding around the staking cluster

// Status-driven point styling used by AssignmentDetail. When
// pointStatusMap is passed, this overrides the default teal color —
// selection (amber) still trumps status.
const STATUS_STYLES = {
    in_tol:     { fill: 'var(--success)',         radiusMul: 1.0 },
    out_of_tol: { fill: 'var(--error)',           radiusMul: 1.3 },
    field_fit:  { fill: 'var(--brand-amber)',     radiusMul: 1.2 },
    built_on:   { fill: 'rgba(201, 116, 242, 1)', radiusMul: 1.2 },
    pending:    { fill: 'var(--brand-teal)',      radiusMul: 1.0 },
};

const STATUS_LABELS = {
    in_tol: 'In tolerance',
    out_of_tol: 'Out of tolerance',
    field_fit: 'Field fit',
    built_on: 'Built on',
    pending: 'Pending',
};

const STATUS_COLORS = {
    in_tol: 'var(--success)',
    out_of_tol: 'var(--error)',
    field_fit: 'var(--brand-amber)',
    built_on: 'rgba(201, 116, 242, 1)',
    pending: 'var(--text-muted)',
};

// Tooltip sizing hints for boundary-flip math. The real div can be taller
// when extraPointData is present, so we measure after the first layout
// and re-use the real size for subsequent positioning.
const TOOLTIP_BASE_W = 220;
const TOOLTIP_BASE_H = 130;
const TOOLTIP_EXTRA_H = 230;
const TOOLTIP_EDGE_GAP = 14;

// ── Geometry helpers ───────────────────────────────────────────────────

function computePointsBounds(points, padFrac = 0.1) {
    if (!points || points.length === 0) return null;
    let minN = Infinity;
    let maxN = -Infinity;
    let minE = Infinity;
    let maxE = -Infinity;
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
    const pad = padFrac * Math.max(w, h, 50);
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

function toSvgCoords(svgEl, clientX, clientY) {
    if (!svgEl || !svgEl.getScreenCTM) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
}

// Dynamic grid spacing: aim for ~18 visible lines in whichever dimension
// drives the viewport. Keeps the grid readable across zoom levels.
const NICE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
function pickGridStep(visibleExtentFt) {
    const target = 18;
    const raw = visibleExtentFt / target;
    for (const c of NICE_STEPS) if (c >= raw) return c;
    return NICE_STEPS[NICE_STEPS.length - 1];
}

// Nice survey length to render in the scale bar. Targets ~110 px of
// screen length; picks the nearest NICE_STEPS value.
function pickScaleBar(viewBoxW, containerPx, targetPx = 110) {
    const pxPerFoot = containerPx / viewBoxW || 1;
    const rawFeet = targetPx / pxPerFoot;
    let feet = NICE_STEPS[0];
    for (const c of NICE_STEPS) {
        if (Math.abs(Math.log10(c) - Math.log10(rawFeet)) <
            Math.abs(Math.log10(feet) - Math.log10(rawFeet))) {
            feet = c;
        }
    }
    return { feet, pxLength: feet * pxPerFoot };
}

// ── Component ──────────────────────────────────────────────────────────

export default function DesignPointsPlanView({
    designPoints,
    selectedIds,
    onSelectionChange,
    hoveredId,
    onHoverChange,
    pointStatusMap,
    extraPointData,
    // Stage 8.5a opt-ins — consumers don't have to pass these.
    initialZoomTo = 'staking',
    allowPanZoom = true,
    showControlPoints = true,
}) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const tooltipRef = useRef(null);
    const tooltipMeasuredRef = useRef(null); // { w, h }
    const activePointersRef = useRef(new Map()); // pointerId → {clientX, clientY}
    const pinchStartRef = useRef(null); // { centroid, dist, viewBox }
    const panStartRef = useRef(null); // { clientX, clientY, viewBox }
    const wheelRafRef = useRef(null);
    const wheelPendingRef = useRef(null);
    const viewBoxRef = useRef(null); // mirror of viewBoxState for non-React listeners
    // Refs the wheel handler reads from — the wheel listener is attached
    // ONCE on mount with empty deps so it survives across defaultViewBox
    // changes, which means it cannot close over defaultViewBox directly.
    const defaultViewBoxRef = useRef(null);
    const allowPanZoomRef = useRef(allowPanZoom);

    const [lasso, setLasso] = useState(null);
    const [cursor, setCursor] = useState(null);
    const [isSpaceDown, setIsSpaceDown] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [viewBoxState, setViewBoxState] = useState(null);

    // ── Classification and default bounds ────────────────────────
    const classification = useMemo(() => classifyPoints(designPoints), [designPoints]);

    const { stakingPoints, controlPoints } = useMemo(() => {
        const staking = [];
        const control = [];
        for (const p of (designPoints || [])) {
            const cls = classification.get(p.id);
            if (cls === 'control') control.push(p);
            else staking.push(p);
        }
        return { stakingPoints: staking, controlPoints: control };
    }, [designPoints, classification]);

    const defaultViewBox = useMemo(() => {
        // Spec: fit to staking cluster if present, else fall back to full.
        const fitSet =
            initialZoomTo === 'all'
                ? designPoints
                : stakingPoints.length > 0
                    ? stakingPoints
                    : designPoints;
        return computePointsBounds(fitSet, STAKING_PAD_FRAC);
    }, [designPoints, stakingPoints, initialZoomTo]);

    // Reset viewBox when the default shifts (e.g., project load, big edit).
    useEffect(() => {
        if (!defaultViewBox) {
            setViewBoxState(null);
            viewBoxRef.current = null;
            return;
        }
        const next = {
            x: defaultViewBox.vbX,
            y: defaultViewBox.vbY,
            w: defaultViewBox.vbW,
            h: defaultViewBox.vbH,
        };
        setViewBoxState(next);
        viewBoxRef.current = next;
    }, [defaultViewBox]);

    // Keep the ref in lockstep so wheel / pointer listeners read fresh.
    useEffect(() => {
        viewBoxRef.current = viewBoxState;
    }, [viewBoxState]);

    // Sync defaultViewBox + allowPanZoom into refs so the once-mounted
    // wheel listener always reads the current values without needing to
    // be torn down and re-attached on every props change.
    useEffect(() => {
        defaultViewBoxRef.current = defaultViewBox;
    }, [defaultViewBox]);
    useEffect(() => {
        allowPanZoomRef.current = allowPanZoom;
    }, [allowPanZoom]);

    // ── Keyboard: Escape resets; Space toggles pan mode ──────────
    useEffect(() => {
        function onDown(e) {
            if (e.key === 'Escape') {
                // Two jobs: reset zoom AND (legacy) clear selection.
                if (defaultViewBox) {
                    setViewBoxState({
                        x: defaultViewBox.vbX,
                        y: defaultViewBox.vbY,
                        w: defaultViewBox.vbW,
                        h: defaultViewBox.vbH,
                    });
                }
                if (selectedIds && selectedIds.size > 0 && !isSpaceDown) {
                    onSelectionChange(new Set());
                }
            }
            if (e.code === 'Space' && allowPanZoom) {
                // Suppress the page-scroll default spacebar behavior, but
                // only when focus is on the canvas (don't hijack spacebar
                // in form inputs elsewhere in the app).
                const target = e.target;
                if (
                    target &&
                    (target === document.body ||
                        (containerRef.current && containerRef.current.contains(target)))
                ) {
                    e.preventDefault();
                }
                setIsSpaceDown(true);
            }
        }
        function onUp(e) {
            if (e.code === 'Space') {
                setIsSpaceDown(false);
                setIsPanning(false);
                panStartRef.current = null;
            }
        }
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
        };
    }, [selectedIds, onSelectionChange, defaultViewBox, isSpaceDown, allowPanZoom]);

    // ── Window-scoped pointerup fallback ─────────────────────────
    useEffect(() => {
        function onUp(e) {
            // Close any in-flight interaction. Map cleanup first — touch
            // releases need this even if there's no lasso / pan in play.
            activePointersRef.current.delete(e.pointerId);
            if (activePointersRef.current.size < 2) pinchStartRef.current = null;
            if (activePointersRef.current.size === 0) {
                panStartRef.current = null;
                setIsPanning(false);
            }
            if (lasso) finalizeLasso();
        }
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lasso]);

    // ── Wheel zoom (non-passive, attached manually so preventDefault works) ──
    //
    // Attached to the OUTER container div, not the SVG. A scrollable
    // ancestor (e.g. app-main-content has `overflow: auto`) can capture
    // wheel events before they bubble to a descendant SVG's listener —
    // Safari is especially eager about this. Attaching on the container
    // plus `overscrollBehavior: contain` below guarantees the handler
    // receives every wheel tick that originates inside the canvas area.
    //
    // Empty dep array is load-bearing: the wrapper div is always rendered
    // (see render below), so containerRef is populated by the time this
    // effect fires for the first time. Attaching once-per-mount means the
    // listener survives across defaultViewBox / viewBoxState updates — an
    // earlier implementation retore the listener on every props change,
    // and the window between teardown and re-attach was long enough for
    // wheel events to fall through to the scrollable ancestor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const wrapper = containerRef.current;
        if (!wrapper) return;

        function onWheel(e) {
            // MUST call preventDefault FIRST — before any ref checks.
            // React's synthetic onWheel prop is always passive in React
            // 17+, so the native listener (this one) with {passive:false}
            // is the only thing that can stop Safari / Chrome from
            // scrolling the page underneath the canvas.
            e.preventDefault();
            if (!allowPanZoomRef.current) return;
            if (!viewBoxRef.current || !defaultViewBoxRef.current) return;
            wheelPendingRef.current = e;
            if (wheelRafRef.current != null) return;
            wheelRafRef.current = requestAnimationFrame(() => {
                wheelRafRef.current = null;
                const last = wheelPendingRef.current;
                wheelPendingRef.current = null;
                if (!last) return;
                applyWheelZoom(last);
            });
        }

        function applyWheelZoom(e) {
            const vb = viewBoxRef.current;
            const defaults = defaultViewBoxRef.current;
            const svgEl = svgRef.current;
            if (!vb || !defaults || !svgEl) return;
            const svgPt = toSvgCoords(svgEl, e.clientX, e.clientY);
            if (!svgPt) return;

            const factor = e.deltaY < 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
            const currentScale = defaults.vbW / vb.w;
            const nextScale = currentScale / factor;
            const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
            if (clamped === currentScale) return;

            const newW = defaults.vbW / clamped;
            const newH = defaults.vbH / clamped;
            // Keep the cursor pinned to the same point on the plan.
            const fx = (svgPt.x - vb.x) / vb.w;
            const fy = (svgPt.y - vb.y) / vb.h;
            const newX = svgPt.x - fx * newW;
            const newY = svgPt.y - fy * newH;
            const next = { x: newX, y: newY, w: newW, h: newH };
            viewBoxRef.current = next;
            setViewBoxState(next);
        }

        wrapper.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            wrapper.removeEventListener('wheel', onWheel);
            if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current);
            wheelRafRef.current = null;
        };
    }, []);

    // ── Helpers for lasso / pan / pinch ──────────────────────────
    function commitLasso(l) {
        if (!l || !l.isDrag) return;
        const minX = Math.min(l.startX, l.currentX);
        const maxX = Math.max(l.startX, l.currentX);
        const minY = Math.min(l.startY, l.currentY);
        const maxY = Math.max(l.startY, l.currentY);
        const inside = new Set();
        for (const p of designPoints) {
            if (typeof p.northing !== 'number' || typeof p.easting !== 'number') continue;
            // Control points aren't valid lasso targets.
            if (classification.get(p.id) === 'control') continue;
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

    function finalizeLasso() {
        // Side effects (onSelectionChange on the parent, commitLasso) must
        // run in event-handler scope, NEVER inside a functional setState
        // updater. Functional updaters are invoked by React during the
        // render/update phase, which makes any parent setState call from
        // inside them throw "Cannot update a component while rendering a
        // different component". Read `lasso` directly — the window
        // pointerup effect that calls us re-attaches on every lasso
        // change, so the closure is always fresh.
        if (!lasso) return;
        if (lasso.isDrag) {
            commitLasso(lasso);
        } else if (selectedIds && selectedIds.size > 0) {
            onSelectionChange(new Set());
        }
        setLasso(null);
    }

    function togglePoint(id) {
        if (classification.get(id) === 'control') return; // not selectable
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange(next);
    }

    function pinchCentroid() {
        const pts = [...activePointersRef.current.values()];
        if (pts.length < 2) return null;
        const [a, b] = pts;
        return {
            clientX: (a.clientX + b.clientX) / 2,
            clientY: (a.clientY + b.clientY) / 2,
            dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        };
    }

    // ── Pointer events on the SVG ────────────────────────────────
    function onSvgPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        // Touch first — register the pointer regardless of target; we
        // need to count fingers before deciding lasso vs pinch.
        if (e.pointerType === 'touch') {
            activePointersRef.current.set(e.pointerId, {
                clientX: e.clientX,
                clientY: e.clientY,
            });
            if (activePointersRef.current.size >= 2 && allowPanZoom) {
                // Two-finger pinch starts — abort any in-flight lasso.
                const c = pinchCentroid();
                if (c && viewBoxRef.current) {
                    pinchStartRef.current = {
                        centroid: c,
                        dist: c.dist,
                        viewBox: { ...viewBoxRef.current },
                    };
                    setLasso(null);
                    setIsPanning(true);
                }
                return;
            }
        }

        // Spacebar + drag → pan (regardless of whether the pointer is on
        // a point). Point onClick handlers check isPanning to suppress
        // toggles during a pan drag.
        if (isSpaceDown && allowPanZoom) {
            e.preventDefault();
            panStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                viewBox: viewBoxRef.current ? { ...viewBoxRef.current } : null,
            };
            setIsPanning(true);
            return;
        }

        // If the pointer hit a point circle / triangle, let that handler
        // run (it stops propagation on its own). Skip lasso init.
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-pid')) return;

        // Suppress native text-selection gesture.
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
        // Always track screen cursor for the hover tooltip.
        setCursor({ x: e.clientX, y: e.clientY });

        // Keep the active-pointer map fresh for pinch math.
        if (e.pointerType === 'touch' && activePointersRef.current.has(e.pointerId)) {
            activePointersRef.current.set(e.pointerId, {
                clientX: e.clientX,
                clientY: e.clientY,
            });
        }

        // Two-finger pan + pinch zoom.
        if (pinchStartRef.current && activePointersRef.current.size >= 2) {
            e.preventDefault();
            const current = pinchCentroid();
            const start = pinchStartRef.current;
            if (!current || !start || !svgRef.current) return;
            const svgW = svgRef.current.clientWidth || 1;
            const svgH = svgRef.current.clientHeight || 1;

            const scaleRatio = current.dist / (start.dist || 1);
            const currentZoom = defaultViewBox.vbW / start.viewBox.w;
            const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * scaleRatio));
            const nextW = defaultViewBox.vbW / nextZoom;
            const nextH = defaultViewBox.vbH / nextZoom;

            // Pan: centroid delta in SVG units, adjusted so the initial
            // centroid stays pinned to the same plan point at the new zoom.
            const svgToX = (clientX) =>
                start.viewBox.x + ((clientX - svgRef.current.getBoundingClientRect().left) / svgW) * start.viewBox.w;
            const svgToY = (clientY) =>
                start.viewBox.y + ((clientY - svgRef.current.getBoundingClientRect().top) / svgH) * start.viewBox.h;
            const anchorSvgX = svgToX(start.centroid.clientX);
            const anchorSvgY = svgToY(start.centroid.clientY);

            // Pin the anchor to the current centroid's position in the
            // viewport at the new scale.
            const currentAnchorFracX = (current.clientX - svgRef.current.getBoundingClientRect().left) / svgW;
            const currentAnchorFracY = (current.clientY - svgRef.current.getBoundingClientRect().top) / svgH;
            const nextX = anchorSvgX - currentAnchorFracX * nextW;
            const nextY = anchorSvgY - currentAnchorFracY * nextH;

            const next = { x: nextX, y: nextY, w: nextW, h: nextH };
            viewBoxRef.current = next;
            setViewBoxState(next);
            return;
        }

        // Desktop space+drag pan.
        if (panStartRef.current) {
            e.preventDefault();
            const svgEl = svgRef.current;
            const start = panStartRef.current;
            if (!svgEl || !start.viewBox) return;
            const rect = svgEl.getBoundingClientRect();
            const dxPx = e.clientX - start.clientX;
            const dyPx = e.clientY - start.clientY;
            const svgPerPxX = start.viewBox.w / (rect.width || 1);
            const svgPerPxY = start.viewBox.h / (rect.height || 1);
            const next = {
                x: start.viewBox.x - dxPx * svgPerPxX,
                y: start.viewBox.y - dyPx * svgPerPxY,
                w: start.viewBox.w,
                h: start.viewBox.h,
            };
            viewBoxRef.current = next;
            setViewBoxState(next);
            return;
        }

        // Lasso update
        if (!lasso) return;
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

    function onSvgDoubleClick(e) {
        if (!allowPanZoom || !defaultViewBox) return;
        // Reset to fit-staking. Lasso / click should not also fire — swallow it.
        e.stopPropagation();
        setViewBoxState({
            x: defaultViewBox.vbX,
            y: defaultViewBox.vbY,
            w: defaultViewBox.vbW,
            h: defaultViewBox.vbH,
        });
        setLasso(null);
    }

    // ── Empty state ──────────────────────────────────────────────
    // Rendered INSIDE the always-mounted wrapper div so containerRef
    // populates on first mount — the once-attached wheel listener
    // depends on this. If we short-circuited and returned a different
    // root element here, containerRef would stay null and the wheel
    // listener would never bind.
    const isEmpty = !defaultViewBox || !viewBoxState;

    if (isEmpty) {
        return (
            <div
                ref={containerRef}
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    minHeight: '300px',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    touchAction: 'none',
                    overscrollBehavior: 'contain',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-dark)',
                    color: 'var(--text-muted)',
                }}
            >
                <span style={{ fontSize: '13px' }}>
                    No design points loaded for this project yet.
                </span>
            </div>
        );
    }

    // ── Derived rendering values ─────────────────────────────────
    const vb = viewBoxState;
    const currentMaxDim = Math.max(vb.w, vb.h);

    // Size hierarchy: unselected (1x) < hovered (1.5x) < selected (2x).
    // Keyed off the CURRENT viewBox so a zoom-in doesn't inflate points.
    const baseRadius = currentMaxDim * 0.006;
    const hoverRadius = currentMaxDim * 0.009;
    const selectedRadius = currentMaxDim * 0.012;
    // Stage 8.5b: control triangles at 2× base so section corners and
    // benchmarks stand out immediately from the staking cluster.
    const controlSize = currentMaxDim * 0.012;

    // Grid step adapts to current visible extent.
    const gridStep = pickGridStep(Math.max(vb.w, vb.h));
    const startE = Math.floor(vb.x / gridStep) * gridStep;
    const endE = Math.ceil((vb.x + vb.w) / gridStep) * gridStep;
    const startN = Math.floor(-(vb.y + vb.h) / gridStep) * gridStep;
    const endN = Math.ceil(-vb.y / gridStep) * gridStep;
    const gridVertical = [];
    for (let e = startE; e <= endE; e += gridStep) gridVertical.push(e);
    const gridHorizontal = [];
    for (let n = startN; n <= endN; n += gridStep) gridHorizontal.push(n);

    // Arrow in top-right, scale bar in bottom-left — placed relative to
    // CURRENT viewBox so they stick to visible corners during pan/zoom.
    const arrowSize = Math.min(vb.w, vb.h) * 0.08;
    const arrowCx = vb.x + vb.w - arrowSize;
    const arrowCy = vb.y + arrowSize;

    // Scale bar
    const svgWidthPx = svgRef.current?.clientWidth || 600;
    const scale = pickScaleBar(vb.w, svgWidthPx);
    const sbLenSvg = scale.feet;
    const sbPadX = vb.w * 0.04;
    const sbPadY = vb.h * 0.06;
    const sbX = vb.x + sbPadX;
    const sbY = vb.y + vb.h - sbPadY;

    // ── Label-at-zoom threshold (Stage 8.5b) ─────────────────────
    // Approximate average point spacing on screen; show labels once the
    // canvas has enough room that text won't overlap its neighbor. The
    // count is taken over points CURRENTLY IN VIEW so zoom naturally
    // reveals labels as the user narrows the frame.
    const svgPerPx = vb.w / (svgWidthPx || 1);
    const pointsInView = designPoints.filter((p) => {
        if (typeof p.northing !== 'number' || typeof p.easting !== 'number') return false;
        const x = p.easting;
        const y = -p.northing;
        return x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h;
    });
    const visibleCount = Math.max(1, pointsInView.length);
    const screenSpacingPx = svgWidthPx / Math.sqrt(visibleCount);
    const showLabels = screenSpacingPx > 40;
    const labelSize = 10 * svgPerPx;
    const labelSizeSmall = 9 * svgPerPx;
    const labelHalo = Math.max(2 * svgPerPx, 0.3);
    const labelOffsetX = baseRadius * 1.6;

    const hoveredPoint = hoveredId ? designPoints.find((p) => p.id === hoveredId) : null;
    const hoveredIsControl =
        hoveredPoint ? classification.get(hoveredPoint.id) === 'control' : false;

    const cursorStyle = isPanning
        ? 'grabbing'
        : isSpaceDown && allowPanZoom
            ? 'grab'
            : 'crosshair';

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
                // Stop wheel events from chaining to a scrollable ancestor
                // (app-main-content has overflow: auto). Combined with the
                // container-scoped wheel listener, this guarantees the
                // canvas always sees its own scroll gestures.
                overscrollBehavior: 'contain',
            }}
        >
            <svg
                ref={svgRef}
                viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={`Design point plan — ${stakingPoints.length} staking, ${controlPoints.length} control`}
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    cursor: cursorStyle,
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
                onDoubleClick={onSvgDoubleClick}
            >
                {/* Grid */}
                <g>
                    {gridVertical.map((e, i) => (
                        <line
                            key={`v${i}`}
                            x1={e}
                            y1={vb.y}
                            x2={e}
                            y2={vb.y + vb.h}
                            stroke="var(--border-subtle)"
                            strokeOpacity="0.4"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
                    {gridHorizontal.map((n, i) => (
                        <line
                            key={`h${i}`}
                            x1={vb.x}
                            y1={-n}
                            x2={vb.x + vb.w}
                            y2={-n}
                            stroke="var(--border-subtle)"
                            strokeOpacity="0.4"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}
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

                {/* Control points (rendered first so staking can paint over them if
                    they happen to overlap visually at low zoom) */}
                {showControlPoints &&
                    controlPoints.map((p) => {
                        if (typeof p.northing !== 'number' || typeof p.easting !== 'number') return null;
                        const isHovered = hoveredId === p.id;
                        const r = controlSize;
                        const cx = p.easting;
                        const cy = -p.northing;
                        // Upward-pointing equilateral triangle, centered on (cx, cy).
                        const top = `${cx},${cy - r}`;
                        const bl = `${cx - r * 0.87},${cy + r * 0.5}`;
                        const br = `${cx + r * 0.87},${cy + r * 0.5}`;
                        return (
                            <polygon
                                key={p.id}
                                data-pid={p.id}
                                points={`${top} ${bl} ${br}`}
                                fill={isHovered ? 'var(--brand-amber)' : 'var(--text-muted)'}
                                stroke="var(--border-subtle)"
                                strokeWidth="1.5"
                                vectorEffect="non-scaling-stroke"
                                style={{ cursor: isSpaceDown ? 'grab' : 'default' }}
                                onPointerEnter={() => onHoverChange && onHoverChange(p.id)}
                                onPointerLeave={() => onHoverChange && onHoverChange(null)}
                                // No click handler — control points are reference
                                // geometry, not selectable.
                            />
                        );
                    })}

                {/* Staking points — shape + color keyed by feature code
                    (Stage 8.5b). Precedence: SELECTED amber > STATUS color
                    > FEATURE_CODE color > default teal. Hover swaps to
                    teal-light only in the default branch; status- and
                    feature-colored points keep their identity on hover
                    and enlarge instead. */}
                <g>
                    {stakingPoints.map((p) => {
                        if (typeof p.northing !== 'number' || typeof p.easting !== 'number') return null;
                        const isSelected = selectedIds && selectedIds.has(p.id);
                        const isHovered = hoveredId === p.id;
                        const statusKey = pointStatusMap ? pointStatusMap.get(p.id) : null;
                        const statusStyle = statusKey ? STATUS_STYLES[statusKey] : null;
                        const featureStyle = resolveFeatureStyle(p.feature_code);

                        let fill;
                        let r;
                        let shape = featureStyle.shape;
                        if (isSelected) {
                            fill = 'var(--brand-amber)';
                            r = selectedRadius;
                            // Selection keeps the feature shape — users need to
                            // see WHAT they selected, not just that it's selected.
                        } else if (statusStyle) {
                            fill = statusStyle.fill;
                            const statusR = baseRadius * statusStyle.radiusMul;
                            r = isHovered ? Math.max(hoverRadius, statusR) : statusR;
                        } else if (!featureStyle.unknown) {
                            // Feature-code color path. Hover enlarges but preserves
                            // the identity color — consistent with status-color UX.
                            fill = featureStyle.color;
                            const featureR = baseRadius * featureStyle.radiusMultiplier;
                            r = isHovered ? Math.max(hoverRadius, featureR) : featureR;
                        } else {
                            fill = isHovered ? 'var(--brand-teal-light)' : 'var(--brand-teal)';
                            r = isHovered ? hoverRadius : baseRadius;
                        }

                        return (
                            <PointGlyph
                                key={p.id}
                                pid={p.id}
                                shape={shape}
                                cx={p.easting}
                                cy={-p.northing}
                                r={r}
                                fill={fill}
                                stroke="rgba(255,255,255,0.15)"
                                strokeWidth="0.5"
                                cursor={isSpaceDown ? 'grab' : 'pointer'}
                                onEnter={() => onHoverChange && onHoverChange(p.id)}
                                onLeave={() => onHoverChange && onHoverChange(null)}
                                onClick={(e) => {
                                    if (isPanning || isSpaceDown) return;
                                    e.stopPropagation();
                                    togglePoint(p.id);
                                }}
                            />
                        );
                    })}
                </g>

                {/* Labels at zoom (Stage 8.5b). Rendered AFTER points so
                    text sits on top; halo via paint-order stroke keeps
                    them readable over any point color. */}
                {showLabels && (
                    <g style={{ pointerEvents: 'none' }}>
                        {pointsInView.map((p) => {
                            const cx = p.easting + labelOffsetX;
                            const cy = -p.northing;
                            return (
                                <g key={`lbl-${p.id}`}>
                                    <text
                                        x={cx}
                                        y={cy - labelSize * 0.2}
                                        fill="var(--text-main)"
                                        stroke="rgba(10, 15, 30, 0.85)"
                                        strokeWidth={labelHalo}
                                        paintOrder="stroke"
                                        fontSize={labelSize}
                                        fontFamily="'JetBrains Mono', monospace"
                                        textAnchor="start"
                                    >
                                        {p.point_id}
                                    </text>
                                    {p.feature_code && (
                                        <text
                                            x={cx}
                                            y={cy + labelSizeSmall * 1.1}
                                            fill="var(--text-muted)"
                                            stroke="rgba(10, 15, 30, 0.85)"
                                            strokeWidth={labelHalo}
                                            paintOrder="stroke"
                                            fontSize={labelSizeSmall}
                                            fontFamily="'JetBrains Mono', monospace"
                                            textAnchor="start"
                                        >
                                            {p.feature_code}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                )}

                {/* North arrow (top-right of current viewBox) */}
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

                {/* Scale bar (bottom-left of current viewBox) */}
                <g>
                    <line
                        x1={sbX}
                        y1={sbY}
                        x2={sbX + sbLenSvg}
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
                        x1={sbX + sbLenSvg}
                        y1={sbY - arrowSize * 0.15}
                        x2={sbX + sbLenSvg}
                        y2={sbY + arrowSize * 0.15}
                        stroke="var(--text-muted)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                    />
                    <text
                        x={sbX + sbLenSvg / 2}
                        y={sbY + arrowSize * 0.45}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                        fontSize={arrowSize * 0.4}
                        fontFamily="'JetBrains Mono', monospace"
                    >
                        {scale.feet} ft
                    </text>
                </g>
            </svg>

            {/* Pan-mode badge */}
            {isSpaceDown && allowPanZoom && (
                <div style={panBadgeStyle}>PAN</div>
            )}

            {/* Tooltip */}
            {hoveredPoint && cursor && containerRef.current && (
                <Tooltip
                    ref={tooltipRef}
                    measuredRef={tooltipMeasuredRef}
                    point={hoveredPoint}
                    cursor={cursor}
                    containerEl={containerRef.current}
                    extraPointData={extraPointData}
                    isControl={hoveredIsControl}
                />
            )}
        </div>
    );
}

// ── PointGlyph ────────────────────────────────────────────────────────
// One-stop shape renderer for staking points. Every glyph variant carries
// data-pid on every primitive so onSvgPointerDown's hit-test finds it
// regardless of which sub-shape the cursor is over (important for the
// two-rect `plus` and multi-line shapes). Handlers bind to every
// primitive too — redundant but simpler than a wrapping <g> that
// disables child pointer events.
function PointGlyph({
    pid,
    shape,
    cx,
    cy,
    r,
    fill,
    stroke,
    strokeWidth,
    cursor,
    onEnter,
    onLeave,
    onClick,
}) {
    const common = {
        'data-pid': pid,
        fill,
        stroke,
        strokeWidth,
        vectorEffect: 'non-scaling-stroke',
        style: { cursor },
        onPointerEnter: onEnter,
        onPointerLeave: onLeave,
        onClick,
    };

    switch (shape) {
        case 'square':
            return (
                <rect
                    x={cx - r}
                    y={cy - r}
                    width={r * 2}
                    height={r * 2}
                    {...common}
                />
            );
        case 'triangle': {
            // Upward-pointing equilateral, matches the control-point glyph.
            const top = `${cx},${cy - r}`;
            const bl = `${cx - r * 0.87},${cy + r * 0.5}`;
            const br = `${cx + r * 0.87},${cy + r * 0.5}`;
            return <polygon points={`${top} ${bl} ${br}`} {...common} />;
        }
        case 'plus': {
            const bar = r * 0.45;
            return (
                <>
                    <rect
                        x={cx - r}
                        y={cy - bar / 2}
                        width={r * 2}
                        height={bar}
                        {...common}
                    />
                    <rect
                        x={cx - bar / 2}
                        y={cy - r}
                        width={bar}
                        height={r * 2}
                        {...common}
                    />
                </>
            );
        }
        case 'octagon': {
            // Regular octagon with edges axis-aligned — rotate vertices by
            // π/8 from the standard position.
            const pts = [];
            for (let i = 0; i < 8; i++) {
                const ang = (Math.PI / 4) * i + Math.PI / 8;
                pts.push(`${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`);
            }
            return <polygon points={pts.join(' ')} {...common} />;
        }
        case 'circle':
        default:
            return <circle cx={cx} cy={cy} r={r} {...common} />;
    }
}

// ── Tooltip ───────────────────────────────────────────────────────────
// Smart positioning: the tooltip prefers "below-right of cursor" but flips
// to above or left if it would overflow the canvas bounds. We guess the
// tooltip height on first render (small vs. tall), then measure the real
// height after mount via tooltipMeasuredRef.

const Tooltip = React.forwardRef(function Tooltip(
    { point, cursor, containerEl, extraPointData, isControl, measuredRef },
    ref,
) {
    const localRef = useRef(null);
    const extra = extraPointData ? extraPointData.get(point.id) : null;

    // Measure on mount / point change so the flip math has a real size
    // on the next render.
    useEffect(() => {
        const el = localRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (measuredRef) {
            measuredRef.current = { w: rect.width, h: rect.height };
        }
    }, [point.id, extra, isControl, measuredRef]);

    const rect = containerEl.getBoundingClientRect();
    const measured = measuredRef?.current;
    const w = measured?.w || TOOLTIP_BASE_W;
    const h = measured?.h || (extra ? TOOLTIP_EXTRA_H : TOOLTIP_BASE_H);

    // Default: below-right of cursor
    let left = cursor.x - rect.left + TOOLTIP_EDGE_GAP;
    let top = cursor.y - rect.top + TOOLTIP_EDGE_GAP;

    // Flip horizontally if we'd overflow the right edge
    if (left + w > rect.width - 8) {
        left = cursor.x - rect.left - TOOLTIP_EDGE_GAP - w;
    }
    // Flip vertically if we'd overflow the bottom edge
    if (top + h > rect.height - 8) {
        top = cursor.y - rect.top - TOOLTIP_EDGE_GAP - h;
    }

    // Final clamp so a tiny canvas doesn't push the card off-screen in
    // the opposite direction.
    left = Math.max(8, Math.min(left, rect.width - w - 8));
    top = Math.max(8, Math.min(top, rect.height - h - 8));

    return (
        <div
            ref={(el) => {
                localRef.current = el;
                if (typeof ref === 'function') ref(el);
                else if (ref) ref.current = el;
            }}
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
            {isControl && (
                <div
                    style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        marginBottom: '6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(148, 163, 184, 0.14)',
                        color: 'var(--text-muted)',
                        fontSize: '10px',
                        letterSpacing: '0.6px',
                        fontWeight: 700,
                    }}
                >
                    CONTROL
                </div>
            )}
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
            {extra && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    {extra.status && (
                        <div
                            style={{
                                color: STATUS_COLORS[extra.status] || 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: '12px',
                                marginBottom: '4px',
                            }}
                        >
                            {STATUS_LABELS[extra.status] || extra.status}
                        </div>
                    )}
                    {extra.deltaH != null && extra.toleranceH != null && (
                        <div
                            className="coordinate-data"
                            style={{
                                color:
                                    extra.status === 'out_of_tol'
                                        ? 'var(--error)'
                                        : 'var(--text-main)',
                                fontSize: '11.5px',
                            }}
                        >
                            ΔH {Number(extra.deltaH).toFixed(3)} / {Number(extra.toleranceH).toFixed(3)} tol
                            {extra.status === 'out_of_tol' &&
                                Number.isFinite(extra.deltaH) &&
                                Number.isFinite(extra.toleranceH) && (
                                    <span style={{ color: 'var(--error)' }}>
                                        {' '}
                                        = {(Number(extra.deltaH) - Number(extra.toleranceH)).toFixed(3)} over
                                    </span>
                                )}
                        </div>
                    )}
                    {extra.deltaZ != null && (
                        <div
                            className="coordinate-data"
                            style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}
                        >
                            ΔZ {Number(extra.deltaZ).toFixed(3)}
                        </div>
                    )}
                    {extra.fieldFitReason && (
                        <div
                            style={{
                                color: 'var(--brand-amber)',
                                fontSize: '11px',
                                marginTop: '4px',
                                fontFamily: "'Inter', sans-serif",
                            }}
                        >
                            {extra.fieldFitReason.replace(/_/g, ' ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

// ── Styles ─────────────────────────────────────────────────────────────

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

const panBadgeStyle = {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '4px 10px',
    backgroundColor: 'rgba(10, 15, 30, 0.85)',
    border: '1px solid var(--brand-teal-light)',
    borderRadius: '999px',
    color: 'var(--brand-teal-light)',
    fontSize: '10.5px',
    fontWeight: 700,
    letterSpacing: '1px',
    fontFamily: "'JetBrains Mono', monospace",
    pointerEvents: 'none',
    zIndex: 6,
};
