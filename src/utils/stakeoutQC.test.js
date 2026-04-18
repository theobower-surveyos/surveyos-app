import { describe, it, expect } from 'vitest';
import {
    parseStakeCode,
    detectCSVColumns,
    parseAsStakedCSV,
    parseJXLPoints,
    computeQC,
    matchObservationsToDesign,
} from './stakeoutQC.js';

// ─── parseStakeCode ──────────────────────────────────────────────────────────

describe('parseStakeCode', () => {
    it('parses a fully-specified code', () => {
        expect(parseStakeCode('TBC-2N-H')).toEqual({
            feature: 'TBC',
            offset_distance: 2,
            offset_direction: 'N',
            stake_type: 'H',
            raw: 'TBC-2N-H',
            parse_error: null,
        });
    });

    it('parses a bare feature code with nulls elsewhere', () => {
        expect(parseStakeCode('SSMH')).toEqual({
            feature: 'SSMH',
            offset_distance: 0 * 0 === 0 ? null : null,
            offset_direction: null,
            stake_type: null,
            raw: 'SSMH',
            parse_error: null,
        });
    });

    it('parses a feature with offset but no stake type', () => {
        const r = parseStakeCode('EP-5E');
        expect(r.feature).toBe('EP');
        expect(r.offset_distance).toBe(5);
        expect(r.offset_direction).toBe('E');
        expect(r.stake_type).toBeNull();
        expect(r.parse_error).toBeNull();
    });

    it('accepts a bare numeric offset with no direction', () => {
        const r = parseStakeCode('EW-2');
        expect(r.feature).toBe('EW');
        expect(r.offset_distance).toBe(2);
        expect(r.offset_direction).toBeNull();
        expect(r.parse_error).toBeNull();
    });

    it('accepts a decimal offset distance', () => {
        const r = parseStakeCode('TBC-2.5W-H');
        expect(r.offset_distance).toBe(2.5);
        expect(r.offset_direction).toBe('W');
        expect(r.stake_type).toBe('H');
        expect(r.parse_error).toBeNull();
    });

    it('uppercases and trims whitespace', () => {
        const r = parseStakeCode('  tbc-2n-h  ');
        expect(r.feature).toBe('TBC');
        expect(r.offset_direction).toBe('N');
        expect(r.stake_type).toBe('H');
        expect(r.parse_error).toBeNull();
    });

    it('returns bad_offset when the offset segment is not numeric', () => {
        const r = parseStakeCode('TBC-BANANA');
        expect(r.parse_error).toBe('bad_offset');
        expect(r.feature).toBe('TBC');
        expect(r.offset_distance).toBeNull();
        expect(r.offset_direction).toBeNull();
    });

    it('returns bad_staketype when the stake letter is unknown', () => {
        const r = parseStakeCode('TBC-2N-Z');
        expect(r.parse_error).toBe('bad_staketype');
        expect(r.feature).toBe('TBC');
        expect(r.offset_distance).toBe(2);
        expect(r.offset_direction).toBe('N');
        expect(r.stake_type).toBeNull();
    });

    it('returns parse_error empty on empty string', () => {
        expect(parseStakeCode('').parse_error).toBe('empty');
    });

    it('returns parse_error empty on null / non-string input', () => {
        expect(parseStakeCode(null).parse_error).toBe('empty');
        expect(parseStakeCode(undefined).parse_error).toBe('empty');
        expect(parseStakeCode(123).parse_error).toBe('empty');
    });
});

// ─── detectCSVColumns ────────────────────────────────────────────────────────

