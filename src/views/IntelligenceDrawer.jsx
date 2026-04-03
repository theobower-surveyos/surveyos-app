import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import {
  X,
  Camera,
  ClipboardCheck,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  ZoomIn,
  ScanLine,
  Hash,
  Loader,
} from "lucide-react";

// ─── System Font Stack ───────────────────────────────────────────────
const FONT_SYSTEM =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace';

// ─── Palette ─────────────────────────────────────────────────────────
const C = {
  bg: "#0A0A0A",
  surface: "#111111",
  surfaceHover: "#1A1A1A",
  border: "rgba(255,255,255,0.08)",
  borderLight: "rgba(255,255,255,0.12)",
  text: "#F5F5F7",
  textSecondary: "rgba(255,255,255,0.55)",
  textTertiary: "rgba(255,255,255,0.35)",
  accent: "#0F6E56",
  accentGlow: "rgba(15,110,86,0.25)",
  pass: "#34D399",
  passBg: "rgba(52,211,153,0.08)",
  fail: "#FF453A",
  failBg: "rgba(255,69,58,0.08)",
  overlay: "rgba(0,0,0,0.6)",
};

// ─── Radial Error Tolerance ──────────────────────────────────────────
const TOLERANCE = 0.05;

// ─── Thumbnail component ────────────────────────────────────────────
function PhotoCard({ photo }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        border: `1px solid ${hovered ? C.borderLight : C.border}`,
        background: C.surface,
        cursor: "pointer",
        transform: hovered ? "scale(1.03)" : "scale(1)",
        transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        boxShadow: hovered
          ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)"
          : "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {/* Image area */}
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          background: `linear-gradient(145deg, ${C.surfaceHover}, #0D0D0D)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {photo.url ? (
          <img src={photo.url} alt={photo.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Camera
            size={28}
            strokeWidth={1.2}
            style={{
              color: C.textTertiary,
              opacity: hovered ? 0 : 1,
              transition: "opacity 0.25s ease",
            }}
          />
        )}

        {/* Hover overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: hovered ? C.accentGlow : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.3s ease",
          }}
        >
          <ZoomIn
            size={22}
            strokeWidth={1.5}
            style={{
              color: C.text,
              opacity: hovered ? 1 : 0,
              transform: hovered ? "scale(1)" : "scale(0.7)",
              transition: "all 0.25s ease",
            }}
          />
        </div>
      </div>

      {/* Caption */}
      <div style={{ padding: "10px 12px" }}>
        <div
          style={{
            fontFamily: FONT_SYSTEM,
            fontSize: 12,
            fontWeight: 500,
            color: C.text,
            lineHeight: 1.3,
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          {photo.label}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: C.textTertiary,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Clock size={10} strokeWidth={1.5} />
            {photo.time}
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: C.accent,
              letterSpacing: "0.02em",
            }}
          >
            {photo.coord}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Status Pill ─────────────────────────────────────────────────────
function StatusPill({ status }) {
  const pass = status === "Pass";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT_SYSTEM,
        letterSpacing: "0.03em",
        color: pass ? C.pass : C.fail,
        background: pass ? C.passBg : C.failBg,
        border: `1px solid ${pass ? "rgba(52,211,153,0.15)" : "rgba(255,69,58,0.15)"}`,
      }}
    >
      {pass ? (
        <CheckCircle2 size={12} strokeWidth={2} />
      ) : (
        <XCircle size={12} strokeWidth={2} />
      )}
      {status}
    </span>
  );
}

// ─── Tolerance Row ───────────────────────────────────────────────────
function ToleranceRow({ log, index }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.025)" : "transparent",
        transition: "background 0.2s ease",
      }}
    >
      <td style={tdStyle}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONT_MONO,
            fontSize: 12,
            color: C.text,
            fontWeight: 500,
          }}
        >
          <Hash size={11} strokeWidth={1.5} style={{ color: C.textTertiary }} />
          {log.ptId}
        </span>
      </td>
      <td style={tdStyle}>
        <span style={deltaStyle(log.dn)}>{log.dn > 0 ? "+" : ""}{log.dn.toFixed(3)}</span>
      </td>
      <td style={tdStyle}>
        <span style={deltaStyle(log.de)}>{log.de > 0 ? "+" : ""}{log.de.toFixed(3)}</span>
      </td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <StatusPill status={log.status} />
      </td>
    </tr>
  );
}

const thStyle = {
  padding: "10px 14px",
  textAlign: "left",
  fontFamily: FONT_SYSTEM,
  fontSize: 10,
  fontWeight: 600,
  color: C.textTertiary,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 14px",
  borderBottom: `1px solid ${C.border}`,
  verticalAlign: "middle",
};

const deltaStyle = (val) => ({
  fontFamily: FONT_MONO,
  fontSize: 12,
  fontWeight: 400,
  color: Math.abs(val) > 0.02 ? C.fail : C.textSecondary,
  letterSpacing: "0.02em",
});

// ─── Loading Skeleton ────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
      <Loader size={28} strokeWidth={1.5} style={{ color: C.accent, animation: "spin 1.2s linear infinite" }} />
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.textTertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>Loading telemetry...</span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main Drawer ─────────────────────────────────────────────────────
export default function IntelligenceDrawer({ isOpen = false, onClose = () => {}, projectId = null }) {
  const [tab, setTab] = useState("photos");
  const [photos, setPhotos] = useState([]);
  const [mathLogs, setMathLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    let cancelled = false;
    setIsLoading(true);

    async function fetchTelemetry() {
      try {
        // Fetch math logs
        const { data: logData, error: logErr } = await supabase
          .from("math_logs")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        if (logErr) console.error("[Intel] math_logs error:", logErr.message);

        if (!cancelled && logData) {
          setMathLogs(logData.map((row, i) => {
            const dn = row.delta_n || 0;
            const de = row.delta_e || 0;
            const radial = Math.sqrt(Math.pow(dn, 2) + Math.pow(de, 2));
            return {
              ptId: row.id ? `CP-${String(i + 1).padStart(3, "0")}` : `CP-${i}`,
              dn,
              de,
              radial,
              status: radial <= TOLERANCE ? "Pass" : "Fail",
            };
          }));
        }

        // Fetch photos from storage
        const { data: fileList, error: fileErr } = await supabase.storage
          .from("project-photos")
          .list(projectId);
        if (fileErr) console.error("[Intel] photos list error:", fileErr.message);

        if (!cancelled && fileList) {
          const parsed = fileList
            .filter((f) => f.name !== ".emptyFolderPlaceholder")
            .map((file) => {
              const { data: urlData } = supabase.storage
                .from("project-photos")
                .getPublicUrl(`${projectId}/${file.name}`);
              const created = file.created_at ? new Date(file.created_at) : new Date();
              return {
                id: file.id || file.name,
                label: file.name.replace(/\.\w+$/, "").replace(/[-_]/g, " "),
                url: urlData?.publicUrl || null,
                time: created.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                coord: "",
              };
            });
          setPhotos(parsed);
        }
      } catch (err) {
        console.error("[Intel] fetch exception:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchTelemetry();
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  const TABS = [
    { key: "photos", label: "Site Photos", icon: Camera },
    { key: "logs", label: "Tolerance Logs", icon: ScanLine },
  ];

  const passCount = mathLogs.filter((l) => l.status === "Pass").length;
  const failCount = mathLogs.filter((l) => l.status === "Fail").length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: C.overlay,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      />

      {/* Drawer Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          width: 480,
          maxWidth: "100vw",
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: isOpen
            ? "-24px 0 80px rgba(0,0,0,0.5)"
            : "none",
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.accent,
                    boxShadow: `0 0 8px ${C.accentGlow}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    fontWeight: 500,
                    color: C.accent,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Active Project
                </span>
              </div>
              <h2
                style={{
                  fontFamily: FONT_SYSTEM,
                  fontSize: 20,
                  fontWeight: 600,
                  color: C.text,
                  margin: 0,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.2,
                }}
              >
                {projectId ? projectId.substring(0, 8).toUpperCase() : "---"}
              </h2>
              <p
                style={{
                  fontFamily: FONT_SYSTEM,
                  fontSize: 13,
                  color: C.textSecondary,
                  margin: "4px 0 0",
                  letterSpacing: "-0.01em",
                }}
              >
                Field Intelligence
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close drawer"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.textSecondary,
                transition: "all 0.2s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.surfaceHover;
                e.currentTarget.style.color = C.text;
                e.currentTarget.style.borderColor = C.borderLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = C.textSecondary;
                e.currentTarget.style.borderColor = C.border;
              }}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          {/* ── Tab Bar ──────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              gap: 4,
              marginTop: 20,
              padding: 3,
              borderRadius: 10,
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}
          >
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: FONT_SYSTEM,
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 400,
                    color: active ? C.text : C.textTertiary,
                    background: active ? C.surfaceHover : "transparent",
                    boxShadow: active
                      ? "0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)"
                      : "none",
                    transition: "all 0.25s ease",
                    letterSpacing: "-0.01em",
                  }}
                >
                  <Icon size={14} strokeWidth={active ? 2 : 1.5} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Scrollable Content ──────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "20px 24px 32px",
          }}
        >
          {/* SITE PHOTOS TAB */}
          {tab === "photos" && (
            <div>
              {/* Section header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_SYSTEM,
                    fontSize: 12,
                    color: C.textSecondary,
                  }}
                >
                  {photos.length} photos captured
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: C.textTertiary,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <MapPin
                    size={10}
                    strokeWidth={1.5}
                    style={{ marginRight: 4, verticalAlign: "-1px" }}
                  />
                  GPS-tagged
                </span>
              </div>

              {/* Photo Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                }}
              >
                {isLoading ? <LoadingSkeleton /> : photos.length > 0 ? photos.map((photo) => (
                  <PhotoCard key={photo.id} photo={photo} />
                )) : (
                  <div style={{ gridColumn: "1 / -1", padding: "40px 0", textAlign: "center", color: C.textTertiary, fontFamily: FONT_SYSTEM, fontSize: 13 }}>
                    No photos uploaded for this project yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TOLERANCE LOGS TAB */}
          {tab === "logs" && (
            <div>
              {/* Summary pills */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: C.passBg,
                    border: `1px solid rgba(52,211,153,0.12)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: C.pass }} />
                  <div>
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 22,
                        fontWeight: 600,
                        color: C.pass,
                        lineHeight: 1,
                      }}
                    >
                      {passCount}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_SYSTEM,
                        fontSize: 10,
                        color: "rgba(52,211,153,0.7)",
                        marginTop: 2,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 500,
                      }}
                    >
                      Passed
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: C.failBg,
                    border: `1px solid rgba(255,69,58,0.12)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <XCircle size={18} strokeWidth={1.5} style={{ color: C.fail }} />
                  <div>
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 22,
                        fontWeight: 600,
                        color: C.fail,
                        lineHeight: 1,
                      }}
                    >
                      {failCount}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_SYSTEM,
                        fontSize: 10,
                        color: "rgba(255,69,58,0.7)",
                        marginTop: 2,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 500,
                      }}
                    >
                      Failed
                    </div>
                  </div>
                </div>
              </div>

              {/* Tolerance threshold */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 14,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                }}
              >
                <ClipboardCheck size={13} strokeWidth={1.5} style={{ color: C.accent }} />
                <span
                  style={{
                    fontFamily: FONT_SYSTEM,
                    fontSize: 11,
                    color: C.textSecondary,
                  }}
                >
                  Tolerance Threshold:
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.text,
                    marginLeft: "auto",
                  }}
                >
                  Radial ≤ 0.050 ft
                </span>
              </div>

              {/* Table */}
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  overflow: "hidden",
                  background: C.surface,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    borderSpacing: 0,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Point ID</th>
                      <th style={thStyle}>Delta N</th>
                      <th style={thStyle}>Delta E</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={4}><LoadingSkeleton /></td></tr>
                    ) : mathLogs.length > 0 ? mathLogs.map((log, i) => (
                      <ToleranceRow key={log.ptId} log={log} index={i} />
                    )) : (
                      <tr><td colSpan={4} style={{ padding: "40px 14px", textAlign: "center", color: C.textTertiary, fontFamily: FONT_SYSTEM, fontSize: 13 }}>No tolerance logs recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: `1px solid ${C.border}`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: C.textTertiary,
              letterSpacing: "0.03em",
            }}
          >
            SurveyOS • Intelligence Drawer v1
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: C.textTertiary,
            }}
          >
            Updated 2m ago
          </span>
        </div>
      </aside>
    </>
  );
}