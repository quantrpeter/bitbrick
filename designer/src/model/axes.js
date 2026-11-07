// Axis conventions.
//
// What users see (CAD style, right handed): X to the right, Y away from the viewer (both flat), Z up.
// What is stored and drawn (Three.js): x right, y up, z towards the viewer.
// The two are related by a rotation of 90 degrees about X:   user (X, Y, Z) = internal (x, -z, y).
// Only labels, cursor read-outs, key bindings and the STL export use the user convention; saved designs,
// share links and the mesh builder keep the internal one, so nothing stored needs migrating.

/** Internal cell [x, y, z] -> the cell coordinates shown to the user [X, Y, Z]. */
export const toUserCell = ([x, y, z]) => [x, 0 - z, y];

/** Internal block axis letter -> the letter shown to the user. */
export const AXIS_TO_USER = { x: 'X', z: 'Y', y: 'Z' };

/** Lower case letter the user types or picks -> internal axis letter. */
export const AXIS_FROM_USER = { x: 'x', y: 'z', z: 'y' };

/** Size of a bounding box [dx, dy, dz] (internal) as [X, Y, Z] extents for display. */
export const toUserSize = ([dx, dy, dz]) => [dx, dz, dy];

/**
 * Positions (flat xyz array, internal axes) rotated into the Z-up frame that slicers expect, and dropped
 * so the lowest point sits on Z = 0. It is a proper rotation (determinant +1), so triangle winding and
 * therefore normals stay correct.
 */
export function toZUp(positions) {
	const out = new Float32Array(positions.length);
	let minZ = Infinity;
	for (let i = 0; i < positions.length; i += 3) {
		out[i] = positions[i];
		out[i + 1] = 0 - positions[i + 2];
		out[i + 2] = positions[i + 1];
		if (out[i + 2] < minZ) minZ = out[i + 2];
	}
	if (Number.isFinite(minZ) && minZ !== 0) {
		for (let i = 2; i < out.length; i += 3) out[i] -= minZ;
	}
	return out;
}