describe('detectCSVColumns', () => {
    it('maps point_id / n / e / z / code on a canonical Trimble-style row', () => {
        // Point=P001, Northing=10000.00, Easting=5000.00, Elevation=100.50, Code=TBC
        const row = ['P001', '10000.00', '5000.00', '100.50', 'TBC'];
        expect(detectCSVColumns(row)).toEqual({
            point_id: 0,
            n: 1,
            e: 2,
            z: 3,
            code: 4,
        });
    });

    it('returns z: null when only N and E are present', () => {
        const row = ['P001', '10000.00', '5000.00'];
        expect(detectCSVColumns(row)).toEqual({
            point_id: 0,
            n: 1,
            e: 2,
            z: null,
            code: null,
        });
    });

    it('returns null when the row has fewer than 3 cells', () => {
        expect(detectCSVColumns(['P001', '10000.00'])).toBeNull();
        expect(detectCSVColumns([])).toBeNull();
    });

    it('returns null when fewer than 2 numeric columns are present', () => {
        expect(detectCSVColumns(['P001', 'TBC', 'something'])).toBeNull();
    });

    it('returns null on non-array input', () => {
        expect(detectCSVColumns(null)).toBeNull();
        expect(detectCSVColumns('not-an-array')).toBeNull();
    });
});

// ─── parseAsStakedCSV ────────────────────────────────────────────────────────

describe('parseAsStakedCSV', () => {
    const mapping = { point_id: 0, n: 1, e: 2, z: 3, code: 4 };

    it('parses a well-formed CSV string', async () => {
        const csv = 'P001,10000.123,5000.456,100.5,TBC\nP002,10001.000,5001.000,100.6,EP';
        const rows = await parseAsStakedCSV(csv, mapping);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({
            point_id: 'P001',
            n: 10000.123,
            e: 5000.456,
            z: 100.5,
            code: 'TBC',
            raw_row: 0,
        });
        expect(rows[1].point_id).toBe('P002');
        expect(rows[1].raw_row).toBe(1);
    });

    it('filters rows with NaN northing or easting', async () => {
        const csv = 'P001,10000,5000,100,TBC\nBAD,not-a-number,5000,100,EP\nP003,10002,5002,100,EW';
        const rows = await parseAsStakedCSV(csv, mapping);
        expect(rows.map((r) => r.point_id)).toEqual(['P001', 'P003']);
    });

    it('filters rows with empty point_id', async () => {
        const csv = 'P001,10000,5000,100,TBC\n,10001,5001,100,EP';
        const rows = await parseAsStakedCSV(csv, mapping);
        expect(rows).toHaveLength(1);
        expect(rows[0].point_id).toBe('P001');
    });

    it('omits z and code when mapping indices are not provided', async () => {
        const csv = 'P001,10000,5000\nP002,10001,5001';
        const rows = await parseAsStakedCSV(csv, { point_id: 0, n: 1, e: 2 });
        expect(rows[0].z).toBeNull();
        expect(rows[0].code).toBeNull();
    });

    it('returns an empty array on empty input', async () => {
        const rows = await parseAsStakedCSV('', mapping);
        expect(rows).toEqual([]);
    });
});

// ─── parseJXLPoints ──────────────────────────────────────────────────────────

