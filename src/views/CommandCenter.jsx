import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { DispatchProjectDrawer } from './DispatchBoard';
import DeploymentModal from '../components/DeploymentModal';
import IntelligenceDrawer from './IntelligenceDrawer';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Map Config ──
const MAP_CENTER = [33.4484, -112.0740]; // Phoenix, AZ
const MAP_ZOOM = 10;
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ── Map markers (Stage 12.1.7 — Session 4) ─────────────────────────
// Benchmark / control-point SVG marker. Concentric ring + crosshair
// lines + center dot, colored by project status. Brand-iconography
// replacement for the iOS-palette glow pulses that pre-dated the
// brand visual identity.
//
// Color mapping uses literal hex matching index.css vars so the SVG
// renders correctly inside Leaflet's divIcon HTML (CSS variable
// resolution inside divIcon shadow contexts is unreliable across
// browsers).
const MARKER_COLOR_PENDING = '#D4912A'; // var(--brand-amber)
const MARKER_COLOR_ACTIVE  = '#1A6B6B'; // var(--brand-teal-light)
const MARKER_COLOR_DONE    = '#10B981'; // var(--success)
const MARKER_COLOR_DEFAULT = '#94A3B8'; // var(--text-muted)

function makeBenchmarkIcon(color) {
  const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <line x1="9" y1="0" x2="9" y2="18" stroke="${color}" stroke-width="1" opacity="0.7" />
    <line x1="0" y1="9" x2="18" y2="9" stroke="${color}" stroke-width="1" opacity="0.7" />
    <circle cx="9" cy="9" r="7" fill="none" stroke="${color}" stroke-width="1.5" />
    <circle cx="9" cy="9" r="1.5" fill="${color}" />
  </svg>`;
  return L.divIcon({
    className: 'surveyos-benchmark-marker',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: svg,
  });
}

const ICON_PENDING = makeBenchmarkIcon(MARKER_COLOR_PENDING);
const ICON_ACTIVE  = makeBenchmarkIcon(MARKER_COLOR_ACTIVE);
const ICON_DONE    = makeBenchmarkIcon(MARKER_COLOR_DONE);
const ICON_DEFAULT = makeBenchmarkIcon(MARKER_COLOR_DEFAULT);

// Phoenix metro landmarks used as deterministic fallback positions
const PHX_SITES = [
  [33.4484, -112.0740], [33.6712, -112.1150], [33.3062, -111.8413], 
  [33.5092, -111.8985], [33.4152, -111.8315], [33.3528, -112.0671], 
  [33.5386, -112.1860], [33.6189, -111.7264], [33.3942, -112.1738], 
  [33.4942, -112.0424],
];

// Assigns stable coords near Phoenix when project has no lat/lng
function getProjectCoords(proj, index) {
  if (proj.lat && proj.lng) return [proj.lat, proj.lng];
  const seed = proj.id ? proj.id.charCodeAt(0) + proj.id.charCodeAt(1) : index;
  const base = PHX_SITES[(seed + index) % PHX_SITES.length];
  const jitterLat = ((seed * 7 + index * 3) % 50 - 25) * 0.001;
  const jitterLng = ((seed * 11 + index * 7) % 50 - 25) * 0.001;
  return [base[0] + jitterLat, base[1] + jitterLng];
}

function getMarkerIcon(status) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'dispatched' || s === 'in_progress') return ICON_ACTIVE;
  if (s === 'pending' || s === 'unassigned') return ICON_PENDING;
  if (s === 'field_complete') return ICON_DONE;
  return ICON_DEFAULT;
}

const inputStyle = {
  width: '100%', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)',
  padding: '12px', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box',
};

// ── Recent Invoices ────────────────────────────────────────────────
// Status pill styling — instrument feel (3px radius, mono caps,
// transparent fill, accent-colored 1px border + text). This pattern
// is intentionally local to RecentInvoicesPanel for now; Stage 12.1.7
// later sessions will lift it to a shared phase-aware status pill.
const INVOICE_PILL_STYLES = {
  PAID:    { color: 'var(--brand-teal-light)' },
  SENT:    { color: 'var(--text-main)' },
  OVERDUE: { color: 'var(--brand-amber)' },
  DRAFT:   { color: 'var(--text-muted)' },
};

function formatInvoiceUSD(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function InvoiceStatusPill({ status }) {
  const norm = (status || '').toString().toUpperCase();
  const style = INVOICE_PILL_STYLES[norm] || INVOICE_PILL_STYLES.DRAFT;
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '3px',
      border: `1px solid ${style.color}`,
      color: style.color,
      backgroundColor: 'transparent',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.62em',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {norm || 'DRAFT'}
    </span>
  );
}

// ── SectionHeader (Stage 12.1.7 — Session 3) ──────────────────────
// Shared card-internal header. Three call sites: RecentInvoicesPanel,
// ActiveProjectsByTypePanel, FinancialPulsePanel. Triangle indicator
// borrowed from the design exploration PNG (▴ FINANCIAL PULSE etc.) —
// applied uniformly so the three panels read as one design language.
function SectionHeader({ children }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      backgroundColor: 'rgba(0,0,0,0.2)',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.72em',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      <span style={{ color: 'var(--brand-teal-light)', opacity: 0.7 }}>▴</span>
      <span>{children}</span>
    </div>
  );
}

function RecentInvoicesPanel({ invoices, loading, error, onOpenProject }) {
  const sectionStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    overflow: 'hidden',
  };
  const rowStyle = (isLast) => ({
    padding: '12px 16px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  });

  let body;
  if (loading) {
    body = (
      <div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={rowStyle(i === 4)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ height: '12px', width: '55%', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
              <div style={{ height: '12px', width: '20%', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
            </div>
            <div style={{ height: '14px', width: '60px', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em' }}>
        Unable to load invoices.
      </div>
    );
  } else if (!invoices || invoices.length === 0) {
    body = (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em', fontStyle: 'italic' }}>
        No invoices yet.
      </div>
    );
  } else {
    body = (
      <div>
        {invoices.map((proj, idx) => {
          const isLast = idx === invoices.length - 1;
          return (
            <div
              key={proj.id}
              onClick={() => onOpenProject && onOpenProject(proj)}
              style={rowStyle(isLast)}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '6px' }}>
                <strong style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '0.9em',
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {proj.project_name || 'Untitled project'}
                </strong>
                <span className="coordinate-data" style={{
                  fontSize: '0.85em',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                }}>
                  {formatInvoiceUSD(proj.invoice_amount)}
                </span>
              </div>
              <InvoiceStatusPill status={proj.invoice_status} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <SectionHeader>Recent Invoices</SectionHeader>
      {body}
    </div>
  );
}

// ── Active Projects by Type (Stage 12.1.7 — Session 2) ─────────────
// Communicates "OS for ALL surveying" at a glance. Schema-free; uses
// existing projects.scope jsonb (multi-select array). Canonical
// vocabulary lives in DeploymentModal.jsx SCOPE_OPTIONS; the panel
// renders whatever values it finds, so off-vocabulary scopes (CSV
// imports, hand-edits) surface visibly rather than silently drop.
//
// Filter mirrors activeProjects (status !== archived/completed AND
// reviewed_at IS NULL) so the panel and the Active tab agree on
// which projects count. Search-narrowing inherits because the panel
// consumes the same memoized list.
//
// Scope occurrences > project count is expected: projects span
// multiple scopes (a job can be both Boundary and Topographic).
function ActiveProjectsByTypePanel({ projects, loading, error }) {
  const sectionStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    overflow: 'hidden',
  };
  const subHeaderStyle = {
    padding: '8px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'rgba(0,0,0,0.1)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.7em',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  };
  const rowStyle = (isLast) => ({
    padding: '12px 16px',
    borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
  });

  const scopeCounts = {};
  let activeCount = 0;
  let scopeOccurrences = 0;
  let computeError = false;

  if (!loading && !error && Array.isArray(projects)) {
    try {
      activeCount = projects.length;
      for (const p of projects) {
        const scopes = Array.isArray(p?.scope) ? p.scope : [];
        for (const s of scopes) {
          if (typeof s !== 'string') continue;
          const key = s.trim();
          if (!key) continue;
          scopeCounts[key] = (scopeCounts[key] || 0) + 1;
          scopeOccurrences += 1;
        }
      }
    } catch (e) {
      console.error('[ActiveProjectsByType] scope count failed:', e);
      computeError = true;
    }
  }

  const sortedScopes = Object.entries(scopeCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxCount = sortedScopes.length > 0 ? sortedScopes[0][1] : 0;

  let body;
  if (loading) {
    body = (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={rowStyle(i === 3)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div style={{ height: '12px', width: '45%', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
              <div style={{ height: '12px', width: '24px', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
            </div>
            <div style={{ height: '6px', width: `${85 - i * 18}%`, backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
          </div>
        ))}
      </div>
    );
  } else if (error || computeError) {
    body = (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em' }}>
        Unable to load projects.
      </div>
    );
  } else if (sortedScopes.length === 0) {
    body = (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em', fontStyle: 'italic' }}>
        No active projects yet.
      </div>
    );
  } else {
    body = (
      <div>
        {sortedScopes.map(([scope, count], idx) => {
          const isLast = idx === sortedScopes.length - 1;
          const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={scope} style={rowStyle(isLast)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '0.9em',
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {scope}
                </span>
                <span className="coordinate-data" style={{
                  fontSize: '0.85em',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                }}>
                  {count}
                </span>
              </div>
              <div style={{
                height: '6px',
                backgroundColor: 'var(--border-subtle)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${widthPct}%`,
                  backgroundColor: 'var(--brand-teal-light)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const showSubHeader = !loading && !error && !computeError && sortedScopes.length > 0;

  return (
    <div style={sectionStyle}>
      <SectionHeader>Active Projects by Type</SectionHeader>
      {showSubHeader && (
        <div style={subHeaderStyle}>
          <span>Active: <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{activeCount}</span></span>
          <span style={{ color: 'var(--border-subtle)' }}>·</span>
          <span>Scope occurrences: <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{scopeOccurrences}</span></span>
        </div>
      )}
      {body}
    </div>
  );
}

