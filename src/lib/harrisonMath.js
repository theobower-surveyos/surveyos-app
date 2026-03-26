export const calculateDeltas = (designPoint, asBuiltPoint, tolerance = 0.10) => {
  if (!designPoint || !asBuiltPoint) return null;

  const dN = asBuiltPoint.northing - designPoint.northing;
  const dE = asBuiltPoint.easting - designPoint.easting;
  const dZ = asBuiltPoint.elevation - designPoint.elevation;
  
  // Calculate 2D Horizontal Distance (Pythagorean theorem)
  const horizontalDiff = Math.sqrt(Math.pow(dN, 2) + Math.pow(dE, 2));

  return {
    dN: dN.toFixed(3),
    dE: dE.toFixed(3),
    dZ: dZ.toFixed(3),
    horizontalDiff: horizontalDiff.toFixed(3),
    outOfTolerance: horizontalDiff > tolerance 
  };
};