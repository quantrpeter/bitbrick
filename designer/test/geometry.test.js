import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildMesh } from '../src/geometry/build.js';
import { toBinaryStl } from '../src/geometry/stl.js';
import { emptyPart, setBlock } from '../src/model/part.js';
import { catalog } from '../src/model/catalog.js';

const wasm = await Module();
wasm.setup();

const blk = (pos, over = {}) => ({ pos, type: 'pinHole', axis: 'x', size: 'full', rounded: false, ...over });
const partOf = (blocks, measurements = {}) => ({ ...emptyPart('t'), blocks, measurements });

test('empty part gives an empty mesh', () => {
	const r = buildMesh(wasm, emptyPart());
	assert.equal(r.triangleCount, 0);
	assert.equal(r.manifold, true);
});

test('single solid block has the expected volume', () => {
	const r = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })], { edgeMargin: 0 }));
	assert.ok(r.manifold);
	assert.ok(Math.abs(r.volume - 8 * 8 * 8) < 0.5, `volume ${r.volume}`);
});

test('edge margin shrinks outer faces', () => {
	const r = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })], { edgeMargin: 0.2 }));
	assert.ok(Math.abs(r.volume - 7.6 ** 3) < 0.5);
});

test('half block is half as long along its axis', () => {
	const r = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid', size: 'half' })], { edgeMargin: 0 }));
	assert.ok(Math.abs(r.volume - 8 * 8 * 4) < 0.5);
	assert.ok(Math.abs(r.bbox.max[0] - 4) < 1e-3, 'x axis block is 4 mm long in x');
	assert.ok(Math.abs(r.bbox.max[1] - 8) < 1e-3);
});

test('pin hole removes material', () => {
	const solid = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })]));
	const hole = buildMesh(wasm, partOf([blk([0, 0, 0])]));
	assert.ok(hole.manifold);
	assert.ok(hole.volume < solid.volume - 100, `${hole.volume} vs ${solid.volume}`);
});

test('axle hole removes less than a pin hole', () => {
	const pin = buildMesh(wasm, partOf([blk([0, 0, 0])]));
	const axle = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'axleHole' })]));
	assert.ok(axle.manifold);
	assert.ok(axle.volume > pin.volume);
});

test('hole diameter measurement changes volume', () => {
	const a = buildMesh(wasm, partOf([blk([0, 0, 0])], { pinHoleDiameter: 4.8 }));
	const b = buildMesh(wasm, partOf([blk([0, 0, 0])], { pinHoleDiameter: 5.2 }));
	assert.ok(b.volume < a.volume);
});

test('every hole orientation produces a manifold of the same volume', () => {
	const vols = ['x', 'y', 'z'].map((axis) => {
		const r = buildMesh(wasm, partOf([blk([0, 0, 0], { axis })]));
		assert.ok(r.manifold, axis);
		return r.volume;
	});
	assert.ok(Math.abs(vols[0] - vols[1]) < 0.01 && Math.abs(vols[1] - vols[2]) < 0.01, vols.join());
});

test('neighbouring blocks merge flush into one body', () => {
	const r = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' }), blk([1, 0, 0], { type: 'solid' })], { edgeMargin: 0.2 }));
	assert.ok(r.manifold);
	// 2 cells long (16 - 0.4) x 7.6 x 7.6, no gap in the middle
	assert.ok(Math.abs(r.volume - 15.6 * 7.6 * 7.6) < 0.5, `volume ${r.volume}`);
});

test('rounded corners remove material only where nothing is attached', () => {
	const sharp = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })]));
	const round = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid', rounded: true })]));
	assert.ok(round.manifold);
	assert.ok(round.volume < sharp.volume - 5);
});

test('pin, axle and ball joint attach to a body', () => {
	for (const type of ['pin', 'axle', 'ballJoint']) {
		const r = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' }), blk([1, 0, 0], { type, axis: 'x' })]));
		assert.ok(r.manifold, type);
		assert.ok(r.bbox.max[0] > 15, `${type} sticks out: ${r.bbox.max[0]}`);
	}
});

