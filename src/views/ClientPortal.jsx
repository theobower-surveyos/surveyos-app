import React, { useState } from 'react';
import LiveCADViewer from '../components/LiveCADViewer';

// SECURE CHECKOUT FUNCTION EMBEDDED DIRECTLY
function DemoStripeCheckout({ amount, onCancel, onSuccess }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const handlePay = () => { setIsProcessing(true); setTimeout(() => { setIsProcessing(false); onSuccess(); }, 2000); };
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 27, 45, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '20px', backdropFilter: 'blur(4px)' }}>
      <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2em', color: '#0f172a' }}>
            <span style={{ color: '#635BFF', fontWeight: 'bold' }}>stripe</span> Secure Checkout
          </h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
        </div>
        
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <p style={{ margin: '0 0 5px 0', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.85em' }}>Amount Due</p>
          <h1 style={{ margin: 0, fontSize: '2.5em', color: '#0f172a' }}>${Number(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</h1>
        </div>

        <button 
          onClick={handlePay} 
          disabled={isProcessing} 
          style={{ width: '100%', padding: '15px', backgroundColor: '#635BFF', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1em', fontWeight: 'bold', cursor: isProcessing ? 'wait' : 'pointer', transition: '0.2s', boxShadow: '0 4px 6px rgba(99, 91, 255, 0.2)' }}
        >
          {isProcessing ? 'Processing Payment...' : `Pay $${Number(amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}`}
        </button>
        <p style={{ textAlign: 'center', margin: '15px 0 0 0', fontSize: '0.75em', color: '#94a3b8' }}>🔒 256-bit AES encryption</p>
      </div>
    </div>
  );
}

export default function ClientPortal({ project, points, photos, onPaymentSuccess }) {
  const [showCheckout, setShowCheckout] = useState(false);

  if (!project) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>Loading secure project data...</div>;

  // The Automated Domino Logic
  const hasFieldData = points && points.length > 0;
  const isFieldComplete = project.status === 'field_complete' || project.status === 'completed';
  const hasInvoice = project.invoice_status === 'generated' || project.invoice_status === 'paid';
  const isPaid = project.invoice_status === 'paid';

  const steps = [
    { label: "Dispatched", active: true, pulse: !hasFieldData && !isFieldComplete },
    { label: "Fieldwork", active: hasFieldData || isFieldComplete, pulse: hasFieldData && !isFieldComplete },
    { label: "Drafting", active: isFieldComplete, pulse: isFieldComplete && !hasInvoice },
    { label: "Invoicing", active: hasInvoice, pulse: hasInvoice && !isPaid },
    { label: "Closed", active: isPaid, pulse: false }
  ];

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', padding: '40px 20px', fontFamily: 'sans-serif' }}>
      
      {showCheckout && <DemoStripeCheckout amount={project.invoice_amount} onCancel={() => setShowCheckout(false)} onSuccess={() => { setShowCheckout(false); onPaymentSuccess(); }} />}
      
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ backgroundColor: '#0F1B2D', padding: '40px 30px', borderRadius: '12px 12px 0 0', color: '#F8FAFC', textAlign: 'center', borderBottom: '4px solid #C9963B', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '2.2em' }}>{project.project_name}</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '1.1em', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 'bold' }}>Live Survey Progress Tracker</p>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '40px', borderRadius: '0 0 12px 12px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', borderTop: 'none' }}>
          
          {/* THE DOMINO TRACKER */}
          <div style={{ marginBottom: '50px', overflowX: 'auto', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', minWidth: '600px' }}>
              <div style={{ position: 'absolute', top: '20px', left: '50px', right: '50px', height: '4px', backgroundColor: '#e2e8f0', zIndex: 0 }}></div>
              
              {steps.map((step, idx) => (
                <div key={idx} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                  <div style={{ 
                    width: '40px', height: '40px', borderRadius: '50%', 
                    backgroundColor: step.active ? '#059669' : '#f8fafc', 
                    border: `4px solid ${step.active ? '#059669' : '#cbd5e1'}`,
                    display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '1.2em', fontWeight: 'bold',
                    boxShadow: step.pulse ? '0 0 0 8px rgba(5, 150, 105, 0.2)' : 'none',
                    animation: step.pulse ? 'pulse 2s infinite' : 'none',
                    transition: '0.4s'
                  }}>
                    {step.active && '✓'}
                  </div>
                  <p style={{ margin: '12px 0 0 0', fontSize: '0.9em', textAlign: 'center', fontWeight: 'bold', color: step.active ? '#0f172a' : '#94a3b8', textTransform: 'uppercase' }}>
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
            <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.4); } 70% { box-shadow: 0 0 0 12px rgba(5, 150, 105, 0); } 100% { box-shadow: 0 0 0 0 rgba(5, 150, 105, 0); } }`}</style>
          </div>

          {/* FINANCIALS BLOCK */}
          {hasInvoice && (
            <div style={{ backgroundColor: isPaid ? '#f0fdf4' : '#f8fafc', padding: '30px', borderRadius: '12px', border: `2px solid ${isPaid ? '#22c55e' : '#e2e8f0'}`, marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <p style={{ margin: '0 0 5px 0', fontSize: '0.95em', color: isPaid ? '#166534' : '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>{isPaid ? 'Balance Paid in Full' : 'Outstanding Balance'}</p>
                <p style={{ margin: 0, fontSize: '2.5em', fontWeight: 'bold', color: isPaid ? '#16a34a' : '#0f172a' }}>${Number(project.invoice_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
              </div>
              {!isPaid && (
                <button onClick={() => setShowCheckout(true)} style={{ padding: '15px 30px', backgroundColor: '#635BFF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1em', boxShadow: '0 4px 6px rgba(99, 91, 255, 0.2)' }}>
                  Pay Securely via Stripe &rarr;
                </button>
              )}
              {isPaid && <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#166534', padding: '10px 20px', backgroundColor: '#dcfce7', borderRadius: '8px' }}>✅ Invoice Settled</div>}
            </div>
          )}

          {/* LIVE CAD GEOMETRY */}
          <div style={{ marginBottom: '40px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>📐 Live Site Geometry</h3>
            <LiveCADViewer points={points} interactive={false} />
          </div>

          {/* GEOTAGGED PHOTOS */}
          {photos && photos.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 20px 0', color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' }}>📷 Field Documentation</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                {photos.map((photo, i) => (
                  <div key={i} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f8fafc', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <img src={photo.url} alt={`Site photo ${i}`} style={{ width: '100%', height: '220px', objectFit: 'cover' }} />
                    <div style={{ padding: '15px' }}>
                      {photo.lat && photo.lng ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', fontWeight: 'bold', fontSize: '0.85em', marginBottom: '8px' }}>
                            📍 GPS Verified
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.85em', color: '#475569', backgroundColor: '#e2e8f0', padding: '8px', borderRadius: '4px' }}>
                            Lat: {photo.lat.toFixed(5)}<br/>
                            Lng: {photo.lng.toFixed(5)}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: '0.85em', color: '#64748b', fontStyle: 'italic' }}>No GPS metadata attached</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}