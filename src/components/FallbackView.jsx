/**
 * FallbackView.jsx — SurveyOS Anti-Crash Mandate
 * 
 * This component catches ANY unbuilt or missing route and renders
 * a beautiful "Feature in Development" screen instead of a white-screen crash.
 * 
 * Design: Dark navy canvas, gold accent pulse, surveying-themed iconography.
 * UX Rule: Every dead-end becomes a branded moment. Zero white screens. Ever.
 */

import React, { useState, useEffect } from 'react';

export default function FallbackView({ featureName = 'This Feature', onBack }) {
  const [dotCount, setDotCount] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    const interval = setInterval(() => {
      setDotCount(prev => (prev % 3) + 1);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const dots = '.'.repeat(dotCount);

  return (
    <>
      <style>{`
        @keyframes sos-fallback-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes sos-fallback-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sos-fallback-dash {
          to { stroke-dashoffset: 0; }
        }
        @keyframes sos-fallback-fadeup {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sos-fallback-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(201,150,59,0.15); }
          50% { box-shadow: 0 0 40px rgba(201,150,59,0.3); }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(165deg, #0F1B2D 0%, #162338 40%, #0F1B2D 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        position: 'relative',
        overflow: 'hidden',
        opacity: 1,
        transition: 'opacity 0.6s ease',
      }}>

        {/* Subtle grid texture overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(201,150,59,0.03) 1px, transparent 0)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }} />

        {/* Ambient glow behind icon */}
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,150,59,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Surveying Transit Icon — animated SVG */}
        <div style={{
          width: '120px',
          height: '120px',
          marginBottom: '32px',
          animation: 'sos-fallback-glow 3s ease-in-out infinite',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Rotating outer ring */}
          <svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            style={{
              position: 'absolute',
              animation: 'sos-fallback-rotate 12s linear infinite',
            }}
          >
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="#C9963B"
              strokeWidth="1"
              strokeDasharray="8 12"
              opacity="0.4"
            />
          </svg>

          {/* Inner transit/theodolite icon */}
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            {/* Tripod legs */}
            <path
              d="M28 34 L16 52"
              stroke="#C9963B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="30"
              strokeDashoffset="30"
              style={{ animation: 'sos-fallback-dash 1s ease 0.3s forwards' }}
            />
            <path
              d="M28 34 L40 52"
              stroke="#C9963B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="30"
              strokeDashoffset="30"
              style={{ animation: 'sos-fallback-dash 1s ease 0.5s forwards' }}
            />
            <path
              d="M28 34 L28 52"
              stroke="#C9963B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="30"
              strokeDashoffset="30"
              style={{ animation: 'sos-fallback-dash 1s ease 0.4s forwards' }}
            />
            {/* Instrument body */}
            <circle
              cx="28" cy="22" r="12"
              fill="none"
              stroke="#C9963B"
              strokeWidth="2"
              strokeDasharray="80"
              strokeDashoffset="80"
              style={{ animation: 'sos-fallback-dash 1.2s ease 0.1s forwards' }}
            />
            {/* Lens */}
            <line
              x1="16" y1="22" x2="6" y2="22"
              stroke="#C9963B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="12"
              strokeDashoffset="12"
              style={{ animation: 'sos-fallback-dash 0.6s ease 0.8s forwards' }}
            />
            {/* Crosshair */}
            <line
              x1="28" y1="16" x2="28" y2="28"
              stroke="#C9963B"
              strokeWidth="1"
              opacity="0.6"
              strokeDasharray="12"
              strokeDashoffset="12"
              style={{ animation: 'sos-fallback-dash 0.5s ease 1s forwards' }}
            />
            <line
              x1="22" y1="22" x2="34" y2="22"
              stroke="#C9963B"
              strokeWidth="1"
              opacity="0.6"
              strokeDasharray="12"
              strokeDashoffset="12"
              style={{ animation: 'sos-fallback-dash 0.5s ease 1.1s forwards' }}
            />
          </svg>
        </div>

        {/* Feature Name */}
        <h1 style={{
          fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: '28px',
          fontWeight: 700,
          color: '#FFFFFF',
          margin: '0 0 8px 0',
          textAlign: 'center',
          letterSpacing: '-0.5px',
          animation: 'sos-fallback-fadeup 0.8s ease 0.2s both',
        }}>
          {featureName}
        </h1>

        {/* Status badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(201, 150, 59, 0.1)',
          border: '1px solid rgba(201, 150, 59, 0.25)',
          borderRadius: '100px',
          padding: '6px 16px',
          marginBottom: '24px',
          animation: 'sos-fallback-fadeup 0.8s ease 0.35s both',
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#C9963B',
            animation: 'sos-fallback-pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: '12px',
            fontWeight: 600,
            color: '#C9963B',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}>
            In Development{dots}
          </span>
        </div>

        {/* Description */}
        <p style={{
          fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: '15px',
          lineHeight: '1.6',
          color: '#94A3B8',
          textAlign: 'center',
          maxWidth: '420px',
          margin: '0 0 40px 0',
          animation: 'sos-fallback-fadeup 0.8s ease 0.5s both',
        }}>
          Our engineering team is building this module right now.
          Every feature in SurveyOS is crafted to production-grade
          standards before it ships.
        </p>

        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            style={{
              fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              color: '#0F1B2D',
              background: 'linear-gradient(135deg, #C9963B 0%, #D4A84E 100%)',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 32px',
              cursor: 'pointer',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              animation: 'sos-fallback-fadeup 0.8s ease 0.65s both',
              boxShadow: '0 4px 16px rgba(201, 150, 59, 0.3)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(201, 150, 59, 0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(201, 150, 59, 0.3)';
            }}
          >
            ← Back to Dashboard
          </button>
        )}

        {/* Bottom brand line */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          animation: 'sos-fallback-fadeup 0.8s ease 0.8s both',
        }}>
          <span style={{
            fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: '11px',
            color: '#475569',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            SurveyOS
          </span>
          <span style={{ color: '#334155', fontSize: '11px' }}>·</span>
          <span style={{
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: '10px',
            color: '#334155',
            letterSpacing: '0.5px',
          }}>
            Phase 4
          </span>
        </div>
      </div>
    </>
  );
}