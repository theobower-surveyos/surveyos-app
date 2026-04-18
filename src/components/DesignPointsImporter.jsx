import React, { useEffect, useRef, useState } from 'react';
import {
    UploadCloud,
    FileText,
    X,
    Loader,
    AlertCircle,
    CheckCircle2,
    ArrowRight,
} from 'lucide-react';
import { detectCSVColumns, parseJXLPoints } from '../utils/stakeoutQC.js';

const ACCEPT = '.csv,.txt,.jxl,.xml';

const ROLE_OPTIONS = [
    { value: 'ignore', label: 'Ignore' },
    { value: 'point_id', label: 'Point ID' },
    { value: 'n', label: 'Northing' },
    { value: 'e', label: 'Easting' },
    { value: 'z', label: 'Elevation' },
    { value: 'code', label: 'Feature code' },
];

const REQUIRED_ROLES = ['point_id', 'n', 'e'];

function detectFormat(file) {
    const name = (file?.name || '').toLowerCase();
    if (name.endsWith('.jxl') || name.endsWith('.xml')) return 'jxl';
    return 'csv';
}

function mappingFromDetected(detected) {
    const m = {};
    if (detected) {
        if (detected.point_id != null) m[detected.point_id] = 'point_id';
        if (detected.n != null) m[detected.n] = 'n';
        if (detected.e != null) m[detected.e] = 'e';
        if (detected.z != null) m[detected.z] = 'z';
        if (detected.code != null) m[detected.code] = 'code';
    }
    return m;
}

function mappingToIndices(mapping) {
    const out = { point_id: null, n: null, e: null, z: null, code: null };
    Object.entries(mapping || {}).forEach(([idx, role]) => {
        if (role && role !== 'ignore') out[role] = Number(idx);
    });
    return out;
}

function validateMapping(mapping) {
    const idx = mappingToIndices(mapping);
    const missing = REQUIRED_ROLES.filter((r) => idx[r] == null);
    return { valid: missing.length === 0, missing, indices: idx };
}