describe('parseJXLPoints', () => {
    const sampleJXL = `<?xml version="1.0"?>
<JOBFile>
  <FieldBook>
    <PointRecord ID="1" Name="P001">
      <Grid>
        <North>10000.123</North>
        <East>5000.456</East>
        <Elevation>100.50</Elevation>
      </Grid>
      <Code>TBC</Code>
    </PointRecord>
    <PointRecord ID="2" Name="P002">
      <Grid>
        <North>10001.000</North>
        <East>5001.000</East>
        <Elevation>100.60</Elevation>
      </Grid>
      <Code>EP</Code>
    </PointRecord>
  </FieldBook>
</JOBFile>`;

    it('extracts point records with grid coordinates and code', async () => {
        const pts = await parseJXLPoints(sampleJXL);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toEqual({
            point_id: 'P001',
            n: 10000.123,
            e: 5000.456,
            z: 100.5,
            code: 'TBC',
            raw_row: null,
        });
        expect(pts[1].point_id).toBe('P002');
        expect(pts[1].code).toBe('EP');
    });

    it('skips records without a Grid element', async () => {
        const jxl = `<?xml version="1.0"?>
<JOBFile>
  <FieldBook>
    <PointRecord Name="NOGRID"><Code>X</Code></PointRecord>
    <PointRecord Name="OK"><Grid><North>1</North><East>2</East></Grid></PointRecord>
  </FieldBook>
</JOBFile>`;
        const pts = await parseJXLPoints(jxl);
        expect(pts).toHaveLength(1);
        expect(pts[0].point_id).toBe('OK');
    });

    it('returns [] when the structure does not match', async () => {
        const pts = await parseJXLPoints('<?xml version="1.0"?><Nope/>');
        expect(pts).toEqual([]);
    });

    it('returns [] on an empty / invalid input', async () => {
        expect(await parseJXLPoints('')).toEqual([]);
        expect(await parseJXLPoints(null)).toEqual([]);
    });

    it('sets z: null when Elevation is missing', async () => {
        const jxl = `<?xml version="1.0"?>
<JOBFile><FieldBook>
<PointRecord Name="P1"><Grid><North>10</North><East>20</East></Grid></PointRecord>
</FieldBook></JOBFile>`;
        const pts = await parseJXLPoints(jxl);
        expect(pts).toHaveLength(1);
        expect(pts[0].z).toBeNull();
    });
});

// ─── computeQC ───────────────────────────────────────────────────────────────

describe('computeQC', () => {
    it('returns in_tol when delta_h=0.015 within 0.020 and no declared offset', () => {
        // delta_n=0.010, delta_e=0.011, sqrt ~= 0.01487 ≤ 0.020
        const r = computeQC({
            design: { n: 10000.000, e: 5000.000, z: 100 },
            observed: { n: 10000.010, e: 5000.011, z: 100 },
            declared_offset_distance: null,
            declared_offset_direction: null,
            tolerance_h: 0.02,
        });
        expect(r.h_status).toBe('in_tol');
        expect(r.offset_variance).toBeNull();
        expect(r.delta_z).toBe(0);
    });

    it('returns out_of_tol when delta_h=0.150 exceeds 0.020 and no declared offset', () => {
        const r = computeQC({
            design: { n: 10000.000, e: 5000.000, z: null },
            observed: { n: 10000.100, e: 5000.112, z: null },
            declared_offset_distance: null,
            declared_offset_direction: null,
            tolerance_h: 0.02,
        });
        expect(r.h_status).toBe('out_of_tol');
        expect(r.delta_z).toBeNull();
        expect(r.delta_h).toBeCloseTo(0.150, 3);
    });

    it('returns in_tol with small offset_variance when staked ~2ft from design matching a declared 2ft offset', () => {
        // Observed is 2.005' north of design, declared offset is 2'. Variance = 0.005.
        const r = computeQC({
            design: { n: 10000.000, e: 5000.000, z: 100 },
            observed: { n: 10002.005, e: 5000.000, z: 100 },
            declared_offset_distance: 2,
            declared_offset_direction: 'N',
            tolerance_h: 0.02,
        });
        expect(r.h_status).toBe('in_tol');
        expect(r.offset_variance).toBeCloseTo(0.005, 3);
        expect(r.actual_offset_direction).toBe('N');
        expect(r.actual_offset_distance).toBeCloseTo(2.005, 3);
    });

    it('returns out_of_tol when variance exceeds tolerance against declared offset', () => {
        const r = computeQC({
            design: { n: 10000.000, e: 5000.000, z: null },
            observed: { n: 10002.500, e: 5000.000, z: null },
            declared_offset_distance: 2,
            declared_offset_direction: 'N',
            tolerance_h: 0.02,
        });
        expect(r.h_status).toBe('out_of_tol');
        expect(r.offset_variance).toBeCloseTo(0.5, 3);
    });

    it('returns actual_offset_direction null when delta_h is under 0.01', () => {
        const r = computeQC({
            design: { n: 10000.000, e: 5000.000, z: 100 },
            observed: { n: 10000.002, e: 5000.003, z: 100 },
            declared_offset_distance: null,
            declared_offset_direction: null,
            tolerance_h: 0.02,
        });
        expect(r.actual_offset_direction).toBeNull();
        expect(r.h_status).toBe('in_tol');
    });

    it('reports actual_offset_direction W when the largest component is negative east', () => {
        const r = computeQC({
            design: { n: 10000, e: 5000, z: null },
            observed: { n: 10000, e: 4998, z: null },
            declared_offset_distance: 2,
            declared_offset_direction: 'W',
            tolerance_h: 0.02,
        });
        expect(r.actual_offset_direction).toBe('W');
        expect(r.h_status).toBe('in_tol');
    });

    it('rounds all numeric outputs to 3 decimals', () => {
        const r = computeQC({
            design: { n: 0, e: 0, z: 0 },
            observed: { n: 0.123456789, e: 0.987654321, z: 0.555555 },
            declared_offset_distance: null,
            declared_offset_direction: null,
            tolerance_h: 5,
        });
        expect(r.delta_n).toBe(0.123);
        expect(r.delta_e).toBe(0.988);
        expect(r.delta_z).toBe(0.556);
    });
});

