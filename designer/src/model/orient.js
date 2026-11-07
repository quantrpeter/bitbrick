// Turning a catalog preset before it is placed.
//
// x / y / z (the user's axes, see axes.js) point the preset along that axis and pressing the same key again
// reverses it. "The preset's direction" is the axis of its holes, pins, axles and ball joints (the most common
// block axis; the first block wins a tie). Presets are stored in the internal frame (y up, -z away from you).
//
// The result is always a proper rotation of the whole preset (never a mirror image) by whole quarter turns, so
// every brick keeps its shape; only positions and block axes change. Cells are rotated about their centres and
// the result is moved so the lowest cell sits at 0 in every direction, like the stored presets.

const INDEX = { x: 0, y: 1, z: 2 };
const LETTER = ['x', 'y', 'z'];

// Where the user's +X, +Y and +Z point, in internal coordinates.
const USER_DIRECTION = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };

/** The block axis the preset mostly points along. */
export function primaryAxis(blocks) {
	const counts = { x: 0, y: 0, z: 0 };
	for (const b of blocks) counts[b.axis] += 1;
	let best = blocks[0]?.axis || 'y';
	for (const a of LETTER) if (counts[a] > counts[best]) best = a;
	return best;
}

const zero = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

/** Half turn about internal axis p. */
function halfTurn(p) {
	const m = zero();
	for (let i = 0; i < 3; i++) m[i][i] = i === p ? 1 : -1;
	return m;
}

const multiply = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

/**
 * Rotation matrix taking the preset's own axis `primary` onto the user's `userKey` axis (positive direction),
 * and then, when `reversed`, turning it around by a half turn so it points the other way.
 */
export function orientationMatrix(primary, userKey, reversed = false) {
	const a = INDEX[primary];
	const dir = USER_DIRECTION[userKey];
	const t = dir.findIndex((n) => n !== 0);
	const s = dir[t];
	const perpendicularTo = (axis) => (axis === 1 ? 0 : 1); // keep Z (up) where possible: turn about it

	let m;
	if (a === t) {
		m = s > 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : halfTurn(perpendicularTo(a));
	} else {
		// quarter turn in the plane of the two axes: e_a -> s*e_t, e_t -> -s*e_a, the third axis stays
		const c = 3 - a - t;
		m = zero();
		m[t][a] = s;
		m[a][t] = -s;
		m[c][c] = 1;
	}
	return reversed ? multiply(halfTurn(perpendicularTo(t)), m) : m;
}

/** The preset's blocks pointing along `userKey` ('x' | 'y' | 'z', null = as stored), optionally reversed. */
export function orientBlocks(blocks, userKey, reversed = false) {
	if (!userKey || !blocks.length) return blocks;
	const m = orientationMatrix(primaryAxis(blocks), userKey, reversed);

	const moved = blocks.map((b) => {
		const centre = b.pos.map((n) => n + 0.5);
		const pos = [0, 1, 2].map((i) => m[i][0] * centre[0] + m[i][1] * centre[1] + m[i][2] * centre[2] - 0.5);
		const col = INDEX[b.axis];
		const axis = LETTER[[0, 1, 2].find((i) => m[i][col] !== 0)];
		return { ...b, pos, axis };
	});
	const low = [0, 1, 2].map((i) => Math.min(...moved.map((b) => b.pos[i])));
	return moved.map((b) => ({ ...b, pos: b.pos.map((n, i) => (n - low[i]) || 0) })); // `|| 0` turns -0 into 0
}
