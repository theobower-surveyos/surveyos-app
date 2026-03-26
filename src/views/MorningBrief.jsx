// ─────────────────────────────────────────────────
// SurveyOS · MorningBrief.jsx · Owner Dashboard
// Phase 4 – Track C (Operations)
// ─────────────────────────────────────────────────
// The owner sees this every morning. One screen:
//   - DSO (Days Sales Outstanding) from real timestamps
//   - Revenue collected vs. outstanding
//   - Pipeline health by status
//   - Active crew & SurveyNet contribution
// ─────────────────────────────────────────────────

import React, { useMemo } from 'react';
import {
  COLORS, MOCK_PROJECTS, MOCK_MONUMENTS, MOCK_CLIENTS,
  PROJECT_STATUSES, STATUS_COLORS,
  getClient, getService, getCrew, calcDSO, fmt,
} from '../data/constants.js';

// ── Inline Styles ────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: COLORS.lgray,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: COLORS.black,
    paddingBottom: 80,
  },
  header: {
    background: `linear-gradient(135deg, ${COLORS.navy} 0%, #162640 60%, #1A3358 100%)`,
    padding: '32px 24px 28px',
    color: COLORS.white,
  },
  greeting: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.5px',
    margin: '0 0 4px 0',
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: 600,
  },
  section: {
    padding: '16px',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    color: COLORS.gray,
    marginBottom: 12,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: (accent) => ({
    background: COLORS.white,
    borderRadius: 14,
    padding: '18px 16px',
    boxShadow: '0 1px 3px rgba(15,27,45,0.06)',
    border: `1px solid ${COLORS.mgray}`,
    borderTop: `3px solid ${accent}`,
  }),
  kpiLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: COLORS.gray,
    marginBottom: 6,
  },
  kpiValue: (color) => ({
    fontSize: 24,
    fontWeight: 800,
    color: color || COLORS.navy,
    fontVariantNumeric: 'tabular-nums',
  }),
  kpiSub: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  card: {
    background: COLORS.white,
    borderRadius: 14,
    padding: '18px',
    marginBottom: 14,
    boxShadow: '0 1px 3px rgba(15,27,45,0.06)',
    border: `1px solid ${COLORS.mgray}`,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: COLORS.navy,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  dsoMeter: (dso) => {
    // DSO gauge: green < 30, yellow 30-45, red > 45
    const pct = Math.min(dso / 60, 1);
    const color = dso <= 30 ? COLORS.green : dso <= 45 ? '#D97706' : '#DC2626';
    return {
      width: '100%',
      height: 10,
      borderRadius: 5,
      background: COLORS.mgray,
      overflow: 'hidden',
      position: 'relative',
    };
  },
  dsoFill: (dso) => {
    const pct = Math.min(dso / 60, 1);
    const color = dso <= 30 ? COLORS.green : dso <= 45 ? '#D97706' : '#DC2626';
    return {
      height: '100%',
      width: `${pct * 100}%`,
      borderRadius: 5,
      background: `linear-gradient(90deg, ${color}, ${color}CC)`,
      transition: 'width .5s ease',
    };
  },
  pipelineBar: {
    display: 'flex',
    borderRadius: 8,
    overflow: 'hidden',
    height: 28,
    marginBottom: 12,
  },
  pipelineSegment: (color, pct) => ({
    width: `${pct}%`,
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.white,
    transition: 'width .3s ease',
    minWidth: pct > 5 ? 'auto' : 0,
    overflow: 'hidden',
  }),
  legendDot: (color) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
  }),
  arRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: `1px solid ${COLORS.mgray}`,
  },
  badge: (color) => ({
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: COLORS.white,
    background: color,
  }),
  bigDso: {
    textAlign: 'center',
    padding: '20px 0',
  },
  bigDsoValue: (dso) => ({
    fontSize: 56,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: dso <= 30 ? COLORS.green : dso <= 45 ? '#D97706' : '#DC2626',
    lineHeight: 1,
    fontFamily: "'Inter', -apple-system, sans-serif",
  }),
  bigDsoLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.gray,
    marginTop: 6,
  },
};