// ─── matchObservationsToDesign ───────────────────────────────────────────────

describe('matchObservationsToDesign', () => {
    const designs = [
        { id: 'd1', point_id: 'P001', northing: 10000, easting: 5000 },
        { id: 'd2', point_id: 'P002', northing: 10010, easting: 5010 },
        { id: 'd3', point_id: 'P003', northing: 10500, easting: 5500 },
    ];

    it('matches by exact point_id', () => {
        const out = matchObservationsToDesign(
            [{ point_id: 'P002', n: 10010.5, e: 5010.5 }],
            designs,
        );
        expect(out[0].match_type).toBe('exact');
        expect(out[0].design_point_id).toBe('d2');
        expect(out[0].match_distance).toBeNull();
    });

    it('falls back to nearest-neighbor when point_id does not match', () => {
        const out = matchObservationsToDesign(
            [{ point_id: 'X99', n: 10000.3, e: 5000.4 }],
            designs,
            { maxDistance: 50 },
        );
        expect(out[0].match_type).toBe('nearest');
        expect(out[0].design_point_id).toBe('d1');
        expect(out[0].match_distance).toBeCloseTo(0.5, 3);
    });

    it('returns match_type: none when nothing is within maxDistance', () => {
        const out = matchObservationsToDesign(
            [{ point_id: 'X99', n: 20000, e: 20000 }],
            designs,
            { maxDistance: 50 },
        );
        expect(out[0].match_type).toBe('none');
        expect(out[0].design_point_id).toBeNull();
        expect(out[0].match_distance).toBeNull();
    });

    it('preserves input order and does not mutate input arrays', () => {
        const obs = [
            { point_id: 'P002', n: 10010, e: 5010 },
            { point_id: 'P001', n: 10000, e: 5000 },
        ];
        const obsSnapshot = JSON.parse(JSON.stringify(obs));
        const designsSnapshot = JSON.parse(JSON.stringify(designs));
        const out = matchObservationsToDesign(obs, designs);
        expect(out.map((r) => r.point_id)).toEqual(['P002', 'P001']);
        expect(obs).toEqual(obsSnapshot);
        expect(designs).toEqual(designsSnapshot);
    });

    it('handles empty / non-array inputs', () => {
        expect(matchObservationsToDesign([], designs)).toEqual([]);
        expect(matchObservationsToDesign(null, designs)).toEqual([]);
        const o = [{ point_id: 'P001', n: 10000, e: 5000 }];
        const out = matchObservationsToDesign(o, null);
        expect(out[0].match_type).toBe('none');
    });
});
