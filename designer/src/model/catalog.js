// Preset parts. Each preset is generated from a few helpers so the list stays easy to extend.
// z here is the preset's depth index. It is stored as -z (away from the viewer) so user Y cells are positive.
const b = (x, y, z, type, axis, rounded = true, size = 'full', measurements) => ({
	pos: [x, y, 0 - z], type, axis, size, rounded, ...(measurements ? { measurements } : {}),
});
const range = (n) => Array.from({ length: n }, (_, i) => i);

const beam = (n, type = 'pinHole') => range(n).map((i) => b(i, 0, 0, type, 'y'));

const plate = (w, d, type = 'pinHole') =>
	range(w).flatMap((x) => range(d).map((z) => b(x, 0, z, type, 'y')));

const frame = (w, d) => {
	const out = [];
	for (let x = 0; x < w; x++) {
		for (let z = 0; z < d; z++) {
			if (x === 0 || z === 0 || x === w - 1 || z === d - 1) out.push(b(x, 0, z, 'pinHole', 'y'));
		}
	}
	return out;
};

const lBeam = (a, c) => [
	...range(a).map((i) => b(i, 0, 0, 'pinHole', 'y')),
	...range(c - 1).map((i) => b(0, 0, i + 1, 'pinHole', 'y')),
];

const tBeam = () => [
	...range(5).map((i) => b(i, 0, 0, 'pinHole', 'y')),
	b(2, 0, 1, 'pinHole', 'y'),
	b(2, 0, 2, 'pinHole', 'y'),
];

const cross = () => [
	b(1, 0, 1, 'pinHole', 'y'),
	b(0, 0, 1, 'pinHole', 'x'),
	b(2, 0, 1, 'pinHole', 'x'),
	b(1, 0, 0, 'pinHole', 'z'),
	b(1, 0, 2, 'pinHole', 'z'),
];

const stack = (n, type) => range(n).map((i) => b(0, i, 0, type, 'y'));


// ---- round parts, pins, axles, thin beams and gears (a cylinder is a brick whose corner radius is half a cell)
const ROUND = { cornerRadius: 4 };
const round = (x, y, z, type, axis, size = 'full') => b(x, y, z, type, axis, true, size, ROUND);
const pinRun = (n, from = 0) => range(n).map((i) => b(from + i, 0, 0, 'pin', 'x', false));
const axleRun = (n, from = 0) => range(n).map((i) => b(from + i, 0, 0, 'axle', 'x', false));
const ball = (x) => b(x, 0, 0, 'ballJoint', 'x', false);
const thinBeam = (n, typeAt) => range(n).map((i) => b(i, 0, 0, typeAt(i, n), 'y', true, 'half'));
const pinOnly = () => 'pinHole';
const axleEnds = (i, n) => (i === 0 || i === n - 1 ? 'axleHole' : 'pinHole');
const gear = (teeth, size = 'half') => [b(0, 0, 0, 'gear', 'y', false, size, { gearTeeth: teeth })];

export const CATEGORIES = ['Beams', 'Thin beams', 'Frames', 'Plates', 'Connectors', 'Round parts', 'Pins and axles', 'Gears'];

