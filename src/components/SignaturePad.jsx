import React, { useRef, useState, useEffect } from 'react';

const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif";

export default function SignaturePad({ onSign, signerName, onNameChange, disabled }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d1d1f';
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    if (disabled) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing || disabled) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasStrokes(true);
  };

  const endDraw = (e) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasStrokes(false);
  };

  // Generate SHA-256 hash of the raw canvas pixel data for tamper evidence
  const getPixelHash = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = imageData.data.buffer;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSign = async () => {
    if (!hasStrokes || !signerName.trim()) return;

    const canvas = canvasRef.current;
    const pixelHash = await getPixelHash();

    // Export as PNG blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    onSign({
      blob,
      pixelHash,
      signerName: signerName.trim(),
      signedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
    });
  };

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Signer name */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
          Print Full Name
        </label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="John A. Smith"
          disabled={disabled}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '8px',
            border: '1px solid #e2e8f0', fontSize: '1rem', fontFamily: FONT,
            color: '#1d1d1f', boxSizing: 'border-box', outline: 'none',
            backgroundColor: disabled ? '#f1f5f9' : '#fff',
          }}
        />
      </div>

      {/* Canvas */}
      <div style={{
        border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden',
        backgroundColor: '#fff', position: 'relative',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%', height: '160px', display: 'block',
            cursor: disabled ? 'not-allowed' : 'crosshair',
            touchAction: 'none',
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && !disabled && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: '#cbd5e1', fontSize: '0.9rem', pointerEvents: 'none', userSelect: 'none',
          }}>
            Sign above
          </div>
        )}
        {/* Signature line */}
        <div style={{ position: 'absolute', bottom: '30px', left: '20px', right: '20px', height: '1px', backgroundColor: '#e2e8f0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '12px', left: '20px', fontSize: '0.65rem', color: '#cbd5e1', pointerEvents: 'none' }}>
          X
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          onClick={clear}
          disabled={disabled || !hasStrokes}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
            backgroundColor: '#fff', color: '#64748b', fontSize: '0.85rem', fontWeight: '600',
            cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT,
          }}
        >
          Clear
        </button>
        <button
          onClick={handleSign}
          disabled={disabled || !hasStrokes || !signerName.trim()}
          style={{
            flex: 1, padding: '12px 20px', borderRadius: '8px', border: 'none',
            backgroundColor: (hasStrokes && signerName.trim() && !disabled) ? '#059669' : '#e2e8f0',
            color: (hasStrokes && signerName.trim() && !disabled) ? '#fff' : '#94a3b8',
            fontSize: '0.95rem', fontWeight: '700', cursor: (hasStrokes && signerName.trim()) ? 'pointer' : 'not-allowed',
            fontFamily: FONT, transition: 'background-color 0.2s ease',
          }}
        >
          Accept & Sign
        </button>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center' }}>
        By signing, you confirm acceptance of the survey deliverables. This signature is legally binding under ESIGN Act.
      </p>
    </div>
  );
}
