// ============================================================================
// src/utils/stakeoutExports.js
// Build downloadable Stakeout QC reports in CSV or styled XLSX. Pure
// data-in / Blob-out; no DOM, no Supabase, no side effects on import.
// xlsx-js-style is lazy-loaded inside exportAsXLSX to keep the JS bundle
// lean for users who never trigger an XLSX export.
// ============================================================================

const COLUMNS = [
    'Point_ID',
    'Feature',
    'Feature_Description',
    'Raw_Code',
    'Design_N',
    'Design_E',
    'Design_Z',
    'Staked_N',
    'Staked_E',
    'Staked_Z',
    'Declared_Offset',
    'Declared_Direction',
    'Actual_Offset',
    'Actual_Direction',
    'Offset_Variance',
    'Delta_N',
    'Delta_E',
    'Delta_Z',
    'Delta_H',
    'Tolerance',
    'Status',
    'Field_Fit_Reason',
    'Field_Fit_Note',
];

// Brand palette (must match CLAUDE.md)
const COLOR_BRAND_TEAL    = '0F6E56';
const COLOR_LIGHTER_TEAL  = '5DCAA5';
const COLOR_DARK_CANVAS   = '0A1A16';
const COLOR_OUT_OF_TOL_BG = 'FEE2E2';
const COLOR_OUT_OF_TOL_FG = '991B1B';
const COLOR_FIELD_FIT_BG  = 'FEF3C7';
const COLOR_FIELD_FIT_FG  = '92400E';
const COLOR_BUILT_ON_BG   = 'FCE7F3';
const COLOR_BUILT_ON_FG   = '9D174D';
const COLOR_DEFAULT_TEXT  = '1F2937';

// Column widths tuned for readable default display in Excel / Numbers.
const COLUMN_WIDTHS = [
    10, // Point_ID
    8,  // Feature
    28, // Feature_Description
    14, // Raw_Code
    14, 14, 14, // Design N/E/Z
    14, 14, 14, // Staked N/E/Z
    14, 14,     // Declared offset/dir
    14, 14,     // Actual offset/dir
    14,         // Offset_Variance
    12, 12, 12, 12, // Delta N/E/Z/H
    12, 13,     // Tolerance, Status
    18, 30,     // Field_Fit_Reason, Field_Fit_Note
];

/**
 * Sanitize a free-form title into a filename-safe slug. Lowercased,
 * non-alphanumerics collapsed to a single underscore, trimmed of leading
 * and trailing underscores, capped at 40 chars.
 *
 * @param {string} title
 * @returns {string}
 */
export function sanitizeTitleForFilename(title) {
    if (title == null) return 'untitled';
    const s = String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40)
        .replace(/^_+|_+$/g, '');
    return s || 'untitled';
}

function buildFilename(assignmentDate, assignmentTitle, extension) {
    const slug = sanitizeTitleForFilename(assignmentTitle);
    const date = assignmentDate || 'undated';
    return `surveyos_qc_${date}_${slug}.${extension}`;
}

function fmtNum(value, decimals) {
    if (value == null) return '';
    const n = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(n)) return '';
    return n.toFixed(decimals);
}

