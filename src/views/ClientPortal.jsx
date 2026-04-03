import { useState, useEffect, useCallback, useRef } from "react";

// ─── MOCK DATA (Replace with Supabase queries) ────────────────────────────────
const currentClient = "Pulte Homes";

const MOCK_PROJECTS = [
  {
    id: "p-001",
    project_name: "Estrella Phase IV - Lot 42",
    client_name: "Pulte Homes",
    status: "Stakes Set",
    status_color: "#34D399",
    lat: 33.4352,
    lng: -112.1853,
    qa_pass: true,
    address: "18203 W Stella Ln, Goodyear, AZ 85338",
    crew: "Crew Alpha",
    last_updated: "2026-03-28T14:22:00",
    photos: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80",
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&q=80",
    ],
  },
  {
    id: "p-002",
    project_name: "Vistancia Parcel 7B",
    client_name: "Pulte Homes",
    status: "Pending Stakeout",
    status_color: "#FBBF24",
    lat: 33.7215,
    lng: -112.2948,
    qa_pass: null,
    address: "28411 N 124th Dr, Peoria, AZ 85383",
    crew: "Unassigned",
    last_updated: "2026-03-30T09:05:00",
    photos: [],
  },
  {
    id: "p-003",
    project_name: "Cadence at Gateway - Lot 118",
    client_name: "Pulte Homes",
    status: "Field Complete",
    status_color: "#34D399",
    lat: 33.3048,
    lng: -111.7281,
    qa_pass: true,
    address: "4820 S Meridian Rd, Mesa, AZ 85212",
    crew: "Crew Bravo",
    last_updated: "2026-03-27T16:40:00",
    photos: [
      "https://images.unsplash.com/photo-1590274853856-f22d5ee3d228?w=400&q=80",
      "https://images.unsplash.com/photo-1513467535987-db81bc0d0c8b?w=400&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80",
    ],
  },
  {
    id: "p-004",
    project_name: "Verrado Highlands - Lot 9",
    client_name: "Pulte Homes",
    status: "Revision Required",
    status_color: "#EF4444",
    lat: 33.4612,
    lng: -112.4531,
    qa_pass: false,
    address: "21109 W Pasadena Ave, Buckeye, AZ 85396",
    crew: "Crew Alpha",
    last_updated: "2026-03-29T11:18:00",
    photos: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80",
    ],
  },
  {
    id: "p-005",
    project_name: "Morrison Ranch Parcel 3",
    client_name: "Pulte Homes",
    status: "Stakes Set",
    status_color: "#34D399",
    lat: 33.3291,
    lng: -111.6742,
    qa_pass: true,
    address: "10220 E Camelback Rd, Gilbert, AZ 85297",
    crew: "Crew Charlie",
    last_updated: "2026-03-31T08:55:00",
    photos: [
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=400&q=80",
      "https://images.unsplash.com/photo-1590274853856-f22d5ee3d228?w=400&q=80",
    ],
  },
];

// ─── ICONS (inline SVG to avoid lucide-react import issues in artifact) ───────
const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertCircleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const CameraIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return "Just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getQABadge(qa_pass) {
  if (qa_pass === true)
    return { label: "QA Pass", icon: <CheckCircleIcon />, color: "#34D399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.2)" };
  if (qa_pass === false)
    return { label: "QA Fail", icon: <AlertCircleIcon />, color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)" };
  return { label: "Pending", icon: <ClockIcon />, color: "#FBBF24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.2)" };
}

// ─── PULSING MAP MARKER COMPONENT ─────────────────────────────────────────────
function PulsingMarker({ project, onClick, isSelected }) {
  const color = project.status_color;
  return (
    <div
      onClick={() => onClick(project)}
      style={{
        position: "absolute",
        cursor: "pointer",
        zIndex: isSelected ? 50 : 10,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Outer pulse ring */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: color,
          opacity: 0.15,
          animation: "surveyos-pulse 2s ease-in-out infinite",
        }}
      />
      {/* Inner dot */}
      <div
        style={{
          position: "relative",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: color,
          border: `2px solid ${isSelected ? "#fff" : "rgba(255,255,255,0.3)"}`,
          boxShadow: `0 0 12px ${color}88`,
          transition: "all 0.3s ease",
          transform: isSelected ? "scale(1.3)" : "scale(1)",
        }}
      />
    </div>
  );
}

// ─── PHOTO LIGHTBOX ────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        cursor: "zoom-out",
        animation: "surveyos-fadein 0.2s ease",
      }}
    >
      <img
        src={src}
        alt="Field photo"
        style={{
          maxWidth: "90vw",
          maxHeight: "85vh",
          borderRadius: 8,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 24,
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
        }}
      >
        <XIcon />
      </div>
    </div>
  );
}

