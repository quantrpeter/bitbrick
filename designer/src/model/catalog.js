// Preset parts. Each preset is generated from a few helpers so the list stays easy to extend.
// z here is the preset's depth index. It is stored as -z (away from the viewer) so user Y cells are positive.
const b = (x, y, z, type, axis, rounded = true, size = 'full') => ({ pos: [x, y, 0 - z], type, axis, size, rounded });
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

export const CATEGORIES = ['Beams', 'Frames', 'Plates', 'Connectors', 'Pins and axles'];

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
];

export function searchCatalog(query, category) {
	const q = String(query || '').trim().toLowerCase();
	return catalog.filter((c) => (!category || c.category === category) && (!q || c.name.toLowerCase().includes(q)));
}
