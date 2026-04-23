import React from 'react';
import { X } from 'lucide-react';
import { FEATURE_GROUPS } from './featureCodeGroups.js';
import { FEATURE_CODE_STYLES, featureName } from './featureCodeStyles.js';

// ─── FeatureLegend ────────────────────────────────────────────────────
// Floating panel anchored top-right of the canvas area. Shows feature
// codes grouped by family, with a mini-glyph matching the canvas
// rendering. Groups that are filtered OUT of the current view render at
// reduced opacity so the user can tell "this exists but is hidden".
// Control is a pseudo-group and doesn't list individual codes — it just
// renders a single Control row with the triangle glyph.

const PANEL_W = 280;

function MiniGlyph({ shape, color, size = 10 }) {
    const half = size / 2;
    const commonProps = {
        fill: color,
        stroke: 'rgba(255,255,255,0.2)',
        strokeWidth: 0.5,
    };
    let inner = null;
    switch (shape) {
        case 'square':
            inner = <rect x={-half} y={-half} width={size} height={size} {...commonProps} />;
            break;
        case 'triangle': {
            const top = `0,${-half}`;
            const bl = `${-half * 0.87},${half * 0.5}`;
            const br = `${half * 0.87},${half * 0.5}`;
            inner = <polygon points={`${top} ${bl} ${br}`} {...commonProps} />;
            break;
        }
        case 'plus': {
            const bar = size * 0.4;
            inner = (
                <>
                    <rect x={-half} y={-bar / 2} width={size} height={bar} {...commonProps} />
                    <rect x={-bar / 2} y={-half} width={bar} height={size} {...commonProps} />
                </>
            );
            break;
        }
        case 'octagon': {
            const pts = [];
            for (let i = 0; i < 8; i++) {
                const ang = (Math.PI / 4) * i + Math.PI / 8;
                pts.push(`${half * Math.cos(ang)},${half * Math.sin(ang)}`);
            }
            inner = <polygon points={pts.join(' ')} {...commonProps} />;
            break;
        }
        case 'circle':
        default:
            inner = <circle cx={0} cy={0} r={half} {...commonProps} />;
    }
    return (
        <svg
            width={size + 4}
            height={size + 4}
            viewBox={`${-half - 2} ${-half - 2} ${size + 4} ${size + 4}`}
            style={{ flex: '0 0 auto' }}
        >
            {inner}
        </svg>
    );
}

function Row({ label, name, shape, color, dim }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '5px 4px',
                opacity: dim ? 0.4 : 1,
            }}
        >
            <MiniGlyph shape={shape} color={color} size={12} />
            <span
                className="coordinate-data"
                style={{
                    color: 'var(--brand-amber)',
                    fontSize: '11px',
                    fontWeight: 700,
                    minWidth: '42px',
                }}
            >
                {label}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>{name}</span>
        </div>
    );
}

export default function FeatureLegend({ visible, onClose, filterState }) {
    if (!visible) return null;

    function groupIsActive(id) {
        if (!filterState) return true;
        return filterState.has(id);
    }

    return (
        <div
            role="dialog"
            aria-label="Feature legend"
            style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: `${PANEL_W}px`,
                maxHeight: '60%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'rgba(10, 15, 30, 0.96)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
                zIndex: 8,
                color: 'var(--text-main)',
                fontFamily: 'inherit',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}
            >
                <h4
                    style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px',
                    }}
                >
                    Feature legend
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close legend"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            <div
                data-canvas-scroll-region="true"
                style={{
                    overflowY: 'auto',
                    padding: '10px 12px',
                    flex: 1,
                }}
            >
                {FEATURE_GROUPS.map((g) => {
                    const dim = !groupIsActive(g.id);
                    if (g.isControl) {
                        return (
                            <div key={g.id} style={{ marginBottom: '10px' }}>
                                <div style={groupHeader}>{g.label}</div>
                                <Row
                                    label="CP/BM"
                                    name="Control points (section corners, benchmarks, etc.)"
                                    shape="triangle"
                                    color="var(--text-muted)"
                                    dim={dim}
                                />
                            </div>
                        );
                    }
                    if (g.isUnknown) {
                        return (
                            <div key={g.id} style={{ marginBottom: '10px' }}>
                                <div style={groupHeader}>{g.label}</div>
                                <Row
                                    label="—"
                                    name="Codes not in the standard palette"
                                    shape="circle"
                                    color="#6B7280"
                                    dim={dim}
                                />
                            </div>
                        );
                    }
                    return (
                        <div key={g.id} style={{ marginBottom: '10px' }}>
                            <div style={groupHeader}>{g.label}</div>
                            {g.codes.map((code) => {
                                const style = FEATURE_CODE_STYLES[code];
                                if (!style) return null;
                                return (
                                    <Row
                                        key={code}
                                        label={code}
                                        name={featureName(code)}
                                        shape={style.shape}
                                        color={style.color}
                                        dim={dim}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

const groupHeader = {
    color: 'var(--text-muted)',
    fontSize: '10px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
    fontWeight: 700,
    marginBottom: '4px',
    marginTop: '2px',
};
