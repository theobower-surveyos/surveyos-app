const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";

export default function WelcomeScreen({ name, onEnter }) {
  // No auto-advance — Lukas taps "Enter" when he's ready.
  const handleEnter = () => {
    onEnter && onEnter();
  };

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'var(--bg-dark, #0F172A)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT,
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes welcomeFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes welcomePulse {
          0%, 100% { opacity: 0.6; }
          50%      { opacity: 1; }
        }
      `}</style>

      {/* Ambient glow behind the text */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13, 79, 79, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Headline */}
      <h1
        style={{
          margin: '0 0 16px 0',
          fontSize: 'clamp(2.8rem, 8vw, 4.5rem)',
          fontWeight: '800',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          textAlign: 'center',
          color: 'var(--text-main, #F8FAFC)',
          animation: 'welcomeFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: '0.2s',
        }}
      >
        Welcome,{' '}
        <span style={{ color: 'var(--brand-amber, #D4912A)' }}>
          {name || 'Guest'}
        </span>
        .
      </h1>

      {/* Date subtitle */}
      <p
        style={{
          margin: '0 0 48px 0',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.15rem)',
          fontWeight: '500',
          color: 'var(--text-muted, #94A3B8)',
          letterSpacing: '-0.01em',
          textAlign: 'center',
          animation: 'welcomeFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: '0.4s',
        }}
      >
        SurveyOS · {dateLabel}
      </p>

      {/* Enter button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleEnter(); }}
        style={{
          padding: '16px 48px',
          borderRadius: '14px',
          border: 'none',
          backgroundColor: 'var(--brand-teal, #0D4F4F)',
          color: 'var(--text-main, #F8FAFC)',
          fontSize: '1.05rem',
          fontWeight: '700',
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          fontFamily: FONT,
          boxShadow: '0 8px 32px rgba(13, 79, 79, 0.4)',
          animation: 'welcomeFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
          animationDelay: '0.6s',
          transition: 'transform 0.15s ease, background-color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.backgroundColor = 'var(--brand-teal-light, #1A6B6B)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.backgroundColor = 'var(--brand-teal, #0D4F4F)';
        }}
      >
        Enter
      </button>

      {/* Subtle "tap anywhere" hint */}
      <p
        style={{
          position: 'absolute',
          bottom: '32px',
          fontSize: '0.72rem',
          color: 'rgba(148, 163, 184, 0.4)',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          fontWeight: '600',
          animation: 'welcomePulse 3s ease-in-out infinite',
          animationDelay: '2s',
          opacity: 0,
        }}
      >
        Tap anywhere to continue
      </p>
    </div>
  );
}
