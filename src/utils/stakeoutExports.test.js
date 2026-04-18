import { describe, it, expect } from 'vitest';
import {
    exportAsCSV,
    exportAsXLSX,
    sanitizeTitleForFilename,
} from './stakeoutExports.js';

// ─── sample datasets ────────────────────────────────────────────────────────

const metadata = {
    project_name: 'QuikTrip #1247',
    assignment_title: 'QT #1247 — Top Back of Curb',
    assignment_date: '2026-04-17',
    party_chief_name: 'Theo Bower',
    instrument: 'Trimble S7 + SX12',
    tolerance_h: 0.02,
};

function baseRow(overrides = {}) {
    return {
        point_id: 'P001',
        design_feature_code: 'TBC',
        feature_description: 'Top back of curb',
        raw_code: 'TBC-2N-H',
        design_n: 10000.123,
        design_e: 5000.456,
        design_z: 100.5,
        staked_n: 10000.125,
        staked_e: 5000.458,
        staked_z: 100.502,
        declared_offset_distance: 2.0,
        declared_offset_direction: 'N',
        actual_offset_distance: 2.001,
        actual_offset_direction: 'N',
        offset_variance: 0.001,
        delta_n: 0.002,
        delta_e: 0.002,
        delta_z: 0.002,
        delta_h: 0.003,
        effective_tolerance_h: 0.02,
        h_status: 'in_tol',
        field_fit_reason: null,
        field_fit_note: null,
        built_on_status: null,
        ...overrides,
    };
}

function mixedStatusRows() {
    return [
        baseRow({ point_id: 'P001', h_status: 'in_tol' }),
        baseRow({ point_id: 'P002', h_status: 'out_of_tol', delta_h: 0.18, offset_variance: 0.16 }),
        baseRow({
            point_id: 'P003',
            h_status: 'field_fit',
            field_fit_reason: 'utility_conflict',
            field_fit_note: 'Stake hit live water line; shifted 0.8\' W',
        }),
        baseRow({ point_id: 'P004', h_status: 'built_on', built_on_status: 'poured' }),
        baseRow({ point_id: 'P005', h_status: 'pending' }),
    ];
}

// ─── sanitizeTitleForFilename ───────────────────────────────────────────────

describe('sanitizeTitleForFilename', () => {
    it('converts the spec example to the expected slug', () => {
        expect(sanitizeTitleForFilename('QT #1247 — Top Back of Curb'))
            .toBe('qt_1247_top_back_of_curb');
    });

    it('collapses runs of punctuation to a single underscore', () => {
        expect(sanitizeTitleForFilename('Hello---world!!!'))
            .toBe('hello_world');
    });

    it('trims leading and trailing non-alphanumerics', () => {
        expect(sanitizeTitleForFilename('   ---QC---   '))
            .toBe('qc');
    });

    it('caps at 40 characters', () => {
        const long = 'a'.repeat(60);
        const out = sanitizeTitleForFilename(long);
        expect(out.length).toBeLessThanOrEqual(40);
    });

    it('falls back to "untitled" on null or empty', () => {
        expect(sanitizeTitleForFilename(null)).toBe('untitled');
        expect(sanitizeTitleForFilename('')).toBe('untitled');
        expect(sanitizeTitleForFilename('!!!')).toBe('untitled');
    });
});

// ─── exportAsCSV ────────────────────────────────────────────────────────────