export const catalog = [
	...[3, 5, 7, 9, 11, 13].map((n) => ({ id: `beam-${n}`, name: `Beam ${n}`, category: 'Beams', blocks: beam(n) })),
	...[3, 5, 7].map((n) => ({ id: `axle-beam-${n}`, name: `Axle Hole Beam ${n}`, category: 'Beams', blocks: beam(n, 'axleHole') })),
	{ id: 'beam-5-mixed', name: 'Beam 5 (pin and axle holes)', category: 'Beams',
		blocks: beam(5).map((blk, i) => (i % 2 ? { ...blk, type: 'axleHole' } : blk)) },
	{ id: 'half-beam-4', name: 'Thin Beam 4', category: 'Beams',
		blocks: range(4).map((i) => b(i, 0, 0, 'pinHole', 'y', true, 'half')) },

	{ id: 'frame-3x5', name: 'Frame 3 x 5', category: 'Frames', blocks: frame(3, 5) },
	{ id: 'frame-5x7', name: 'Frame 5 x 7', category: 'Frames', blocks: frame(5, 7) },
	{ id: 'frame-7x11', name: 'Frame 7 x 11', category: 'Frames', blocks: frame(7, 11) },
	{ id: 'frame-5x5', name: 'Frame 5 x 5', category: 'Frames', blocks: frame(5, 5) },

	{ id: 'plate-2x4', name: 'Plate 2 x 4', category: 'Plates', blocks: plate(2, 4) },
	{ id: 'plate-3x5', name: 'Plate 3 x 5', category: 'Plates', blocks: plate(3, 5) },
	{ id: 'plate-3x3', name: 'Plate 3 x 3', category: 'Plates', blocks: plate(3, 3) },
	{ id: 'plate-axle-2x4', name: 'Axle Plate 2 x 4', category: 'Plates', blocks: plate(2, 4, 'axleHole') },

	{ id: 'l-beam-3x3', name: 'L Beam 3 x 3', category: 'Connectors', blocks: lBeam(3, 3) },
	{ id: 'l-beam-2x4', name: 'L Beam 2 x 4', category: 'Connectors', blocks: lBeam(4, 2) },
	{ id: 'l-beam-5x5', name: 'L Beam 5 x 5', category: 'Connectors', blocks: lBeam(5, 5) },
	{ id: 't-beam', name: 'T Beam', category: 'Connectors', blocks: tBeam() },
	{ id: 'cross-block', name: 'Cross Block', category: 'Connectors', blocks: cross() },
	{ id: 'corner-block', name: 'Corner Block', category: 'Connectors',
		blocks: [b(0, 0, 0, 'pinHole', 'x', false), b(1, 0, 0, 'pinHole', 'y', false), b(0, 1, 0, 'pinHole', 'z', false)] },
	{ id: 'tower-3', name: 'Tower 3', category: 'Connectors', blocks: stack(3, 'pinHole') },
	{ id: 'solid-block', name: 'Solid Block', category: 'Connectors', blocks: [b(0, 0, 0, 'solid', 'y', false)] },

	{ id: 'pin', name: 'Pin', category: 'Pins and axles', blocks: [b(0, 0, 0, 'pin', 'x', false)] },
	{ id: 'pin-3', name: 'Long Pin', category: 'Pins and axles', blocks: range(3).map((i) => b(i, 0, 0, 'pin', 'x', false)) },
	{ id: 'axle-3', name: 'Axle 3', category: 'Pins and axles', blocks: range(3).map((i) => b(i, 0, 0, 'axle', 'x', false)) },
	{ id: 'axle-5', name: 'Axle 5', category: 'Pins and axles', blocks: range(5).map((i) => b(i, 0, 0, 'axle', 'x', false)) },
	{ id: 'axle-8', name: 'Axle 8', category: 'Pins and axles', blocks: range(8).map((i) => b(i, 0, 0, 'axle', 'x', false)) },
	{ id: 'ball-joint', name: 'Ball Joint', category: 'Pins and axles',
		blocks: [b(0, 0, 0, 'solid', 'x', false), b(1, 0, 0, 'ballJoint', 'x', false)] },
	{ id: 'pin-block', name: 'Block with Pin', category: 'Pins and axles',
		blocks: [b(0, 0, 0, 'pinHole', 'y'), b(1, 0, 0, 'solid', 'x', false), b(2, 0, 0, 'pin', 'x', false)] },
	{ id: 'axle-block', name: 'Block with Axle', category: 'Pins and axles',
		blocks: [b(0, 0, 0, 'solid', 'x', false), b(1, 0, 0, 'axle', 'x', false), b(2, 0, 0, 'axle', 'x', false)] },

	// ---- more beams
	{ id: 'beam-2', name: 'Beam 2', category: 'Beams', blocks: beam(2) },
	{ id: 'beam-2-mixed', name: 'Beam 2 (axle and pin)', category: 'Beams', blocks: [b(0, 0, 0, 'axleHole', 'y'), b(1, 0, 0, 'pinHole', 'y')] },
	{ id: 'beam-3-mixed', name: 'Beam 3 (axle ends)', category: 'Beams', blocks: [b(0, 0, 0, 'axleHole', 'y'), b(1, 0, 0, 'pinHole', 'y'), b(2, 0, 0, 'axleHole', 'y')] },

	// ---- thin beams (half a cell thick)
	...[2, 3, 5, 7, 9].map((n) => ({ id: `thin-beam-${n}`, name: `Thin Beam ${n}`, category: 'Thin beams', blocks: thinBeam(n, pinOnly) })),
	...[2, 3, 4, 5, 6].map((n) => ({ id: `thin-axle-beam-${n}`, name: `Thin Beam ${n} (axle ends)`, category: 'Thin beams', blocks: thinBeam(n, axleEnds) })),
	{ id: 'thin-beam-pin', name: 'Thin Beam with Pin', category: 'Thin beams',
		blocks: [b(0, 1, 0, 'axleHole', 'y', true, 'half'), b(1, 1, 0, 'pinHole', 'y', true, 'half'), b(1, 0, 0, 'pin', 'y', false)] },
	{ id: 'thin-beam-step', name: 'Thin Beam Step', category: 'Thin beams',
		blocks: [b(0, 0, 0, 'axleHole', 'y', true, 'half'), b(1, 0, 0, 'pinHole', 'y', true, 'half'), b(2, 0, 0, 'pinHole', 'y', true, 'half'),
			b(2, 1, 0, 'axleHole', 'y', true, 'half')] },
	{ id: 'thin-l-beam', name: 'Thin L Beam 3 x 3', category: 'Thin beams',
		blocks: [...thinBeam(3, axleEnds), b(0, 0, 1, 'pinHole', 'y', true, 'half'), b(0, 0, 2, 'axleHole', 'y', true, 'half')] },

	// ---- more connectors
	{ id: 't-beam-3x3', name: 'T Beam 3 x 3', category: 'Connectors',
		blocks: [b(1, 0, 0, 'pinHole', 'z'), b(1, 1, 0, 'pinHole', 'z'), b(1, 2, 0, 'pinHole', 'z'), b(0, 0, 0, 'pinHole', 'z'), b(2, 0, 0, 'pinHole', 'z')] },
	{ id: 'elbow-axle-pin', name: 'Elbow (axle and pin hole)', category: 'Connectors',
		blocks: [round(0, 0, 0, 'axleHole', 'x'), b(1, 0, 0, 'pinHole', 'y')] },
	{ id: 'elbow-pin-axle', name: 'Elbow (pin and axle hole)', category: 'Connectors',
		blocks: [round(0, 0, 0, 'pinHole', 'x'), b(1, 0, 0, 'axleHole', 'y')] },
	{ id: 'angle-beam-axle', name: 'Angle Beam 3 x 3 (axle holes)', category: 'Connectors',
		blocks: [b(0, 0, 0, 'axleHole', 'y'), b(1, 0, 0, 'pinHole', 'y'), b(2, 0, 0, 'pinHole', 'y'), b(0, 0, 1, 'pinHole', 'y'), b(0, 0, 2, 'axleHole', 'y')] },
	{ id: 'angle-block', name: 'Angle Block (pin and axle)', category: 'Connectors',
		blocks: [b(0, 0, 0, 'pinHole', 'x'), b(1, 0, 0, 'axleHole', 'y'), b(1, 0, 1, 'pinHole', 'z')] },
	{ id: 'u-connector', name: 'U Connector', category: 'Connectors',
		blocks: [b(0, 0, 0, 'pinHole', 'y'), b(1, 0, 0, 'pinHole', 'y'), b(2, 0, 0, 'pinHole', 'y'), b(0, 0, 1, 'pinHole', 'x'), b(2, 0, 1, 'pinHole', 'x')] },
	{ id: 'cross-axle-block', name: 'Cross Block (axle holes)', category: 'Connectors',
		blocks: [b(1, 0, 1, 'pinHole', 'y'), b(0, 0, 1, 'axleHole', 'x'), b(2, 0, 1, 'axleHole', 'x'), b(1, 0, 0, 'axleHole', 'z'), b(1, 0, 2, 'axleHole', 'z')] },
	{ id: 'ball-cross', name: 'Ball Cross', category: 'Connectors',
		blocks: [b(1, 1, 0, 'solid', 'x', false), b(0, 1, 0, 'ballJoint', 'x', false), b(2, 1, 0, 'ballJoint', 'x', false),
			b(1, 2, 0, 'ballJoint', 'y', false), b(1, 1, 1, 'ballJoint', 'z', false)] },

	// ---- round parts
	{ id: 'round-bush', name: 'Round Bush', category: 'Round parts', blocks: [round(0, 0, 0, 'axleHole', 'x')] },
	{ id: 'round-bush-thin', name: 'Thin Round Bush', category: 'Round parts', blocks: [round(0, 0, 0, 'axleHole', 'x', 'half')] },
	{ id: 'round-bush-2', name: 'Round Bush 2', category: 'Round parts', blocks: [round(0, 0, 0, 'axleHole', 'x'), round(1, 0, 0, 'axleHole', 'x')] },
	{ id: 'round-pin-bush', name: 'Round Pin Bush', category: 'Round parts', blocks: [round(0, 0, 0, 'pinHole', 'x')] },
	{ id: 'round-pin-bush-2', name: 'Round Pin Bush 2', category: 'Round parts', blocks: [round(0, 0, 0, 'pinHole', 'x'), round(1, 0, 0, 'pinHole', 'x')] },
	{ id: 'round-axle-connector', name: 'Round Axle Connector', category: 'Round parts', blocks: [round(0, 0, 0, 'pinHole', 'x'), ...axleRun(2, 1)] },
	{ id: 'round-pin-connector', name: 'Round Pin Connector', category: 'Round parts', blocks: [round(0, 0, 0, 'pinHole', 'x'), ...pinRun(3, 1)] },
	{ id: 'axle-stop', name: 'Axle with End Plate', category: 'Round parts', blocks: [...axleRun(2), round(2, 0, 0, 'solid', 'x', 'half')] },
	{ id: 'double-pin-connector', name: 'Double Pin Connector', category: 'Round parts',
		blocks: [b(0, 0, 0, 'pinHole', 'y'), b(1, 0, 0, 'axleHole', 'y'), b(0, 0, 1, 'pin', 'z', false), b(1, 0, 1, 'pin', 'z', false)] },

	// ---- more pins and axles
	{ id: 'axle-2', name: 'Axle 2', category: 'Pins and axles', blocks: axleRun(2) },
	{ id: 'axle-4', name: 'Axle 4', category: 'Pins and axles', blocks: axleRun(4) },
	{ id: 'axle-pin-3', name: 'Axle with Pin End', category: 'Pins and axles', blocks: [...axleRun(2), ...pinRun(1, 2)] },
	{ id: 'axle-pin-5', name: 'Long Axle with Pin End', category: 'Pins and axles', blocks: [...axleRun(4), ...pinRun(1, 4)] },
	{ id: 'ball-pin', name: 'Ball Pin', category: 'Pins and axles', blocks: [ball(0), ...pinRun(2, 1)] },
	{ id: 'ball-axle', name: 'Ball Axle', category: 'Pins and axles', blocks: [ball(0), ...axleRun(2, 1)] },
	{ id: 'axle-two-balls', name: 'Axle with Two Balls', category: 'Pins and axles', blocks: [ball(0), ...axleRun(3, 1), ball(4)] },

	// ---- gears: N teeth are N mm across the pitch circle, so two gears mesh when their centres are (N1 + N2) / 2 mm apart.
	// Gears of 8, 24, 40 teeth mesh at whole cells with each other, and so do 16, 32, 48 teeth.
	...[8, 16, 24, 32, 40, 48].map((n) => ({ id: `gear-${n}`, name: `Gear ${n} teeth`, category: 'Gears', blocks: gear(n) })),
	...[16, 24, 40].map((n) => ({ id: `gear-${n}-thick`, name: `Gear ${n} teeth (thick)`, category: 'Gears', blocks: gear(n, 'full') })),
	// A gear on an axle is as thick as a whole cell, so the axle pieces on both sides touch it (a thin gear leaves a gap and
	// the part falls apart into separate pieces).
	{ id: 'gear-8-axle', name: 'Gear 8 teeth on Axle', category: 'Gears',
		blocks: [b(0, 0, 0, 'axle', 'y', false), { ...gear(8, 'full')[0], pos: [0, 1, 0] }, b(0, 2, 0, 'axle', 'y', false)] },
	{ id: 'gear-24-axle', name: 'Gear 24 teeth on Axle', category: 'Gears',
		blocks: [b(0, 0, 0, 'axle', 'y', false), { ...gear(24, 'full')[0], pos: [0, 1, 0] }, b(0, 2, 0, 'axle', 'y', false)] },
];

export function searchCatalog(query, category) {
	const q = String(query || '').trim().toLowerCase();
	return catalog.filter((c) => (!category || c.category === category) && (!q || c.name.toLowerCase().includes(q)));
}