export default function DesignPointsImporter({
    supabase,
    profile,
    projectId,
    onImported,
    onCancel,
    onToast,
    initiallyVisible = true,
}) {
    const fileInputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [phase, setPhase] = useState('idle'); // idle | review | importing
    const [file, setFile] = useState(null);
    const [format, setFormat] = useState(null);

    // All error/success feedback now routes through onToast. Fall back to
    // console so silent failures are debuggable if no handler is passed.
    const emitToast = (kind, message) => {
        if (typeof onToast === 'function') onToast(kind, message);
        else if (kind === 'error') console.error('[Stakeout toast]', message);
    };

    // CSV state
    const [csvRows, setCsvRows] = useState([]); // array of arrays
    const [mapping, setMapping] = useState({}); // { colIndex: role }

    // JXL state
    const [jxlPoints, setJxlPoints] = useState([]);

    // Import progress
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // Load stored mapping from localStorage once per firm
    const storageKey = profile?.firm_id ? `surveyos:csvMapping:${profile.firm_id}` : null;

    function reset() {
        setPhase('idle');
        setFile(null);
        setFormat(null);
        setCsvRows([]);
        setMapping({});
        setJxlPoints([]);
        setProgress({ done: 0, total: 0 });
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleFile(selected) {
        if (!selected) return;
        setFile(selected);
        const fmt = detectFormat(selected);
        setFormat(fmt);

        try {
            if (fmt === 'jxl') {
                const points = await parseJXLPoints(selected);
                setJxlPoints(points);
                setPhase('review');
            } else {
                const Papa = (await import('papaparse')).default;
                const text = await selected.text();
                if (!text.trim()) {
                    setCsvRows([]);
                    setMapping({});
                    setPhase('review');
                    return;
                }
                const result = Papa.parse(text, { header: false, skipEmptyLines: true });
                const rows = Array.isArray(result.data) ? result.data : [];

                // Many TBC/Carlson exports have a header row. Detect a non-numeric first
                // row where subsequent rows ARE numeric-heavy, and use the second row
                // for column detection instead.
                let detectionRow = rows[0];
                if (rows.length >= 2) {
                    const firstHasAnyNumeric = (rows[0] || []).some((v) => {
                        const s = String(v ?? '').trim();
                        return s !== '' && !Number.isNaN(Number.parseFloat(s)) && /^-?\d+(\.\d+)?$/.test(s);
                    });
                    if (!firstHasAnyNumeric) detectionRow = rows[1];
                }

                const detected = detectCSVColumns(detectionRow || []);
                let m = mappingFromDetected(detected);

                // Overlay stored mapping if it fits the column count
                if (storageKey) {
                    try {
                        const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
                        if (stored && typeof stored === 'object' && rows[0]) {
                            const width = rows[0].length;
                            const fits = Object.keys(stored).every((k) => Number(k) < width);
                            if (fits) m = stored;
                        }
                    } catch {
                        // ignore bad JSON
                    }
                }

                setCsvRows(rows);
                setMapping(m);
                setPhase('review');
            }
        } catch (err) {
            console.error('[Stakeout] parse error:', err);
            emitToast('error', `Could not read "${selected.name}". It may not be a valid CSV or JXL.`);
            setPhase('idle');
            setFile(null);
            setFormat(null);
        }
    }

    function setColumnRole(colIndex, role) {
        setMapping((prev) => {
            const next = { ...prev };
            // Clear any other column that currently holds this role — each role
            // can map to only one column.
            if (role !== 'ignore') {
                for (const [k, v] of Object.entries(next)) {
                    if (v === role) delete next[k];
                }
            }
            if (role === 'ignore') {
                delete next[colIndex];
            } else {
                next[colIndex] = role;
            }
            return next;
        });
    }

    // ── Derived counts for CSV ─────────────────────────────────────
    const csvValidation = React.useMemo(() => {
        if (format !== 'csv' || csvRows.length === 0) return null;
        const check = validateMapping(mapping);
        if (!check.valid) {
            return { total: csvRows.length, parseable: 0, duplicates: 0, missingCoords: 0, ok: false, missing: check.missing };
        }
        const idx = check.indices;
        const seen = new Map();
        let parseable = 0;
        let duplicates = 0;
        let missingCoords = 0;
        const normRows = [];
        for (let i = 0; i < csvRows.length; i++) {
            const row = csvRows[i];
            if (!Array.isArray(row)) continue;
            const pidRaw = row[idx.point_id];
            const pid = pidRaw == null ? '' : String(pidRaw).trim();
            if (pid === '') continue;
            const n = Number.parseFloat(row[idx.n]);
            const e = Number.parseFloat(row[idx.e]);
            if (Number.isNaN(n) || Number.isNaN(e)) {
                missingCoords++;
                continue;
            }
            // Skip a row that looks like a header (the point_id cell itself
            // is non-alphanumeric-containing and both numerics parse, but
            // detected header has already been handled in detection row;
            // we still filter obvious text-only 'POINT' / 'NO' rows here).
            if (/^(point|pt|pid|no|num)$/i.test(pid)) continue;

            const z = idx.z != null ? Number.parseFloat(row[idx.z]) : NaN;
            const code = idx.code != null ? String(row[idx.code] ?? '').trim() : '';

            if (seen.has(pid)) duplicates++;
            seen.set(pid, true);

            parseable++;
            normRows.push({
                point_id: pid,
                northing: n,
                easting: e,
                elevation: Number.isNaN(z) ? null : z,
                feature_code: code || null,
                raw_row: i,
            });
        }
        return {
            total: csvRows.length,
            parseable,
            duplicates,
            missingCoords,
            ok: true,
            normalized: normRows,
        };
    }, [format, csvRows, mapping]);

    const importableCount = React.useMemo(() => {
        if (format === 'csv') return csvValidation?.ok ? csvValidation.parseable : 0;
        if (format === 'jxl') return jxlPoints.length;
        return 0;
    }, [format, csvValidation, jxlPoints]);

    async function runImport() {
        if (!projectId) {
            emitToast('error', 'No project selected.');
            return;
        }
        if (importableCount === 0) return;

        setPhase('importing');
        setProgress({ done: 0, total: importableCount });

        // Save the CSV mapping for next time.
        if (format === 'csv' && storageKey) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(mapping));
            } catch {
                // ignore quota / private-mode errors
            }
        }

        const sourceFile = file?.name || 'upload';
        const sourceFormat = format === 'jxl' ? 'jxl' : 'csv';
        const importedBy = profile?.id || null;

        const rows =
            format === 'csv'
                ? (csvValidation.normalized || []).map((r) => ({
                    project_id: projectId,
                    point_id: r.point_id,
                    feature_code: r.feature_code,
                    northing: r.northing,
                    easting: r.easting,
                    elevation: r.elevation,
                    source_file: sourceFile,
                    source_format: sourceFormat,
                    imported_by: importedBy,
                }))
                : jxlPoints.map((p) => ({
                    project_id: projectId,
                    point_id: p.point_id,
                    feature_code: p.code || null,
                    northing: p.n,
                    easting: p.e,
                    elevation: p.z,
                    source_file: sourceFile,
                    source_format: sourceFormat,
                    imported_by: importedBy,
                }));

        // Batched upsert — keeps request sizes reasonable for large imports
        // and gives us a visible progress indicator.
        const BATCH = 200;
        try {
            for (let i = 0; i < rows.length; i += BATCH) {
                const chunk = rows.slice(i, i + BATCH);
                const { error } = await supabase
                    .from('stakeout_design_points')
                    .upsert(chunk, { onConflict: 'project_id,point_id' });
                if (error) {
                    throw error;
                }
                setProgress({ done: Math.min(i + chunk.length, rows.length), total: rows.length });
            }
            emitToast(
                'success',
                `Imported ${rows.length} design point${rows.length === 1 ? '' : 's'}${sourceFile ? ` from ${sourceFile}` : ''}.`,
            );
            if (onImported) onImported(rows.length);
            reset();
        } catch (err) {
            console.error('[Stakeout] import error:', err);
            const code = err?.code ? ` (code ${err.code})` : '';
            emitToast('error', `Import failed${code}. Check console for details and try again.`);
            setPhase('review');
        }
    }

    // ── Drop zone handlers ─────────────────────────────────────────
    function onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!dragging) setDragging(true);
    }
    function onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    }
    function onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
    }

    if (!initiallyVisible && phase === 'idle') {
        return null;
    }

    // ── Render by phase ────────────────────────────────────────────
    if (phase === 'review') {
        return (
            <ReviewPanel
                file={file}
                format={format}
                csvRows={csvRows}
                mapping={mapping}
                setColumnRole={setColumnRole}
                csvValidation={csvValidation}
                jxlPoints={jxlPoints}
                importableCount={importableCount}
                onCancel={() => {
                    reset();
                    if (onCancel) onCancel();
                }}
                onImport={runImport}
            />
        );
    }

    if (phase === 'importing') {
        const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
        return (
            <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <Loader size={18} color="var(--brand-teal)" className="spinning" />
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                        Importing points… ({progress.done} of {progress.total})
                    </span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-dark)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--brand-teal)', transition: 'width 0.2s' }} />
                </div>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    // idle: drop zone
    const borderColor = dragging ? 'var(--brand-teal)' : 'var(--border-subtle)';
    const bg = dragging ? 'rgba(13, 79, 79, 0.15)' : 'var(--bg-surface)';
    return (
        <div>
            <label
                htmlFor="stakeout-file-input"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                    display: 'block',
                    border: `2px dashed ${borderColor}`,
                    borderRadius: '12px',
                    backgroundColor: bg,
                    padding: '40px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background-color 0.2s',
                }}
            >
                <input
                    id="stakeout-file-input"
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    style={{ display: 'none' }}
                />
                <UploadCloud size={36} color="var(--brand-teal)" style={{ marginBottom: '12px' }} />
                <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                    Drop CSV or JXL file
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Design points from Trimble Business Center or similar
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', opacity: 0.8 }}>
                    or click to browse · accepts .csv, .txt, .jxl, .xml
                </div>
            </label>
        </div>
    );
}

