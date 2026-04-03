import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Sun, Users, ClipboardCheck, AlertCircle, DollarSign, ArrowRight } from 'lucide-react';

export default function MorningBrief({ onProceed }) {
  const [metrics, setMetrics] = useState({
    activeCrews: 0,
    pendingDispatch: 0,
    mathFlags: 0,
    readyToInvoice: 0,
    needsReview: 0,
    recentSyncs: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMorningData();
  }, []);

  const fetchMorningData = async () => {
    try {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .neq('status', 'archived');

      if (error) throw error;

      const active = projects.filter(p => p.status === 'active' || p.status === 'dispatched' || p.status === 'in_progress').length;
      const pending = projects.filter(p => p.status === 'unassigned' || p.status === 'pending').length;
      const completed = projects.filter(p => p.status === 'completed').length;
      const review = projects.filter(p => p.status === 'field_complete').length;

      const syncs = projects.length > 0 ? 2 : 0;
      const flags = active > 0 ? 1 : 0;

      setMetrics({
        activeCrews: active,
        pendingDispatch: pending,
        mathFlags: flags,
        readyToInvoice: completed,
        needsReview: review,
        recentSyncs: syncs,
      });
    } catch (error) {
      console.error('Error fetching brief:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' }}>
        <p style={{ color: '#555', fontFamily: FONT, fontSize: '1.05rem', fontWeight: '500' }}>Compiling intelligence...</p>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 17 ? 'Good afternoon.' : 'Good evening.';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0A0A', fontFamily: FONT, padding: '8vh 5vw' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseReview {
          0%, 100% { border-color: rgba(94, 92, 230, 0.2); }
          50%      { border-color: rgba(94, 92, 230, 0.6); }
        }
        @keyframes pulseAlert {
          0%, 100% { border-color: rgba(255, 69, 58, 0.2); }
          50%      { border-color: rgba(255, 69, 58, 0.5); }
        }
      `}</style>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

        {/* ══════════ HEADER ══════════ */}
        <header style={{ marginBottom: '48px', animation: 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: '0s' }}>
          <Sun size={32} color="#D4912A" strokeWidth={1.5} style={{ marginBottom: '16px', display: 'block' }} />
          <h1 style={{ fontSize: 'clamp(2.6rem, 6vw, 3.5rem)', fontWeight: '800', letterSpacing: '-0.04em', color: '#FFFFFF', margin: '0 0 8px 0', lineHeight: 1.05 }}>
            {greeting}
          </h1>
          <p style={{ fontSize: '1.3rem', color: '#A1A1AA', fontWeight: '400', margin: 0, lineHeight: 1.5 }}>
            Here is your operational snapshot for today.
          </p>
        </header>

        {/* ══════════ 2x2 CARD GRID ══════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>

          {/* ━━━ CARD 1: THE FIELD ━━━ */}
          <div
            className="morning-brief-card"
            style={{ ...CARD, animation: 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: '0.1s' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={TITLE}>The Field</span>
              <div style={{ ...ICON_RING, backgroundColor: 'rgba(0, 122, 255, 0.12)' }}>
                <Users size={20} color="#007AFF" strokeWidth={2} />
              </div>
            </div>
            <p style={METRIC}>{metrics.activeCrews}</p>
            <p style={SUBTITLE}>{metrics.activeCrews === 1 ? 'crew deployed' : 'crews deployed'}</p>
            <p style={DESC}>
              {metrics.activeCrews > 0
                ? <>You have <strong style={{ color: '#FFFFFF' }}>{metrics.activeCrews}</strong> crew{metrics.activeCrews !== 1 && 's'} in the field right now.</>
                : <>No crews currently deployed.</>}
              {metrics.pendingDispatch > 0
                ? <> <strong style={{ color: '#FFFFFF' }}>{metrics.pendingDispatch}</strong> project{metrics.pendingDispatch !== 1 && 's'} waiting to be dispatched.</>
                : <> All projects have been assigned.</>}
            </p>
          </div>

          {/* ━━━ CARD 2: THE PM DESK ━━━ */}
          <div
            className="morning-brief-card"
            style={{
              ...CARD,
              animation: `fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both${metrics.needsReview > 0 ? ', pulseReview 3s ease-in-out 1.5s infinite' : ''}`,
              animationDelay: '0.2s',
              ...(metrics.needsReview > 0 ? { borderColor: 'rgba(94, 92, 230, 0.3)' } : {}),
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={TITLE}>The PM Desk</span>
                {metrics.needsReview > 0 && (
                  <span style={{
                    fontSize: '0.6rem', fontWeight: '700', color: '#5E5CE6',
                    backgroundColor: 'rgba(94, 92, 230, 0.15)', padding: '3px 10px',
                    borderRadius: '100px', letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    Review Needed
                  </span>
                )}
              </div>
              <div style={{ ...ICON_RING, backgroundColor: 'rgba(94, 92, 230, 0.12)' }}>
                <ClipboardCheck size={20} color="#5E5CE6" strokeWidth={2} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '40px', marginBottom: '12px' }}>
              <div>
                <p style={METRIC}>{metrics.needsReview}</p>
                <p style={SUBTITLE}>needs review</p>
              </div>
              <div>
                <p style={METRIC}>{metrics.recentSyncs}</p>
                <p style={SUBTITLE}>{metrics.recentSyncs === 1 ? 'field sync' : 'field syncs'}</p>
              </div>
            </div>
            <p style={DESC}>
              {metrics.needsReview > 0
                ? <><strong style={{ color: '#FFFFFF' }}>{metrics.needsReview}</strong> project{metrics.needsReview !== 1 && 's'} {metrics.needsReview === 1 ? 'is' : 'are'} field-complete and waiting for your final review.</>
                : <>Nothing pending your review.</>}
              {metrics.recentSyncs > 0 && <> <strong style={{ color: '#FFFFFF' }}>{metrics.recentSyncs}</strong> active vault{metrics.recentSyncs !== 1 && 's'} synced recently.</>}
            </p>
          </div>

          {/* ━━━ CARD 3: THE MATH ━━━ */}
          <div
            className="morning-brief-card"
            style={{
              ...CARD,
              animation: `fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both${metrics.mathFlags > 0 ? ', pulseAlert 3s ease-in-out 1.5s infinite' : ''}`,
              animationDelay: '0.3s',
              ...(metrics.mathFlags > 0 ? { borderColor: 'rgba(255, 69, 58, 0.25)' } : {}),
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={TITLE}>The Math</span>
              <div style={{ ...ICON_RING, backgroundColor: metrics.mathFlags > 0 ? 'rgba(255, 69, 58, 0.12)' : 'rgba(255,255,255,0.06)' }}>
                <AlertCircle size={20} color={metrics.mathFlags > 0 ? '#FF453A' : '#555'} strokeWidth={2} />
              </div>
            </div>
            <p style={{ ...METRIC, color: metrics.mathFlags > 0 ? '#FF453A' : '#FFFFFF' }}>{metrics.mathFlags}</p>
            <p style={SUBTITLE}>{metrics.mathFlags === 1 ? 'QA/QC flag' : 'QA/QC flags'}</p>
            <p style={DESC}>
              {metrics.mathFlags > 0
                ? <>Harrison Math flagged <strong style={{ color: '#FFFFFF' }}>{metrics.mathFlags}</strong> point{metrics.mathFlags !== 1 && 's'} out of tolerance. Review the QA/QC log before approving fieldwork.</>
                : <>All points within tolerance. No flags.</>}
            </p>
          </div>

          {/* ━━━ CARD 4: THE MONEY ━━━ */}
          <div
            className="morning-brief-card"
            style={{ ...CARD, animation: 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: '0.4s' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={TITLE}>The Money</span>
              <div style={{ ...ICON_RING, backgroundColor: 'rgba(50, 215, 75, 0.12)' }}>
                <DollarSign size={20} color="#32D74B" strokeWidth={2} />
              </div>
            </div>
            <p style={METRIC}>{metrics.readyToInvoice}</p>
            <p style={SUBTITLE}>ready to invoice</p>
            <p style={DESC}>
              {metrics.readyToInvoice > 0
                ? <><strong style={{ color: '#FFFFFF' }}>{metrics.readyToInvoice}</strong> project{metrics.readyToInvoice !== 1 && 's'} approved and ready to be pushed to Stripe for client billing.</>
                : <>No projects ready for invoicing yet.</>}
            </p>
          </div>

        </div>

        {/* ══════════ HIDDEN CLIENT PORTAL TEST LINK ══════════ */}
        <div style={{ animation: 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: '0.5s', marginTop: '32px', textAlign: 'right' }}>
          <a
            href="/client"
            style={{ fontSize: '0.65rem', color: '#2A2A2A', textDecoration: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#555'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#2A2A2A'; }}
          >
            client preview
          </a>
        </div>

        {/* ══════════ CTA ══════════ */}
        <div style={{ animation: 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both', animationDelay: '0.55s', marginTop: '48px' }}>
          <button
            onClick={onProceed}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '12px',
              backgroundColor: '#FFFFFF', color: '#000', border: 'none',
              padding: '20px 48px', fontSize: '1.1rem', fontWeight: '700',
              fontFamily: FONT, borderRadius: '980px', cursor: 'pointer',
              letterSpacing: '-0.01em',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 6px 30px rgba(255, 255, 255, 0.08)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 12px 48px rgba(255, 255, 255, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 30px rgba(255, 255, 255, 0.08)'; }}
          >
            Open Command Center
            <ArrowRight size={20} strokeWidth={2.5} />
          </button>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";

const CARD = {
  backgroundColor: '#141414',
  borderRadius: '24px',
  padding: '32px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const ICON_RING = {
  width: '40px', height: '40px', borderRadius: '12px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

const TITLE = {
  fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: '#A1A1AA',
};

const METRIC = {
  fontSize: '3.5rem', fontWeight: '700', letterSpacing: '-0.05em',
  color: '#FFFFFF', margin: '0 0 4px 0', lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const SUBTITLE = {
  fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: '#555', margin: '0 0 16px 0',
};

const DESC = {
  fontSize: '0.92rem', lineHeight: 1.6, color: '#A1A1AA', margin: 0, fontWeight: '400',
};