test('every catalog preset builds a manifold mesh', () => {
	for (const preset of catalog) {
		const part = partOf(preset.blocks);
		const r = buildMesh(wasm, part);
		assert.ok(r.manifold, preset.id);
		assert.ok(r.triangleCount > 0, preset.id);
		assert.ok(r.volume > 0, preset.id);
	}
});

test('beam frame 5x7 builds quickly', () => {
	const frame = catalog.find((c) => c.id === 'frame-5x7');
	const t0 = performance.now();
	const r = buildMesh(wasm, partOf(frame.blocks));
	const ms = performance.now() - t0;
	assert.ok(r.manifold);
	assert.ok(ms < 5000, `took ${ms.toFixed(0)} ms`);
});

test('STL has the right size and triangle count', () => {
	const r = buildMesh(wasm, partOf([blk([0, 0, 0])]));
	const buf = toBinaryStl(r, 'x');
	assert.equal(buf.byteLength, 84 + r.triangleCount * 50);
	assert.equal(new DataView(buf).getUint32(80, true), r.triangleCount);
});

test('setBlock keeps parts immutable', () => {
	const p = emptyPart();
	const q = setBlock(p, blk([0, 0, 0]));
	assert.equal(p.blocks.length, 0);
	assert.equal(q.blocks.length, 1);
});

test('a per-brick override changes that brick only', () => {
	const two = (override) => partOf([
		{ ...blk([0, 0, 0]), ...(override ? { measurements: override } : {}) },
		blk([4, 0, 0]),
	]);
	const base = buildMesh(wasm, two(null));
	const wide = buildMesh(wasm, two({ pinHoleDiameter: 5.4 }));
	assert.ok(wide.manifold);
	assert.ok(wide.volume < base.volume - 5, 'first hole is wider, so less material');

	// the same override on both bricks removes twice as much, so each brick really has its own value
	const both = buildMesh(wasm, partOf([{ ...blk([0, 0, 0]), measurements: { pinHoleDiameter: 5.4 } }, { ...blk([4, 0, 0]), measurements: { pinHoleDiameter: 5.4 } }]));
	const oneRemoved = base.volume - wide.volume;
	const bothRemoved = base.volume - both.volume;
	assert.ok(Math.abs(bothRemoved - 2 * oneRemoved) < 0.5, `${bothRemoved} vs ${2 * oneRemoved}`);
});

test('whole-part overrides from older designs still apply to bricks without their own value', () => {
	const old = buildMesh(wasm, partOf([blk([0, 0, 0])], { pinHoleDiameter: 5.4 }));
	const perBrick = buildMesh(wasm, partOf([{ ...blk([0, 0, 0]), measurements: { pinHoleDiameter: 5.4 } }]));
	assert.ok(Math.abs(old.volume - perBrick.volume) < 1e-3);
	// and a brick's own value beats the whole-part one
	const mixed = buildMesh(wasm, partOf([{ ...blk([0, 0, 0]), measurements: { pinHoleDiameter: 4.8 } }], { pinHoleDiameter: 5.4 }));
	const small = buildMesh(wasm, partOf([blk([0, 0, 0])], { pinHoleDiameter: 4.8 }));
	assert.ok(Math.abs(mixed.volume - small.volume) < 1e-3);
});

test('brick measurements of other types are ignored by the builder', () => {
	const a = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })]));
	const b = buildMesh(wasm, partOf([{ ...blk([0, 0, 0], { type: 'solid' }), measurements: { pinHoleDiameter: 6 } }]));
	assert.ok(Math.abs(a.volume - b.volume) < 1e-6);
});

test('edge margin and pin diameter work per brick', () => {
	const m0 = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'solid' })]));
	const m1 = buildMesh(wasm, partOf([{ ...blk([0, 0, 0], { type: 'solid' }), measurements: { edgeMargin: 0.6 } }]));
	assert.ok(m1.volume < m0.volume);
	const pinThin = buildMesh(wasm, partOf([{ ...blk([0, 0, 0], { type: 'pin' }), measurements: { pinDiameter: 3.5 } }]));
	const pinStd = buildMesh(wasm, partOf([blk([0, 0, 0], { type: 'pin' })]));
	assert.ok(pinThin.volume < pinStd.volume);
});