// ── Financial Pulse (Stage 12.1.7 — Session 3) ─────────────────────
// Four-card strip: Revenue YTD, WIP Unbilled, AR > 30 Days, Crews
// Deployed. Source: projects.invoice_* columns + crew_utilization
// view. The Stripe-style public.invoices/public.payments tables in
// migration 02 don't exist in production (audit pending — Stage 13
// carry-forward). Revenue YTD and AR aging timing approximate
// because no invoice_paid_at/invoice_sent_at columns exist on
// projects — created_at is used as proxy. Stage 13 carry-forward
// to add proper timing columns or migrate to Stripe-style tables.
//
// Per-card error swallowing: a failed fetch shows '—' on that card
// alone; the strip stays visible. Zero values render with semantic
// accent — AR > 30 = $0 is healthy (mint), AR > 30 > 0 is warning
// (amber).
function FinancialPulsePanel({ stats }) {
  const sectionStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    overflow: 'hidden',
  };
  const labelStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65em',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  };
  const valueBaseStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '1.9em',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  };
  const subStyle = {
    fontSize: '0.72em',
    color: 'var(--text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.02em',
  };

  const cards = [
    {
      key: 'revenueYtd',
      label: 'Revenue YTD',
      stat: stats.revenueYtd,
      formatValue: (s) => formatInvoiceUSD(s.value),
      formatSub: (s) => s.value > 0 ? 'paid this year' : 'no paid invoices yet',
      isZero: (s) => !(s.value > 0),
      accent: () => null,
    },
    {
      key: 'wip',
      label: 'WIP Unbilled',
      stat: stats.wip,
      formatValue: (s) => formatInvoiceUSD(s.value),
      formatSub: (s) => s.value > 0 ? 'active contracts' : 'no active contracts',
      isZero: (s) => !(s.value > 0),
      accent: () => null,
    },
    {
      key: 'arOver30',
      label: 'AR > 30 Days',
      stat: stats.arOver30,
      formatValue: (s) => formatInvoiceUSD(s.value),
      formatSub: (s) => s.value > 0 ? 'sent · overdue' : 'nothing aged',
      isZero: (s) => !(s.value > 0),
      accent: (s) => s.value > 0 ? 'var(--brand-amber)' : 'var(--brand-teal-light)',
    },
    {
      key: 'crewsDeployed',
      label: 'Crews Deployed',
      stat: stats.crewsDeployed,
      formatValue: (s) => s.denominator === 0 ? '—' : `${s.numerator} / ${s.denominator}`,
      formatSub: (s) => {
        if (s.denominator === 0) return 'no crew roster';
        if (s.numerator === 0) return 'no active assignments';
        const pct = Math.round((s.numerator / s.denominator) * 100);
        return `${pct}% deployed`;
      },
      isZero: (s) => s.numerator === 0,
      accent: () => null,
    },
  ];

  return (
    <div style={sectionStyle}>
      <SectionHeader>Financial Pulse</SectionHeader>
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        {cards.map((card, idx) => {
          const isLast = idx === cards.length - 1;
          const stat = card.stat;
          const accentColor = stat && !stat.loading && !stat.error ? card.accent(stat) : null;

          let valueRender;
          let subRender;
          if (!stat || stat.loading) {
            valueRender = (
              <div style={{ height: '32px', width: '70%', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
            );
            subRender = (
              <div style={{ height: '10px', width: '50%', backgroundColor: 'var(--border-subtle)', borderRadius: '3px' }} />
            );
          } else if (stat.error) {
            valueRender = <span style={{ ...valueBaseStyle, color: 'var(--text-muted)' }}>—</span>;
            subRender = <span style={subStyle}>unable to load</span>;
          } else {
            const zero = card.isZero(stat);
            valueRender = (
              <span style={{
                ...valueBaseStyle,
                color: zero ? 'var(--text-muted)' : 'var(--text-main)',
              }}>
                {card.formatValue(stat)}
              </span>
            );
            subRender = <span style={subStyle}>{card.formatSub(stat)}</span>;
          }

          return (
            <div key={card.key} style={{
              flex: '1 1 200px',
              minWidth: '180px',
              padding: '18px 20px 20px 20px',
              borderRight: !isLast ? '1px solid var(--border-subtle)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minHeight: '120px',
              position: 'relative',
            }}>
              {accentColor && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: '2px',
                  backgroundColor: accentColor,
                }} />
              )}
              <div style={labelStyle}>{card.label}</div>
              {valueRender}
              {subRender}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CommandCenter({ profile, projects, teamMembers, onProjectSelect, onCreateProject, onArchiveProject, onProjectUpdate }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [feeType, setFeeType] = useState('lump_sum');
  const [contractFee, setContractFee] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [hideFinancials, setHideFinancials] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [drawerProject, setDrawerProject] = useState(null);
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [isDeploying, setIsDeploying] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const [activeTab, setActiveTab] = useState('operations');
  const [teamRoster, setTeamRoster] = useState([]);

  // Recent Invoices (Stage 12.1.7 — Session 1)
  // RLS-scoped via Migration 21 "Office roles manage firm projects" — no
  // client-side firm_id filter needed. Filter on the four display statuses
  // because invoice_status defaults to 'unbilled' (Migration 20), so a NOT
  // NULL filter would surface every project.
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState(false);

  // Financial Pulse (Stage 12.1.7 — Session 3). Three parallel
  // fetches: paid-this-year for Revenue YTD, outstanding invoices
  // for AR > 30 (filtered client-side by created_at cutoff), and
  // crew_utilization view for Crews Deployed. WIP is derived from
  // activeProjects below — same source the Active tab uses, so
  // the panel inherits search-narrowing for free. Per-card error
  // swallowing: any single fetch failure shows '—' on its card
  // without blanking the strip.
  const [pulseRevenue, setPulseRevenue] = useState({ value: 0, loading: true, error: false });
  const [pulseAr, setPulseAr] = useState({ value: 0, loading: true, error: false });
  const [pulseCrews, setPulseCrews] = useState({ numerator: 0, denominator: 0, loading: true, error: false });

  useEffect(() => { fetchTeam(); fetchRecentInvoices(); fetchFinancialPulse(); }, []);

  const fetchFinancialPulse = async () => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const [revenueResult, arResult, crewsResult] = await Promise.allSettled([
      supabase
        .from('projects')
        .select('invoice_amount')
        .eq('invoice_status', 'paid')
        .gte('created_at', yearStart),
      supabase
        .from('projects')
        .select('invoice_amount, created_at')
        .in('invoice_status', ['sent', 'overdue']),
      supabase
        .from('crew_utilization')
        .select('user_id, role, active_load')
        .in('role', ['pm', 'field_crew']),
    ]);

    if (revenueResult.status === 'fulfilled' && !revenueResult.value.error) {
      const sum = (revenueResult.value.data || []).reduce(
        (acc, p) => acc + Number(p.invoice_amount || 0), 0
      );
      setPulseRevenue({ value: sum, loading: false, error: false });
    } else {
      console.error('[FinancialPulse] revenue fetch failed:', revenueResult);
      setPulseRevenue({ value: 0, loading: false, error: true });
    }

    if (arResult.status === 'fulfilled' && !arResult.value.error) {
      const sum = (arResult.value.data || [])
        .filter(p => new Date(p.created_at).getTime() < cutoffMs)
        .reduce((acc, p) => acc + Number(p.invoice_amount || 0), 0);
      setPulseAr({ value: sum, loading: false, error: false });
    } else {
      console.error('[FinancialPulse] AR fetch failed:', arResult);
      setPulseAr({ value: 0, loading: false, error: true });
    }

    if (crewsResult.status === 'fulfilled' && !crewsResult.value.error) {
      const rows = crewsResult.value.data || [];
      const denominator = rows.length;
      const numerator = rows.filter(r => Number(r.active_load) > 0).length;
      setPulseCrews({ numerator, denominator, loading: false, error: false });
    } else {
      console.error('[FinancialPulse] crews fetch failed:', crewsResult);
      setPulseCrews({ numerator: 0, denominator: 0, loading: false, error: true });
    }
  };

  const fetchRecentInvoices = async () => {
    setInvoicesLoading(true);
    setInvoicesError(false);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .in('invoice_status', ['paid', 'sent', 'overdue', 'draft'])
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      console.error('[RecentInvoices] query failed:', error);
      setInvoicesError(true);
      setRecentInvoices([]);
    } else {
      setRecentInvoices(data || []);
    }
    setInvoicesLoading(false);
  };

  const fetchTeam = async () => {
    const { data, error } = await supabase.from('user_profiles').select('id, first_name, last_name, email, role').eq('firm_id', profile?.firm_id);
    if (!error && data && data.length > 0) { setTeamRoster(data); } 
    else {
      setTeamRoster([
        { id: 'mock-1', first_name: 'Theo', last_name: 'Bower', email: 'theo@surveyos.com', role: 'admin' },
        { id: 'mock-2', first_name: 'Marcus', last_name: 'Rivera', email: 'marcus@surveyos.com', role: 'pm' },
      ]);
    }
  };

  const isAdminOrOwner = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'pm';

  // ─── Queue segmentation ───────────────────────────────────────
  // 'active'  → pending / in_progress / scheduled (operational)
  // 'review'  → completed_at set, reviewed_at null (PM approval inbox)
  // 'done'    → reviewed_at set OR archived (read-only history)
  const [queueTab, setQueueTab] = useState('active');

  const allMatchSearch = (proj) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (proj?.project_name || '').toLowerCase().includes(q) || (proj?.id || '').toLowerCase().includes(q);
  };

  const activeProjects = useMemo(() => (projects || []).filter(p => {
    if (p.status === 'archived') return false;
    if (p.status === 'completed') return false;
    if (p.reviewed_at) return false;
    return allMatchSearch(p);
  }), [projects, searchQuery]);

  // WIP — sum of contract_fee for active projects whose invoice
  // hasn't been issued yet. Mirrors activeProjects exactly so the
  // panel and the Active tab agree, and inherits search-narrowing.
  const pulseWip = useMemo(() => {
    try {
      const sum = activeProjects
        .filter(p => !['paid', 'sent', 'overdue'].includes((p.invoice_status || '').toLowerCase()))
        .reduce((acc, p) => acc + Number(p.contract_fee || 0), 0);
      return { value: sum, loading: false, error: false };
    } catch (e) {
      console.error('[FinancialPulse] WIP compute failed:', e);
      return { value: 0, loading: false, error: true };
    }
  }, [activeProjects]);

  const pulseStats = {
    revenueYtd: pulseRevenue,
    wip: pulseWip,
    arOver30: pulseAr,
    crewsDeployed: pulseCrews,
  };

  const reviewProjects = useMemo(() => (projects || []).filter(p => {
    if (p.status === 'archived') return false;
    if (!p.completed_at) return false;
    if (p.reviewed_at) return false;
    return allMatchSearch(p);
  }), [projects, searchQuery]);

  const doneProjects = useMemo(() => (projects || []).filter(p => {
    if (p.reviewed_at || p.status === 'archived') return allMatchSearch(p);
    return false;
  }), [projects, searchQuery]);

  const filteredProjects =
    queueTab === 'review' ? reviewProjects :
    queueTab === 'done' ? doneProjects :
    activeProjects;

  const [manifest, setManifest] = useState({ 'Total Station': false, 'GNSS Rover': false, 'Base Station': false, 'Data Collector': false, 'Drone / UAV': false });

  return (
    <div style={{ width: '100%', maxWidth: '100%', animation: 'fadeIn 0.5s ease-out' }}>

      {/* HEADER */}
      <div style={{ padding: '30px', background: 'linear-gradient(135deg, var(--brand-teal) 0%, #062C2C 100%)', borderRadius: '16px', marginBottom: '40px', border: '1px solid var(--brand-teal-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: 0, fontSize: '1.8em', letterSpacing: '-0.5px' }}>
          {(() => {
            const h = new Date().getHours();
            return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
          })()}, {profile?.first_name || 'Operator'}.
        </h2>
        <p style={{ margin: '10px 0 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '1em' }}>System Online. {projects?.length || 0} active projects in the network.</p>
      </div>

      {/* TAB BAR */}
      {isAdminOrOwner && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '30px', backgroundColor: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid var(--border-subtle)' }}>
          <button onClick={() => setActiveTab('operations')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85em', backgroundColor: activeTab === 'operations' ? 'var(--brand-teal)' : 'transparent', color: activeTab === 'operations' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s ease' }}>Operations</button>
          <button onClick={() => setActiveTab('team')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85em', backgroundColor: activeTab === 'team' ? 'var(--brand-teal)' : 'transparent', color: activeTab === 'team' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s ease' }}>Team Directory</button>
        </div>
      )}

      {/* OPERATIONS VIEW */}
      {activeTab === 'operations' && <>

        {/* FINANCIAL PULSE — Stage 12.1.7 Session 3 */}
        {/* Full-width strip between greeting/tab bar and the search */}
        {/* row, matching design exploration 01-commandcenter-desktop.png */}
        <div style={{ marginBottom: '24px' }}>
          <FinancialPulsePanel stats={pulseStats} />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by project name or ID..." style={{ ...inputStyle, flex: 1, padding: '14px 16px', fontSize: '0.95em', borderRadius: '10px' }} />
          <button onClick={() => setIsDeploying(true)} style={{ padding: '14px 20px', borderRadius: '10px', border: 'none', backgroundColor: 'var(--brand-teal)', color: '#fff', fontWeight: '700', fontSize: '0.85em', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'transform 0.2s ease', boxShadow: '0 4px 15px rgba(13, 79, 79, 0.3)' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>+ New Deployment</button>
        </div>

        <style>{`
          .surveyos-benchmark-marker { background: transparent !important; border: none !important; cursor: pointer; }
          .surveyos-benchmark-marker:hover svg { transform: scale(1.15); transition: transform 0.15s ease; }
        `}</style>

        {/* ══════════ THE DESKTOP GRID FIX ══════════ */}
        <div className="desktop-grid">

          {/* LEFT COLUMN — MAP + RECENT INVOICES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* GOD'S EYE MAP */}
          {/* Map renders activeProjects only — matches Active tab + */}
          {/* Active Projects by Type panel. Archived projects are off */}
          {/* the operations scan. Pin click → setDrawerProject opens */}
          {/* DispatchProjectDrawer (same as Recent Invoices), retiring */}
          {/* the popup→IntelligenceDrawer two-drawer pattern on this */}
          {/* surface (12.1.5 audit Tech Debt). */}
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', height: '600px', position: 'relative' }}>
            <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} scrollWheelZoom={true} style={{ height: '100%', width: '100%', zIndex: 1 }}>
              <TileLayer url={DARK_TILES} attribution={TILE_ATTR} />
              {activeProjects.map((proj, idx) => {
                const coords = getProjectCoords(proj, idx);
                return (
                  <Marker
                    key={proj?.id || idx}
                    position={coords}
                    icon={getMarkerIcon(proj?.status)}
                    eventHandlers={{ click: () => setDrawerProject(proj) }}
                  />
                );
              })}
            </MapContainer>
            {activeProjects.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px 22px',
                zIndex: 500,
                pointerEvents: 'none',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.78em',
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                No active projects in field
              </div>
            )}
          </div>

          {/* RECENT INVOICES */}
          <RecentInvoicesPanel
            invoices={recentInvoices}
            loading={invoicesLoading}
            error={invoicesError}
            onOpenProject={setDrawerProject}
          />

          {/* ACTIVE PROJECTS BY TYPE */}
          {/* Mirrors the Active tab's filter via activeProjects, so the */}
          {/* panel and the segmented control agree on which projects */}
          {/* count. Read-only for now — click-to-filter is Session 3+. */}
          <ActiveProjectsByTypePanel
            projects={activeProjects}
            loading={false}
            error={false}
          />

          </div>

          {/* PROJECT LIST */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '600px' }}>
            {/* Segmented control — Active / Review / Done */}
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'rgba(0,0,0,0.2)', display: 'flex', gap: '6px' }}>
              {[
                { key: 'active', label: 'Active', count: activeProjects.length, accent: 'var(--brand-teal)' },
                { key: 'review', label: 'Review', count: reviewProjects.length, accent: 'var(--brand-amber, #D4912A)' },
                { key: 'done', label: 'Done', count: doneProjects.length, accent: 'var(--text-muted)' },
              ].map(tab => {
                const active = queueTab === tab.key;
                const showBadge = tab.key === 'review' && tab.count > 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setQueueTab(tab.key)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${active ? tab.accent : 'rgba(255,255,255,0.06)'}`,
                      backgroundColor: active ? (tab.key === 'review' ? 'rgba(212, 145, 42, 0.12)' : 'rgba(13, 79, 79, 0.15)') : 'transparent',
                      color: active ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.78em',
                      fontWeight: '700',
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      fontSize: '0.72em',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      backgroundColor: showBadge ? tab.accent : 'rgba(255,255,255,0.08)',
                      color: showBadge ? '#fff' : 'var(--text-muted)',
                      fontWeight: '800',
                      minWidth: '18px',
                      textAlign: 'center',
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredProjects.map((proj) => {
                const isSelected = drawerProject?.id === proj.id;
                return (
                  <div key={proj.id} onClick={() => setDrawerProject(proj)} style={{ padding: '16px', cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--brand-teal)' : '3px solid transparent', backgroundColor: isSelected ? 'rgba(13, 79, 79, 0.08)' : 'transparent', borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.15s' }} onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    <strong style={{ display: 'block', fontSize: '0.9em', color: isSelected ? '#fff' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>{proj.project_name}</strong>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>{proj.scheduled_date || 'TBD'}</span>
                      <span style={{ fontSize: '0.65em', fontWeight: '700', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{proj.status}</span>
                    </div>
                  </div>
                );
              })}
              {filteredProjects.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em', fontStyle: 'italic' }}>No projects found.</div>}
            </div>
          </div>

        </div>
      </>}

      <DispatchProjectDrawer
        project={drawerProject}
        crewLookup={teamMembers || []}
        allProjects={projects || []}
        displayCrews={(teamMembers || []).filter(m => ['field_crew','technician','party_chief'].includes((m.role || '').toLowerCase()))}
        supabase={supabase}
        profile={profile}
        canEdit={isAdminOrOwner}
        isMobile={false}
        onProjectUpdate={(id, patch) => {
          setDrawerProject(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
          onProjectUpdate && onProjectUpdate(id, patch);
          // Also fire the actual DB write — CommandCenter doesn't have a
          // persist helper like DispatchBoard, so we do the write inline.
          if (supabase) {
            supabase.from('projects').update(patch).eq('id', id).then(({ error }) => {
              if (error) {
                console.error('[CommandCenter] patch failed', { id, patch, error });
                alert(`Save failed: ${error.message || 'unknown error'}`);
              }
            });
          }
        }}
        onClose={() => setDrawerProject(null)}
      />
      <IntelligenceDrawer isOpen={isIntelOpen} onClose={() => { setIsIntelOpen(false); setSelectedProjectId(null); }} projectId={selectedProjectId} />
      <DeploymentModal isOpen={isDeploying} onClose={() => setIsDeploying(false)} teamMembers={teamMembers} profile={profile} onDispatch={async (data) => { const newProject = await onCreateProject(data); if (newProject?.id) showToast('Dispatch initialized — project added to Holding Queue'); else showToast('Dispatch failed — please retry'); setIsDeploying(false); }} />

      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, padding: '14px 28px', borderRadius: '14px', backgroundColor: '#141414', border: '1px solid rgba(50, 215, 75, 0.2)', color: '#32D74B', fontSize: '0.88rem', fontWeight: '600', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', animation: 'fadeIn 0.3s ease-out' }}>{toast}</div>
      )}
    </div>
  );
}