// ── Review panel ───────────────────────────────────────────────────────────

function ReviewPanel({
    file,
    format,
    csvRows,
    mapping,
    setColumnRole,
    csvValidation,
    jxlPoints,
    importableCount,
    onCancel,
    onImport,
}) {
    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={18} color="var(--brand-amber)" />
                    <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{file?.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {format === 'jxl' ? 'Trimble JobXML' : 'CSV / text'}
                        </div>
                    </div>
                </div>
                <button onClick={onCancel} style={cancelBtnStyle}>
                    <X size={14} /> Cancel
                </button>
            </div>

            {format === 'csv' ? (
                <CSVReview csvRows={csvRows} mapping={mapping} setColumnRole={setColumnRole} validation={csvValidation} />
            ) : (
                <JXLReview points={jxlPoints} />
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button onClick={onCancel} style={secondaryBtnStyle}>
                    Cancel
                </button>
                <button
                    onClick={onImport}
                    disabled={importableCount === 0}
                    style={{
                        ...primaryBtnStyle,
                        opacity: importableCount === 0 ? 0.4 : 1,
                        cursor: importableCount === 0 ? 'not-allowed' : 'pointer',
                    }}
                >
                    Import {importableCount} point{importableCount === 1 ? '' : 's'} <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
}

function CSVReview({ csvRows, mapping, setColumnRole, validation }) {
    const previewRows = csvRows.slice(0, 5);
    const columnCount = csvRows[0]?.length || 0;

    return (
        <div>
            {/* Column mapper + preview */}
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${Math.max(columnCount * 140, 600)}px` }}>
                    <thead>
                        <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                            {Array.from({ length: columnCount }).map((_, i) => (
                                <th key={i} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                                    <select
                                        value={mapping[i] || 'ignore'}
                                        onChange={(e) => setColumnRole(i, e.target.value)}
                                        style={selectStyle}
                                    >
                                        {ROLE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: '10px', letterSpacing: '0.5px', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>
                                        col {i + 1}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row, ri) => (
                            <tr key={ri} style={{ borderBottom: ri !== previewRows.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                {Array.from({ length: columnCount }).map((_, ci) => {
                                    const role = mapping[ci];
                                    const isNumeric = role === 'n' || role === 'e' || role === 'z';
                                    return (
                                        <td
                                            key={ci}
                                            className={isNumeric ? 'coordinate-data' : undefined}
                                            style={{
                                                padding: '8px 10px',
                                                fontSize: '13px',
                                                color: role === 'ignore' || !role ? 'var(--text-muted)' : 'var(--text-main)',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {row?.[ci] ?? ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {csvRows.length > 5 && (
                            <tr>
                                <td colSpan={columnCount} style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    …{csvRows.length - 5} more rows
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Summary */}
            {validation && (
                <div
                    style={{
                        marginTop: '14px',
                        padding: '12px 14px',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        lineHeight: 1.6,
                    }}
                >
                    {!validation.ok ? (
                        <span style={{ color: 'var(--error)' }}>
                            <AlertCircle size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                            Missing required columns: {validation.missing.join(', ')}. Assign them using the dropdowns above.
                        </span>
                    ) : (
                        <>
                            <strong className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                                {validation.total}
                            </strong>{' '}
                            rows detected ·{' '}
                            <strong className="coordinate-data" style={{ color: 'var(--success)' }}>
                                {validation.parseable}
                            </strong>{' '}
                            parseable ·{' '}
                            <strong className="coordinate-data" style={{ color: validation.duplicates > 0 ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                                {validation.duplicates}
                            </strong>{' '}
                            duplicate IDs ·{' '}
                            <strong className="coordinate-data" style={{ color: validation.missingCoords > 0 ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                                {validation.missingCoords}
                            </strong>{' '}
                            missing coordinates
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function JXLReview({ points }) {
    const duplicates = (() => {
        const seen = new Map();
        let dupes = 0;
        for (const p of points) {
            if (seen.has(p.point_id)) dupes++;
            else seen.set(p.point_id, true);
        }
        return dupes;
    })();

    return (
        <div
            style={{
                padding: '18px 16px',
                backgroundColor: 'var(--bg-dark)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                fontSize: '14px',
            }}
        >
            {points.length === 0 ? (
                <span style={{ color: 'var(--error)' }}>
                    <AlertCircle size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                    No point records found in this JXL file.
                </span>
            ) : (
                <span>
                    <CheckCircle2 size={14} color="var(--success)" style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
                    <strong className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                        {points.length}
                    </strong>{' '}
                    point records extracted ·{' '}
                    <strong className="coordinate-data" style={{ color: duplicates > 0 ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                        {duplicates}
                    </strong>{' '}
                    duplicate IDs
                </span>
            )}
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const cardStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '20px 22px',
};

const primaryBtnStyle = {
    backgroundColor: 'var(--brand-teal)',
    color: '#fff',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
};

const secondaryBtnStyle = {
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    padding: '10px 18px',
    borderRadius: '8px',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '14px',
};

const cancelBtnStyle = {
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-subtle)',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
};

const selectStyle = {
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    padding: '5px 8px',
    fontSize: '12px',
    fontFamily: 'inherit',
    width: '100%',
};