// ── Computation Engine ───────────────────────────
function useFinancials(projects) {
  return useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Revenue
    const totalPipeline = projects.reduce((s, p) => s + p.fee, 0);
    const collected = projects
      .filter(p => p.paidDate)
      .reduce((s, p) => s + p.fee, 0);
    const outstanding = projects
      .filter(p => p.invoicedDate && !p.paidDate)
      .reduce((s, p) => s + p.fee, 0);
    const pendingProposals = projects
      .filter(p => p.status === 'proposal')
      .reduce((s, p) => s + p.fee, 0);
    const inProgress = projects
      .filter(p => ['accepted', 'field', 'office', 'review'].includes(p.status))
      .reduce((s, p) => s + p.fee, 0);

    // DSO Calculation (real timestamps)
    // Only calculate for projects that have both delivered and paid dates
    const closedWithDates = projects.filter(p => p.deliveredDate && p.paidDate);
    const dsoValues = closedWithDates.map(p => calcDSO(p)).filter(d => d !== null);
    const avgDSO = dsoValues.length > 0
      ? Math.round(dsoValues.reduce((s, d) => s + d, 0) / dsoValues.length)
      : 0;
    const maxDSO = dsoValues.length > 0 ? Math.max(...dsoValues) : 0;
    const minDSO = dsoValues.length > 0 ? Math.min(...dsoValues) : 0;

    // Aging: how long invoiced-but-unpaid have been outstanding
    const unpaidInvoiced = projects.filter(p => p.invoicedDate && !p.paidDate);
    const agingBuckets = {
      current: [],  // 0-30 days
      aging: [],    // 31-60 days
      overdue: [],  // 60+ days
    };
    unpaidInvoiced.forEach(p => {
      const days = Math.round((now - new Date(p.invoicedDate)) / (1000 * 60 * 60 * 24));
      if (days <= 30) agingBuckets.current.push({ ...p, daysOut: days });
      else if (days <= 60) agingBuckets.aging.push({ ...p, daysOut: days });
      else agingBuckets.overdue.push({ ...p, daysOut: days });
    });

    // Pipeline counts by status
    const pipeline = {};
    PROJECT_STATUSES.forEach(s => {
      pipeline[s] = projects.filter(p => p.status === s);
    });

    // Revenue this month
    const thisMonthCollected = projects
      .filter(p => p.paidDate && p.paidDate.startsWith(thisMonth))
      .reduce((s, p) => s + p.fee, 0);

    // Close rate
    const totalProposals = projects.filter(p => p.proposalDate).length;
    const totalClosed = projects.filter(p => p.status === 'closed').length;
    const closeRate = totalProposals > 0 ? Math.round((totalClosed / totalProposals) * 100) : 0;

    return {
      totalPipeline, collected, outstanding, pendingProposals, inProgress,
      avgDSO, maxDSO, minDSO,
      agingBuckets, pipeline, thisMonthCollected, closeRate,
      totalProjects: projects.length,
      activeProjects: projects.filter(p => !['closed', 'proposal'].includes(p.status)).length,
    };
  }, [projects]);
}