describe('exportAsCSV', () => {
    it('produces the expected shape and filename for a mixed-status dataset', () => {
        const rows = mixedStatusRows();
        const result = exportAsCSV({ rows, metadata });
        expect(result.row_count).toBe(5);
        expect(result.byte_size).toBeGreaterThan(0);
        expect(result.filename).toBe('surveyos_qc_2026-04-17_qt_1247_top_back_of_curb.csv');
        expect(result.blob.type).toBe('text/csv;charset=utf-8');
    });

    it('starts with the UTF-8 BOM and uses \\r\\n line endings', async () => {
        const result = exportAsCSV({ rows: mixedStatusRows(), metadata });
        // BOM has to be verified byte-level — Blob#text() in Node/undici
        // strips it during decoding, though Excel still receives it on disk.
        const buffer = await result.blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        expect(bytes[0]).toBe(0xEF);
        expect(bytes[1]).toBe(0xBB);
        expect(bytes[2]).toBe(0xBF);
        const text = await result.blob.text();
        expect(text).toContain('\r\n');
        expect(text).not.toMatch(/[^\r]\n/); // no bare LFs
    });

    it('emits comment rows prefixed with # before the header row', async () => {
        const result = exportAsCSV({ rows: mixedStatusRows(), metadata });
        const text = await result.blob.text();
        const lines = text.replace(/^\uFEFF/, '').split('\r\n');
        expect(lines[0]).toBe('# SurveyOS Stakeout QC Report');
        expect(lines[1]).toBe('# Project: QuikTrip #1247');
        expect(lines[2]).toContain('# Assignment: QT #1247 — Top Back of Curb (2026-04-17)');
        expect(lines[3]).toBe('# Party chief: Theo Bower');
        expect(lines[4]).toBe('# Instrument: Trimble S7 + SX12');
        expect(lines[5]).toBe('# Horizontal tolerance: 0.02');
        // Row 6 is Generated: <ISO timestamp>, row 7 is "#", row 8 is blank,
        // row 9 must be the 23-column header.
        expect(lines[6]).toMatch(/^# Generated: \d{4}-\d{2}-\d{2}T/);
        expect(lines[7]).toBe('#');
        expect(lines[8]).toBe('');
        const header = lines[9];
        const headerCols = header.split(',');
        expect(headerCols).toHaveLength(23);
        expect(headerCols[0]).toBe('Point_ID');
        expect(headerCols[headerCols.length - 1]).toBe('Field_Fit_Note');
    });

    it('RFC 4180-quotes fields that contain commas, quotes, or newlines', async () => {
        const tricky = baseRow({
            point_id: 'P100',
            feature_description: 'Hello, world',
            field_fit_reason: 'other',
            field_fit_note: 'Broken 1" pipe; contains "quoted" text',
        });
        const result = exportAsCSV({ rows: [tricky], metadata });
        const text = await result.blob.text();
        expect(text).toContain('"Hello, world"');
        expect(text).toContain('"Broken 1"" pipe; contains ""quoted"" text"');
    });

    it('produces a valid file with only headers and comments when rows is empty', async () => {
        const result = exportAsCSV({ rows: [], metadata });
        expect(result.row_count).toBe(0);
        expect(result.byte_size).toBeGreaterThan(0);
        const text = await result.blob.text();
        expect(text).toContain('Point_ID,Feature,Feature_Description');
    });

    it('renders nulls as empty cells, not literal "null"', async () => {
        const partial = baseRow({
            point_id: 'P999',
            staked_n: null,
            staked_e: null,
            staked_z: null,
            delta_n: null,
            delta_e: null,
            delta_z: null,
            delta_h: null,
            actual_offset_distance: null,
            actual_offset_direction: null,
            offset_variance: null,
            effective_tolerance_h: null,
            h_status: 'pending',
        });
        const result = exportAsCSV({ rows: [partial], metadata });
        const text = await result.blob.text();
        expect(text).not.toContain('null');
        expect(text).not.toContain('undefined');
    });

    it('uses "varies by point" when tolerance_h is not provided', async () => {
        const meta2 = { ...metadata };
        delete meta2.tolerance_h;
        const result = exportAsCSV({ rows: [], metadata: meta2 });
        const text = await result.blob.text();
        expect(text).toContain('# Horizontal tolerance: varies by point');
    });
});

// ─── exportAsXLSX ───────────────────────────────────────────────────────────

describe('exportAsXLSX', () => {
    it('returns a non-empty XLSX Blob with the expected filename and row_count', async () => {
        const rows = mixedStatusRows();
        const result = await exportAsXLSX({ rows, metadata });
        expect(result.row_count).toBe(5);
        expect(result.byte_size).toBeGreaterThan(0);
        expect(result.filename).toBe('surveyos_qc_2026-04-17_qt_1247_top_back_of_curb.xlsx');
        expect(result.blob.size).toBe(result.byte_size);
        expect(result.blob.type).toBe(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
    });

    it('produces a valid workbook even with zero data rows', async () => {
        const result = await exportAsXLSX({ rows: [], metadata });
        expect(result.row_count).toBe(0);
        expect(result.byte_size).toBeGreaterThan(0);
        expect(result.blob).toBeInstanceOf(Blob);
    });

    it('handles rows with nulls throughout without throwing', async () => {
        const nullRow = {
            point_id: 'P777',
            design_feature_code: null,
            feature_description: null,
            raw_code: null,
            design_n: null, design_e: null, design_z: null,
            staked_n: null, staked_e: null, staked_z: null,
            declared_offset_distance: null,
            declared_offset_direction: null,
            actual_offset_distance: null,
            actual_offset_direction: null,
            offset_variance: null,
            delta_n: null, delta_e: null, delta_z: null, delta_h: null,
            effective_tolerance_h: null,
            h_status: 'pending',
            field_fit_reason: null,
            field_fit_note: null,
        };
        const result = await exportAsXLSX({ rows: [nullRow], metadata });
        expect(result.row_count).toBe(1);
        expect(result.byte_size).toBeGreaterThan(0);
    });

    it('handles special characters (commas, quotes, newlines) in string fields', async () => {
        const tricky = baseRow({
            feature_description: 'Hello, world',
            field_fit_note: 'Broken 1" pipe\ncontains newline',
        });
        const result = await exportAsXLSX({ rows: [tricky], metadata });
        expect(result.byte_size).toBeGreaterThan(0);
        expect(result.blob).toBeInstanceOf(Blob);
    });

    it('uses a sanitized filename even when the title is messy', async () => {
        const meta2 = { ...metadata, assignment_title: '!! QA / QC - day 1 !!' };
        const result = await exportAsXLSX({ rows: [], metadata: meta2 });
        expect(result.filename).toMatch(/^surveyos_qc_2026-04-17_[a-z0-9_]+\.xlsx$/);
        expect(result.filename).not.toContain(' ');
        expect(result.filename).not.toContain('!');
    });

    it('row_count reflects the input length', async () => {
        const rows = Array.from({ length: 12 }, (_, i) => baseRow({ point_id: `P${i + 1}` }));
        const result = await exportAsXLSX({ rows, metadata });
        expect(result.row_count).toBe(12);
    });
});
