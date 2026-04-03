import React, { useState, useEffect } from 'react';

const MONO = "'JetBrains Mono', monospace";
const BLENDED_LABOR_RATE = 45; // $/hour

export default function ProfitAnalytics({ supabase, activeProjects, profile }) {
  // RBAC: Only office roles can see financial analytics
  const role = (profile?.role || '').toLowerCase();
  if (!['owner', 'admin', 'pm'].includes(role)) return null;
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ revenue: 0, costs: 0, profit: 0 });

  useEffect(() => {
    if (activeProjects && activeProjects.length > 0) {
      computeAnalytics();
    } else {
      setAnalytics([]);
      setTotals({ revenue: 0, costs: 0, profit: 0 });
      setLoading(false);
    }
  }, [activeProjects]);

  const computeAnalytics = async () => {
    setLoading(true);
    const projectIds = activeProjects.map(p => p.id);

    // Fetch all completed time entries for these projects
    const { data: timeEntries } = await supabase
      .from('time_entries')
      .select('project_id, clock_in, clock_out')
      .in('project_id', projectIds)
      .not('clock_out', 'is', null);

    // Fetch all consumables for these projects
    const { data: consumables } = await supabase
      .from('consumables_log')
      .select('project_id, material, quantity, unit_cost')
      .in('project_id', projectIds);

    // Build per-project analytics
    const results = activeProjects.map(project => {
      const fee = parseFloat(project.contract_fee) || 0;

      // Labor: sum hours x blended rate
      const projectTime = (timeEntries || []).filter(t => t.project_id === project.id);
      const totalHours = projectTime.reduce((sum, t) => {
        const ms = new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime();
        return sum + Math.max(0, ms / 3600000);
      }, 0);
      const laborCost = totalHours * BLENDED_LABOR_RATE;

      // Materials: quantity * unit_cost (default $5 if no unit_cost column)
      const projectMaterials = (consumables || []).filter(c => c.project_id === project.id);
      const materialCost = projectMaterials.reduce((sum, c) => {
        const unitCost = parseFloat(c.unit_cost) || 5;
        return sum + (c.quantity || 0) * unitCost;
      }, 0);

      const totalCost = laborCost + materialCost;
      const profit = fee - totalCost;
      const margin = fee > 0 ? (profit / fee) * 100 : 0;

      return {
        id: project.id,
        name: project.project_name,
        status: project.status,
        fee,
        laborCost,
        materialCost,
        totalCost,
        profit,
        margin,
        hours: totalHours,
      };
    });

    results.sort((a, b) => a.margin - b.margin);

    const sumRevenue = results.reduce((s, r) => s + r.fee, 0);
    const sumCosts = results.reduce((s, r) => s + r.totalCost, 0);
    const sumProfit = results.reduce((s, r) => s + r.profit, 0);

    setAnalytics(results);
    setTotals({ revenue: sumRevenue, costs: sumCosts, profit: sumProfit });
    setLoading(false);
  };

  if (loading && (!activeProjects || activeProjects.length === 0)) return null;

  const overallMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <div style={{ marginBottom: '30px' }}>

      {/* ══════════ MASTER SUMMARY BAR ══════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0',
        backgroundColor: 'var(--bg-surface)', borderRadius: '12px',
        border: '1px solid var(--border-subtle)', overflow: 'hidden',
        marginBottom: '16px',
      }}>
        <TickerCell label="Revenue" value={fmtDollar(totals.revenue)} color="var(--text-main)" />
        <TickerDivider />
        <TickerCell label="Costs" value={fmtDollar(totals.costs)} color="#FF9F0A" />
        <TickerDivider />
        <TickerCell label="Profit" value={fmtDollar(totals.profit)} color={totals.profit >= 0 ? '#32D74B' : '#FF453A'} />
        <TickerDivider />
        <TickerCell label="Margin" value={`${overallMargin.toFixed(1)}%`} color={marginColor(overallMargin)} dot={marginColor(overallMargin)} />
        <TickerDivider />
        <TickerCell label="Projects" value={String(analytics.length)} color="var(--text-muted)" />
      </div>

      {/* ══════════ HIGH-DENSITY MINI-TABLE ══════════ */}
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82em' }}>Calculating...</div>
      ) : analytics.length === 0 ? (
        <div style={{
          padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82em',
          backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)',
        }}>
          No active projects to analyze.
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--bg-surface)', borderRadius: '12px',
          border: '1px solid var(--border-subtle)', overflow: 'hidden',
        }}>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 1 }}>
                  <th style={TH_LEFT}>Project</th>
                  <th style={TH_RIGHT}>Contract Fee</th>
                  <th style={TH_RIGHT}>Total Cost</th>
                  <th style={TH_RIGHT}>Profit</th>
                  <th style={TH_RIGHT}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((proj) => {
                  const mc = marginColor(proj.margin);
                  return (
                    <tr
                      key={proj.id}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background-color 0.12s' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Project Name */}
                      <td style={{ ...TD, maxWidth: '220px' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', fontWeight: '600', fontSize: '0.85em' }}>
                          {proj.name}
                        </div>
                        <div style={{ fontSize: '0.68em', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {proj.hours.toFixed(1)}h logged
                        </div>
                      </td>
                      {/* Contract Fee */}
                      <td style={{ ...TD_NUM }}>{fmtDollar(proj.fee)}</td>
                      {/* Total Cost */}
                      <td style={{ ...TD_NUM, color: '#FF9F0A' }}>{fmtDollar(proj.totalCost)}</td>
                      {/* Profit */}
                      <td style={{ ...TD_NUM, color: proj.profit >= 0 ? '#32D74B' : '#FF453A' }}>{fmtDollar(proj.profit)}</td>
                      {/* Margin with dot */}
                      <td style={{ ...TD_NUM }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <span style={{ color: mc }}>{proj.margin.toFixed(1)}%</span>
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            backgroundColor: mc, flexShrink: 0,
                            boxShadow: `0 0 6px ${mc}66`,
                          }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function TickerCell({ label, value, color, dot }) {
  return (
    <div style={{ flex: 1, padding: '14px 18px', textAlign: 'center' }}>
      <span style={{ display: 'block', fontSize: '0.6em', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '1.15em', fontWeight: '700', fontFamily: MONO, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {dot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: dot, boxShadow: `0 0 6px ${dot}66` }} />}
      </span>
    </div>
  );
}

function TickerDivider() {
  return <div style={{ width: '1px', alignSelf: 'stretch', backgroundColor: 'var(--border-subtle)' }} />;
}

// ═══════════════════════════════════════════════════════════
// TABLE TOKENS
// ═══════════════════════════════════════════════════════════

const TH_BASE = {
  padding: '10px 16px', fontSize: '0.65em', fontWeight: '700',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', borderBottom: '2px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
};

const TH_LEFT = { ...TH_BASE, textAlign: 'left' };
const TH_RIGHT = { ...TH_BASE, textAlign: 'right' };

const TD = { padding: '10px 16px', verticalAlign: 'middle' };

const TD_NUM = {
  ...TD, textAlign: 'right', fontFamily: MONO, fontSize: '0.85em',
  fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: 'var(--text-main)',
  whiteSpace: 'nowrap',
};

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function fmtDollar(val) {
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${val < 0 ? '-' : ''}$${formatted}`;
}

function marginColor(margin) {
  if (margin >= 40) return '#0D4F4F';  // Teal — healthy
  if (margin >= 15) return '#D4912A';  // Amber — warning
  return '#FF453A';                     // Red — danger
}