// ── Main Export ───────────────────────────────────
export default function MorningBrief() {
  const projects = MOCK_PROJECTS;
  const fin = useFinancials(projects);

  const today = new Date();
  const hour = today.getHours();
  const greetingText = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Pipeline stacked bar
  const pipelineCounts = PROJECT_STATUSES.map(s => ({
    status: s,
    count: fin.pipeline[s]?.length || 0,
    color: STATUS_COLORS[s],
  })).filter(x => x.count > 0);
  const totalForBar = pipelineCounts.reduce((s, x) => s + x.count, 0);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.greeting}>{greetingText}</div>
        <h1 style={S.headerTitle}>Morning Brief</h1>
        <div style={S.headerSub}>{dateStr}</div>
      </div>

      <div style={S.section}>
        {/* ── KPI Grid ────────────────────────── */}
        <div style={S.sectionTitle}>Financials</div>
        <div style={S.kpiGrid}>
          <div style={S.kpiCard(COLORS.green)}>
            <div style={S.kpiLabel}>Collected</div>
            <div style={S.kpiValue(COLORS.green)}>{fmt(fin.collected)}</div>
            <div style={S.kpiSub}>
              {fmt(fin.thisMonthCollected)} this month
            </div>
          </div>

          <div style={S.kpiCard('#D97706')}>
            <div style={S.kpiLabel}>Outstanding</div>
            <div style={S.kpiValue('#D97706')}>{fmt(fin.outstanding)}</div>
            <div style={S.kpiSub}>
              {fin.agingBuckets.current.length + fin.agingBuckets.aging.length + fin.agingBuckets.overdue.length} invoices
            </div>
          </div>

          <div style={S.kpiCard(COLORS.blue)}>
            <div style={S.kpiLabel}>In Progress</div>
            <div style={S.kpiValue(COLORS.blue)}>{fmt(fin.inProgress)}</div>
            <div style={S.kpiSub}>
              {fin.activeProjects} active project{fin.activeProjects !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={S.kpiCard(COLORS.gray)}>
            <div style={S.kpiLabel}>Proposals Out</div>
            <div style={S.kpiValue(COLORS.gray)}>{fmt(fin.pendingProposals)}</div>
            <div style={S.kpiSub}>
              {fin.closeRate}% close rate
            </div>
          </div>
        </div>

        {/* ── DSO Card ────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span style={{ fontSize: 20 }}>⏱️</span>
            Days Sales Outstanding
          </div>

          <div style={S.bigDso}>
            <div style={S.bigDsoValue(fin.avgDSO)}>
              {fin.avgDSO}
            </div>
            <div style={S.bigDsoLabel}>Average DSO (Delivered → Paid)</div>
          </div>

          {/* DSO Gauge */}
          <div style={S.dsoMeter(fin.avgDSO)}>
            <div style={S.dsoFill(fin.avgDSO)} />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 8,
            fontSize: 11,
            color: COLORS.gray,
          }}>
            <span>0 days</span>
            <span style={{ fontWeight: 700, color: COLORS.green }}>Target: 30</span>
            <span>60 days</span>
          </div>

          {/* DSO Detail */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginTop: 16,
            padding: '14px 0 0 0',
            borderTop: `1px solid ${COLORS.mgray}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.green }}>{fin.minDSO}d</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.gray, textTransform: 'uppercase' }}>Fastest</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.navy }}>{fin.avgDSO}d</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.gray, textTransform: 'uppercase' }}>Average</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: fin.maxDSO > 30 ? '#DC2626' : '#D97706' }}>{fin.maxDSO}d</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.gray, textTransform: 'uppercase' }}>Slowest</div>
            </div>
          </div>

          {/* Per-project DSO Breakdown */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLORS.mgray}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gray, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>
              Closed Projects
            </div>
            {projects.filter(p => p.deliveredDate && p.paidDate).map(p => {
              const dso = calcDSO(p);
              const client = getClient(p.clientId);
              return (
                <div key={p.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: `1px solid ${COLORS.mgray}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.navy }}>
                      {p.name.slice(0, 35)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.gray }}>
                      {client.name} · {fmt(p.fee)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: dso <= 30 ? COLORS.green : dso <= 45 ? '#D97706' : '#DC2626',
                  }}>
                    {dso}d
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pipeline Health ─────────────────── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span style={{ fontSize: 20 }}>📊</span>
            Pipeline Health
          </div>

          {/* Stacked bar */}
          <div style={S.pipelineBar}>
            {pipelineCounts.map(x => (
              <div
                key={x.status}
                style={S.pipelineSegment(x.color, (x.count / totalForBar) * 100)}
              >
                {x.count}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            {pipelineCounts.map(x => (
              <div key={x.status} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                <span style={S.legendDot(x.color)} />
                <span style={{ textTransform: 'capitalize', fontWeight: 600, color: COLORS.navy }}>
                  {x.status}
                </span>
                <span style={{ color: COLORS.gray }}>({x.count})</span>
              </div>
            ))}
          </div>

          {/* Total pipeline value */}
          <div style={{
            background: COLORS.lgray,
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: COLORS.gray, textTransform: 'uppercase' }}>
                Total Pipeline Value
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.navy }}>
                {fmt(fin.totalPipeline)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: COLORS.gray, textTransform: 'uppercase' }}>
                Projects
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.navy }}>
                {fin.totalProjects}
              </div>
            </div>
          </div>
        </div>

        {/* ── A/R Aging ───────────────────────── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span style={{ fontSize: 20 }}>💰</span>
            Accounts Receivable Aging
          </div>

          {[
            { label: 'Current (0-30 days)', items: fin.agingBuckets.current, color: COLORS.green },
            { label: 'Aging (31-60 days)',   items: fin.agingBuckets.aging,   color: '#D97706' },
            { label: 'Overdue (60+ days)',   items: fin.agingBuckets.overdue, color: '#DC2626' },
          ].map(bucket => (
            <div key={bucket.label}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0 6px',
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: bucket.color,
                }}>
                  {bucket.label}
                </div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: bucket.color,
                }}>
                  {fmt(bucket.items.reduce((s, p) => s + p.fee, 0))}
                </div>
              </div>
              {bucket.items.map(p => {
                const client = getClient(p.clientId);
                return (
                  <div key={p.id} style={S.arRow}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.navy }}>
                        {p.name.slice(0, 35)}
                      </div>
                      <div style={{ fontSize: 11, color: COLORS.gray }}>
                        {client.name} · Invoiced {p.invoicedDate}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy }}>
                        {fmt(p.fee)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: bucket.color }}>
                        {p.daysOut}d out
                      </div>
                    </div>
                  </div>
                );
              })}
              {bucket.items.length === 0 && (
                <div style={{ fontSize: 12, color: COLORS.gray, padding: '6px 0 10px', fontStyle: 'italic' }}>
                  None
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── SurveyNet Contribution ──────────── */}
        <div style={S.card}>
          <div style={S.cardTitle}>
            <span style={{ fontSize: 20 }}>🌐</span>
            SurveyNet Contribution
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
            marginBottom: 14,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.gold }}>
                {MOCK_MONUMENTS.length}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.gray, textTransform: 'uppercase' }}>
                Total Mon.
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.green }}>
                {MOCK_MONUMENTS.filter(m => m.condition === 'Set').length}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.gray, textTransform: 'uppercase' }}>
                Set
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.blue }}>
                {MOCK_MONUMENTS.filter(m => m.condition === 'Found').length}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.gray, textTransform: 'uppercase' }}>
                Found
              </div>
            </div>
          </div>

          <div style={{
            background: COLORS.lgray,
            borderRadius: 10,
            padding: '12px 14px',
            fontSize: 12,
            color: COLORS.gray,
            lineHeight: 1.5,
          }}>
            <span style={{ fontWeight: 700, color: COLORS.gold }}>Moat Status:</span> Every
            monument captured strengthens your firm's data advantage. SurveyNet currently
            holds {MOCK_MONUMENTS.filter(m => m.synced).length} GPS-verified records across {
              [...new Set(MOCK_MONUMENTS.map(m => m.projectId))].length
            } projects.
          </div>
        </div>
      </div>
    </div>
  );
}