// ─── DETAIL DRAWER ─────────────────────────────────────────────────────────────
function ClientDrawer({ project, onClose }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const qa = getQABadge(project?.qa_pass);

  return (
    <>
      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: project ? "rgba(0,0,0,0.4)" : "transparent",
          backdropFilter: project ? "blur(4px)" : "none",
          pointerEvents: project ? "auto" : "none",
          transition: "all 0.3s ease",
          opacity: project ? 1 : 0,
        }}
      />

      {/* Drawer Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: "100vw",
          zIndex: 200,
          background: "#0A0A0A",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          transform: project ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {project && (
          <>
            {/* Drawer Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.35)",
                    marginBottom: 6,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                  }}
                >
                  Project Details
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: "#fff",
                    lineHeight: 1.3,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                >
                  {project.project_name}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  padding: 6,
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                }}
              >
                <XIcon />
              </button>
            </div>

            {/* Drawer Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* Status Card */}
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.35)",
                    marginBottom: 14,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                  }}
                >
                  Operation Status
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Status badge */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Field Status</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: project.status_color,
                        background: `${project.status_color}15`,
                        border: `1px solid ${project.status_color}30`,
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      }}
                    >
                      {project.status}
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                  {/* QA badge */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Quality Assurance</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: qa.color,
                        background: qa.bg,
                        border: `1px solid ${qa.border}`,
                        padding: "4px 12px",
                        borderRadius: 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      }}
                    >
                      {qa.icon}
                      {qa.label}
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                  {/* Address */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>Address</span>
                    <span
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.8)",
                        textAlign: "right",
                        lineHeight: 1.4,
                      }}
                    >
                      {project.address}
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

                  {/* Last updated */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Last Activity</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                      {formatDate(project.last_updated)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Field Photos */}
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "rgba(255,255,255,0.35)",
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                    }}
                  >
                    Field Photos
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <ImageIcon />
                    {project.photos.length}
                  </div>
                </div>

                {project.photos.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                    }}
                  >
                    {project.photos.map((src, i) => (
                      <div
                        key={i}
                        onClick={() => setLightboxSrc(src)}
                        style={{
                          position: "relative",
                          borderRadius: 8,
                          overflow: "hidden",
                          aspectRatio: "4/3",
                          cursor: "zoom-in",
                          border: "1px solid rgba(255,255,255,0.06)",
                          transition: "all 0.3s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                          e.currentTarget.style.transform = "scale(1.02)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <img
                          src={src}
                          alt={`Field photo ${i + 1}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "32px 0",
                      color: "rgba(255,255,255,0.2)",
                      gap: 8,
                    }}
                  >
                    <CameraIcon />
                    <span style={{ fontSize: 12 }}>No photos uploaded yet</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── STAT PILL ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 8px ${color}66`,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

// ─── SIMPLE MAP (CSS-based, no react-leaflet dep for artifact) ─────────────────
// NOTE: In production, swap this for your react-leaflet <MapContainer> setup.
// This renders a dark tile-based map via an <iframe> for artifact portability.
function DarkMap({ projects, selectedId, onSelectProject }) {
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Phoenix center
  const center = { lat: 33.4484, lng: -112.074 };
  const zoom = 10;

  // Simple lat/lng to pixel projection (Mercator approximation for demo)
  const mapW = 1200;
  const mapH = 700;

  function project(lat, lng) {
    const scale = Math.pow(2, zoom) * 256;
    const worldX = ((lng + 180) / 360) * scale;
    const latRad = (lat * Math.PI) / 180;
    const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
    const centerX = ((center.lng + 180) / 360) * scale;
    const centerLatRad = (center.lat * Math.PI) / 180;
    const centerY =
      ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale;

    return {
      x: worldX - centerX + mapW / 2,
      y: worldY - centerY + mapH / 2,
    };
  }

  return (
    <div
      ref={mapRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#0d0d0d",
        overflow: "hidden",
        borderRadius: 0,
      }}
    >
      {/* Dark tile map background */}
      <img
        src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/-112.074,33.4484,${zoom},0/1200x700@2x?access_token=REDACTED_USE_ENV`}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0,
          pointerEvents: "none",
        }}
        onLoad={() => setMapLoaded(true)}
      />

      {/* Fallback: CSS dark grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse at center, rgba(15,110,86,0.06) 0%, transparent 70%),
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 40px 40px, 40px 40px",
        }}
      />

      {/* Topographic contour suggestion */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.04 }}
        viewBox={`0 0 ${mapW} ${mapH}`}
        preserveAspectRatio="none"
      >
        <ellipse cx="400" cy="350" rx="300" ry="180" fill="none" stroke="#0F6E56" strokeWidth="1" />
        <ellipse cx="400" cy="350" rx="220" ry="130" fill="none" stroke="#0F6E56" strokeWidth="0.8" />
        <ellipse cx="400" cy="350" rx="140" ry="80" fill="none" stroke="#0F6E56" strokeWidth="0.6" />
        <ellipse cx="820" cy="250" rx="200" ry="150" fill="none" stroke="#0F6E56" strokeWidth="0.8" />
        <ellipse cx="820" cy="250" rx="120" ry="90" fill="none" stroke="#0F6E56" strokeWidth="0.6" />
        <ellipse cx="200" cy="550" rx="180" ry="100" fill="none" stroke="#0F6E56" strokeWidth="0.7" />
      </svg>

      {/* "PHOENIX METRO" label */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 20,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.15)",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}
      >
        Phoenix Metropolitan Area · NAD83 AZ Central
      </div>

      {/* Coordinate overlay */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 20,
          fontSize: 10,
          color: "rgba(255,255,255,0.2)",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          textAlign: "right",
          lineHeight: 1.6,
        }}
      >
        33.4484°N 112.0740°W
        <br />
        Z{zoom} · EPSG:4326
      </div>

      {/* Project markers */}
      {projects.map((p) => {
        const pos = project(p.lat, p.lng);
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
            }}
          >
            <PulsingMarker
              project={p}
              onClick={onSelectProject}
              isSelected={selectedId === p.id}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── PROJECT LIST ITEM (bottom strip) ──────────────────────────────────────────
function ProjectListItem({ project, isSelected, onClick }) {
  return (
    <button
      onClick={() => onClick(project)}
      style={{
        background: isSelected ? "rgba(15,110,86,0.12)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${isSelected ? "rgba(15,110,86,0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 10,
        padding: "12px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.25s ease",
        minWidth: 220,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: project.status_color,
            boxShadow: `0 0 6px ${project.status_color}66`,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          {project.project_name}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 15 }}>
        <span style={{ fontSize: 11, color: project.status_color, fontWeight: 500 }}>{project.status}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>·</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{formatDate(project.last_updated)}</span>
      </div>
    </button>
  );
}

// ─── MAIN CLIENT PORTAL ────────────────────────────────────────────────────────
export default function ClientPortal() {
  const [selectedProject, setSelectedProject] = useState(null);
  const clientProjects = MOCK_PROJECTS.filter((p) => p.client_name === currentClient);

  const statusCounts = {
    active: clientProjects.filter((p) => ["Stakes Set", "Field Complete"].includes(p.status)).length,
    pending: clientProjects.filter((p) => p.status === "Pending Stakeout").length,
    revision: clientProjects.filter((p) => p.status === "Revision Required").length,
    total: clientProjects.length,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Keyframe injection ── */}
      <style>{`
        @keyframes surveyos-pulse {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.15; }
          50% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
        }
        @keyframes surveyos-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes surveyos-slidein {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* ── TOP NAV ── */}
      <header
        style={{
          height: 56,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Logo mark */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg, #0F6E56, #0F6E56dd)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              letterSpacing: "-0.01em",
            }}
          >
            SurveyOS
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "2px 8px",
              borderRadius: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Client Portal
          </span>
        </div>

        <button
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "6px 14px",
            cursor: "pointer",
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s ease",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "rgba(255,255,255,0.6)";
          }}
        >
          <LogOutIcon />
          Log Out
        </button>
      </header>

      {/* ── WELCOME BAR + STATS ── */}
      <div
        style={{
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.5)",
          flexShrink: 0,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
            Active Operations for{" "}
            <span style={{ color: "#0F6E56" }}>{currentClient}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Real-time field status across the Phoenix Metro area
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="Complete" value={statusCounts.active} color="#34D399" />
          <StatPill label="Pending" value={statusCounts.pending} color="#FBBF24" />
          <StatPill label="Revision" value={statusCounts.revision} color="#EF4444" />
        </div>
      </div>

      {/* ── MAP AREA ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <DarkMap
          projects={clientProjects}
          selectedId={selectedProject?.id}
          onSelectProject={setSelectedProject}
        />
      </div>

      {/* ── BOTTOM PROJECT STRIP ── */}
      <div
        style={{
          padding: "14px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexShrink: 0,
          overflowX: "auto",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          {clientProjects.map((p) => (
            <ProjectListItem
              key={p.id}
              project={p}
              isSelected={selectedProject?.id === p.id}
              onClick={setSelectedProject}
            />
          ))}
        </div>
      </div>

      {/* ── DRAWER ── */}
      <ClientDrawer project={selectedProject} onClose={() => setSelectedProject(null)} />
    </div>
  );
}