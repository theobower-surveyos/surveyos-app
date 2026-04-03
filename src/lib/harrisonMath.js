// Harrison Math Engine — Survey-Grade Precision
// All deltas rounded to 0.001 (3 decimal places) to match Total Station output

export const TOLERANCE_LIMIT = 0.02; // 2cm — maximum allowable 3D vector magnitude

export const calculateDeltas = (designPoint, asBuiltPoint, tolerance = TOLERANCE_LIMIT) => {
  if (!designPoint || !asBuiltPoint) return null;

  // Round to 3 decimal places after subtraction — industry standard
  const dN = roundTo3(asBuiltPoint.northing - designPoint.northing);
  const dE = roundTo3(asBuiltPoint.easting - designPoint.easting);
  const dZ = roundTo3(asBuiltPoint.elevation - designPoint.elevation);

  // 2D Horizontal Distance
  const horizontalDiff = roundTo3(Math.sqrt(Math.pow(dN, 2) + Math.pow(dE, 2)));

  // 3D Vector — the true spatial residual
  const vector3d = roundTo3(Math.sqrt(Math.pow(dN, 2) + Math.pow(dE, 2) + Math.pow(dZ, 2)));

  // Tolerance gate: 3D vector is the authoritative check
  const outOfTolerance = vector3d > tolerance;

  // Precision score: inverse of 3D vector (higher = better). Capped to avoid Infinity at 0.
  const precision_score = vector3d > 0 ? roundTo3(1 / vector3d) : 9999.999;

  return {
    dN: dN.toFixed(3),
    dE: dE.toFixed(3),
    dZ: dZ.toFixed(3),
    horizontalDiff: horizontalDiff.toFixed(3),
    vector3d: vector3d.toFixed(3),
    precision_score: precision_score.toFixed(3),
    outOfTolerance,
    status: outOfTolerance ? 'REJECTED' : 'PASS',
  };
};

function roundTo3(val) {
  return Math.round(val * 1000) / 1000;
}
