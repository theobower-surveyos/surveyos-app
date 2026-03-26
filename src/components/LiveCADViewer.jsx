import React, { useState, useRef } from 'react';

export default function LiveCADViewer({ points, interactive = true }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedPoint, setSelectedPoint] = useState(null);
  const svgRef = useRef(null);

  if (!points || points.length === 0) {
    return (
      <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1B2D', borderRadius: '12px', border: '1px solid #1e293b', color: '#64748b', fontWeight: 'bold' }}>
        Waiting for Field Sync...
      </div>
    );
  }

  // --- Coordinate Math ---
  const padding = 50; 
  const eastings = points.map(p => Number(p?.easting) || 0);
  const northings = points.map(p => Number(p?.northing) || 0);
  const minE = Math.min(...eastings); const maxE = Math.max(...eastings);
  const minN = Math.min(...northings); const maxN = Math.max(...northings);
  const rangeE = maxE - minE || 10; const rangeN = maxN - minN || 10;

  // --- Pan & Zoom Handlers (Only fire if interactive) ---
  const handleWheel = (e) => {
    if (!interactive) return;
    e.preventDefault();
    const scaleAdjust = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({ ...prev, scale: Math.max(0.5, Math.min(prev.scale * scaleAdjust, 10)) }));
  };

  const handlePointerDown = (e) => {
    if (!interactive) return;
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - transform.x, y: clientY - transform.y });
  };

  const handlePointerMove = (e) => {
    if (!interactive || !isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setTransform(prev => ({ ...prev, x: clientX - dragStart.x, y: clientY - dragStart.y }));
  };

  const handlePointerUp = () => {
    if (interactive) setIsDragging(false);
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setSelectedPoint(null);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '500px', backgroundColor: '#0F1B2D', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', touchAction: interactive ? 'none' : 'auto' }}>
      
      {/* Grid Background */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.3 }}></div>
      
      {/* Controls & Legend */}
      <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 20 }}>
        {interactive && (
          <button onClick={resetView} style={{ padding: '8px 12px', backgroundColor: '#1e293b', color: '#F8FAFC', border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
            🏠 Reset View
          </button>
        )}
        <div style={{ backgroundColor: 'rgba(15, 27, 45, 0.85)', padding: '12px', borderRadius: '8px', border: '1px solid #334155', color: '#F8FAFC', fontSize: '11px', fontFamily: 'monospace', backdropFilter: 'blur(4px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><div style={{ width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '10px solid #c026d3' }}></div> Control</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><div style={{ width: '10px', height: '10px', backgroundColor: '#059669', borderRadius: '50%' }}></div> Boundary</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}><div style={{ width: '10px', height: '10px', border: '2px solid #3b82f6' }}></div> Design</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '10px', height: '10px', backgroundColor: '#3b82f6', borderRadius: '50%' }}></div> As-Built</div>
        </div>
      </div>

      {/* Point Inspector Card (Only shows if interactive) */}
      {interactive && selectedPoint && (
        <div style={{ position: 'absolute', bottom: '15px', left: '15px', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 20, minWidth: '200px', borderLeft: `4px solid ${selectedPoint.point_type === 'control' ? '#c026d3' : '#059669'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '1.1em', color: '#0f172a' }}>Pt {selectedPoint.point_number || '-'}</strong>
            <button onClick={() => setSelectedPoint(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', color: '#94a3b8' }}>&times;</button>
          </div>
          <p style={{ margin: '0 0 4px 0', fontSize: '0.9em', color: '#475569', fontWeight: 'bold', textTransform: 'capitalize' }}>{(selectedPoint.point_type || 'boundary').replace(/_/g, ' ')}</p>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85em', color: '#334155', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '4px' }}>
            <div>N: {Number(selectedPoint.northing).toFixed(3)}</div>
            <div>E: {Number(selectedPoint.easting).toFixed(3)}</div>
            <div>Z: {Number(selectedPoint.elevation).toFixed(3)}</div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.9em', color: '#0f172a' }}><strong>Desc:</strong> {selectedPoint.description || 'N/A'}</p>
        </div>
      )}

      {/* The SVG Canvas */}
      <svg 
        ref={svgRef}
        viewBox="0 0 800 500" 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: interactive ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        onWheel={interactive ? handleWheel : undefined}
        onMouseDown={interactive ? handlePointerDown : undefined} 
        onMouseMove={interactive ? handlePointerMove : undefined} 
        onMouseUp={interactive ? handlePointerUp : undefined} 
        onMouseLeave={interactive ? handlePointerUp : undefined}
        onTouchStart={interactive ? handlePointerDown : undefined} 
        onTouchMove={interactive ? handlePointerMove : undefined} 
        onTouchEnd={interactive ? handlePointerUp : undefined}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          
          {/* Auto-Linework */}
          {points.filter(p => p && String(p.point_type || 'boundary') === 'boundary').length > 1 && (
            <polyline 
              fill="none" stroke="#059669" strokeWidth={2 / transform.scale} strokeDasharray={`${6/transform.scale},${4/transform.scale}`}
              points={points.filter(p => p && String(p.point_type || 'boundary') === 'boundary').map(p => {
                const x = padding + ((Number(p.easting || 0) - minE) / rangeE) * (800 - padding * 2);
                const y = 500 - padding - ((Number(p.northing || 0) - minN) / rangeN) * (500 - padding * 2);
                return `${x},${y}`;
              }).join(' ')}
            />
          )}

          {/* Plotting Points */}
          {points.map((p, i) => {
            if (!p) return null;
            const x = padding + ((Number(p.easting || 0) - minE) / rangeE) * (800 - padding * 2);
            const y = 500 - padding - ((Number(p.northing || 0) - minN) / rangeN) * (500 - padding * 2);
            
            let shape;
            const pType = String(p.point_type || 'boundary');
            const strokeW = 1.5 / transform.scale;
            
            if (pType === 'control') shape = <polygon points={`${x},${y-8} ${x-8},${y+6} ${x+8},${y+6}`} fill="#c026d3" stroke="#fff" strokeWidth={strokeW} />;
            else if (pType === 'monument_found') shape = <polygon points={`${x},${y-8} ${x-8},${y+6} ${x+8},${y+6}`} fill="#ef4444" stroke="#fff" strokeWidth={strokeW} />;
            else if (pType === 'design_stake') shape = <rect x={x-6} y={y-6} width="12" height="12" fill="none" stroke="#3b82f6" strokeWidth={strokeW*2} />;
            else if (pType === 'as_built_stake') shape = <circle cx={x} cy={y} r="6" fill="#3b82f6" stroke="#fff" strokeWidth={strokeW} />;
            else shape = <circle cx={x} cy={y} r="6" fill="#059669" stroke="#fff" strokeWidth={strokeW} />;

            const isSelected = selectedPoint?.id === p.id;

            return (
              <g 
                key={p.id || i} 
                onClick={(e) => { if(interactive) { e.stopPropagation(); setSelectedPoint(p); } }}
                onTouchEnd={(e) => { if(interactive) { e.stopPropagation(); setSelectedPoint(p); } }}
                style={{ cursor: interactive ? 'pointer' : 'default' }}
              >
                {isSelected && <circle cx={x} cy={y} r="12" fill="none" stroke="#F59E0B" strokeWidth={3 / transform.scale} strokeDasharray={`${4/transform.scale}`} style={{ animation: 'spin 4s linear infinite' }} />}
                {shape}
                {/* Always show point numbers on static view, otherwise hide until zoomed/selected */}
                {(!interactive || transform.scale > 1.5 || isSelected) && (
                  <text x={x + (10 / transform.scale)} y={y - (10 / transform.scale)} fill={isSelected ? "#F59E0B" : "#e2e8f0"} fontSize={12 / transform.scale} fontFamily="monospace" fontWeight="bold">
                    {p.point_number || i}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}