function csvEscape(value) {
    if (value == null) return '';
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function rowToCSVCells(row) {
    return [
        row.point_id ?? '',
        row.design_feature_code ?? '',
        row.feature_description ?? '',
        row.raw_code ?? '',
        fmtNum(row.design_n, 3),
        fmtNum(row.design_e, 3),
        fmtNum(row.design_z, 3),
        fmtNum(row.staked_n, 3),
        fmtNum(row.staked_e, 3),
        fmtNum(row.staked_z, 3),
        fmtNum(row.declared_offset_distance, 2),
        row.declared_offset_direction ?? '',
        fmtNum(row.actual_offset_distance, 2),
        row.actual_offset_direction ?? '',
        fmtNum(row.offset_variance, 3),
        fmtNum(row.delta_n, 3),
        fmtNum(row.delta_e, 3),
        fmtNum(row.delta_z, 3),
        fmtNum(row.delta_h, 3),
        fmtNum(row.effective_tolerance_h, 3),
        row.h_status ?? '',
        row.field_fit_reason ?? '',
        row.field_fit_note ?? '',
    ];
}

/**
 * Build a CSV Blob of a Stakeout QC dataset with a comment preamble.
 * Comment lines start with '#' (most CSV importers skip these or surface
 * them as text). Line terminator is \r\n; file is prefixed with a UTF-8
 * BOM so Excel opens it with the correct encoding.
 *
 * @param {{
 *   rows: Array<object>,
 *   metadata: {
 *     project_name: string,
 *     assignment_title: string,
 *     assignment_date: string,
 *     party_chief_name?: string,
 *     instrument?: string,
 *     tolerance_h?: number
 *   }
 * }} params
 * @returns {{ blob: Blob, filename: string, row_count: number, byte_size: number }}
 */
export function exportAsCSV(params) {
    const rows = Array.isArray(params?.rows) ? params.rows : [];
    const metadata = params?.metadata || {};

    const toleranceText = metadata.tolerance_h != null
        ? String(metadata.tolerance_h)
        : 'varies by point';

    const comments = [
        '# SurveyOS Stakeout QC Report',
        `# Project: ${metadata.project_name ?? ''}`,
        `# Assignment: ${metadata.assignment_title ?? ''} (${metadata.assignment_date ?? ''})`,
        `# Party chief: ${metadata.party_chief_name || 'unassigned'}`,
        `# Instrument: ${metadata.instrument || 'not recorded'}`,
        `# Horizontal tolerance: ${toleranceText}`,
        `# Generated: ${new Date().toISOString()}`,
        '#',
        '',
    ];

    const headerLine = COLUMNS.join(',');
    const dataLines = rows.map((r) => rowToCSVCells(r).map(csvEscape).join(','));

    const body = [...comments, headerLine, ...dataLines].join('\r\n') + '\r\n';
    const csv = '\uFEFF' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

    return {
        blob,
        filename: buildFilename(metadata.assignment_date, metadata.assignment_title, 'csv'),
        row_count: rows.length,
        byte_size: blob.size,
    };
}

function rowToXLSXCells(row) {
    // Numbers stay as numbers so Excel sums/filters work; text fields are
    // trimmed to empty strings (not null) so cell refs exist for styling.
    const numOrBlank = (v) => {
        if (v == null) return '';
        const n = typeof v === 'number' ? v : Number.parseFloat(v);
        return Number.isFinite(n) ? n : '';
    };
    return [
        row.point_id ?? '',
        row.design_feature_code ?? '',
        row.feature_description ?? '',
        row.raw_code ?? '',
        numOrBlank(row.design_n),
        numOrBlank(row.design_e),
        numOrBlank(row.design_z),
        numOrBlank(row.staked_n),
        numOrBlank(row.staked_e),
        numOrBlank(row.staked_z),
        numOrBlank(row.declared_offset_distance),
        row.declared_offset_direction ?? '',
        numOrBlank(row.actual_offset_distance),
        row.actual_offset_direction ?? '',
        numOrBlank(row.offset_variance),
        numOrBlank(row.delta_n),
        numOrBlank(row.delta_e),
        numOrBlank(row.delta_z),
        numOrBlank(row.delta_h),
        numOrBlank(row.effective_tolerance_h),
        row.h_status ?? '',
        row.field_fit_reason ?? '',
        row.field_fit_note ?? '',
    ];
}

// Column-index groupings for numeric cell format codes.
const COL_IDX = {
    decimals3: [4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19], // coords / deltas / variance / tolerance
    decimals2: [10, 12], // declared + actual offset distance
};

/**
 * Build a styled XLSX Blob of a Stakeout QC dataset. Lazy-loads
 * xlsx-js-style to keep the initial bundle small.
 *
 * @param {{
 *   rows: Array<object>,
 *   metadata: {
 *     project_name: string,
 *     assignment_title: string,
 *     assignment_date: string,
 *     party_chief_name?: string,
 *     instrument?: string,
 *     tolerance_h?: number
 *   }
 * }} params
 * @returns {Promise<{ blob: Blob, filename: string, row_count: number, byte_size: number }>}
 */
export async function exportAsXLSX(params) {
    const XLSX = (await import('xlsx-js-style')).default;

    const rows = Array.isArray(params?.rows) ? params.rows : [];
    const metadata = params?.metadata || {};

    const toleranceText = metadata.tolerance_h != null
        ? String(metadata.tolerance_h)
        : 'varies';

    // Row 1 (idx 0): title — merged across A:E.
    // Rows 2-6 (idx 1-5): metadata lines in column A.
    // Row 7 (idx 6): blank.
    // Row 8 (idx 7): column headers.
    // Row 9+ (idx 8+): data.
    const aoa = [
        ['SurveyOS Stakeout QC Report'],
        [`Project: ${metadata.project_name ?? ''}`],
        [`Assignment: ${metadata.assignment_title ?? ''} (${metadata.assignment_date ?? ''})`],
        [`Party chief: ${metadata.party_chief_name || 'unassigned'}`],
        [`Instrument: ${metadata.instrument || 'not recorded'}`],
        [`Tolerance: ${toleranceText}`],
        [],
        COLUMNS,
        ...rows.map(rowToXLSXCells),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!cols'] = COLUMN_WIDTHS.map((w) => ({ wch: w }));

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    ];

    // Freeze the header row so data scrolls under it. xlsx-js-style honors
    // the SheetJS !freeze shorthand; ySplit is 1-indexed at the number of
    // rows to freeze from the top.
    ws['!freeze'] = { xSplit: 0, ySplit: 8 };
    ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 8, topLeftCell: 'A9' }];

    // ── Title row style (A1)
    const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleRef]) {
        ws[titleRef].s = {
            font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: COLOR_BRAND_TEAL } },
            alignment: { horizontal: 'left', vertical: 'center' },
        };
    }

    // ── Metadata rows (A2-A6)
    for (let r = 1; r <= 5; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: 0 });
        if (ws[ref]) {
            ws[ref].s = {
                font: { sz: 10, color: { rgb: COLOR_DEFAULT_TEXT } },
                alignment: { horizontal: 'left' },
            };
        }
    }

    // ── Header row (row index 7 = row 8 visible)
    const headerRow = 7;
    for (let c = 0; c < COLUMNS.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: headerRow, c });
        if (!ws[ref]) continue;
        ws[ref].s = {
            fill: { fgColor: { rgb: COLOR_DARK_CANVAS } },
            font: { bold: true, color: { rgb: COLOR_LIGHTER_TEAL } },
            border: {
                bottom: { style: 'thin', color: { rgb: COLOR_LIGHTER_TEAL } },
            },
            alignment: { horizontal: 'left' },
        };
    }

    // ── Data row styles (rows 8+) — fill + font keyed on h_status,
    //    numeric format codes keyed on column index.
    for (let i = 0; i < rows.length; i++) {
        const r = headerRow + 1 + i;
        const row = rows[i] || {};
        const status = row.h_status;

        let rowStyle = null;
        if (status === 'out_of_tol') {
            rowStyle = {
                fill: { fgColor: { rgb: COLOR_OUT_OF_TOL_BG } },
                font: { color: { rgb: COLOR_OUT_OF_TOL_FG }, bold: true },
            };
        } else if (status === 'field_fit') {
            rowStyle = {
                fill: { fgColor: { rgb: COLOR_FIELD_FIT_BG } },
                font: { color: { rgb: COLOR_FIELD_FIT_FG } },
            };
        } else if (status === 'built_on') {
            rowStyle = {
                fill: { fgColor: { rgb: COLOR_BUILT_ON_BG } },
                font: { color: { rgb: COLOR_BUILT_ON_FG } },
            };
        } else {
            rowStyle = {
                font: { color: { rgb: COLOR_DEFAULT_TEXT } },
            };
        }

        for (let c = 0; c < COLUMNS.length; c++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (!ws[ref]) continue;

            const style = { ...rowStyle };
            if (COL_IDX.decimals3.includes(c)) {
                style.numFmt = '0.000';
            } else if (COL_IDX.decimals2.includes(c)) {
                style.numFmt = '0.00';
            }
            ws[ref].s = style;
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stakeout QC');

    wb.Props = {
        Title: 'SurveyOS Stakeout QC Report',
        Subject: `${metadata.project_name ?? ''} — ${metadata.assignment_title ?? ''}`,
        Author: 'SurveyOS',
        CreatedDate: new Date(),
    };

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return {
        blob,
        filename: buildFilename(metadata.assignment_date, metadata.assignment_title, 'xlsx'),
        row_count: rows.length,
        byte_size: blob.size,
    };
}
