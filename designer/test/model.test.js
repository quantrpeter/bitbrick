import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePart, decodePart } from '../src/model/codec.js';
import {
	emptyPart, setBlock, removeBlock, parsePart, mirrorX, normalizeOrigin, blockAt,
	setBlockMeasurements, setTypeMeasurements, insertPreset, footprintCenter, sameBlock,
} from '../src/model/part.js';
import {
	resolveMeasurements, validateMeasurement, sparseMeasurements, DEFAULT_MEASUREMENTS,
	measurementsForType, relevantKeys, cleanBlockMeasurements, measurementsForBlock, MEASUREMENTS,
} from '../src/model/defaults.js';
import { catalog, searchCatalog } from '../src/model/catalog.js';
import { fileNameFor, toBinaryStl } from '../src/geometry/stl.js';
import { toUserCell, toUserSize, toZUp, AXIS_TO_USER, AXIS_FROM_USER } from '../src/model/axes.js';

const blk = (pos, over = {}) => ({ pos, type: 'pinHole', axis: 'x', size: 'full', rounded: true, ...over });

test('codec round trips every catalog preset', () => {
	for (const c of catalog) {
		const part = { ...emptyPart(c.name), blocks: c.blocks };
		assert.deepEqual(decodePart(encodePart(part)), parsePart(part), c.id);
	}
});

test('codec keeps measurement overrides and drops defaults', () => {
	const part = { ...emptyPart('a b&c~d'), blocks: [blk([0, 0, 0])], measurements: { pinHoleDiameter: 5.1, gridUnit: 8 } };
	const text = encodePart(part);
	assert.ok(!text.includes('gridUnit'));
	assert.ok(!/[ &]/.test(text.split('~')[1]), 'name is url safe');
	const back = decodePart(text);
	assert.equal(back.name, 'a b&c~d');
	assert.deepEqual(back.measurements, { pinHoleDiameter: 5.1 });
});

test('codec handles negative coordinates and the empty part', () => {
	const p = { ...emptyPart('n'), blocks: [blk([-3, 4, -1], { type: 'axle', axis: 'z', size: 'half', rounded: false })] };
	assert.deepEqual(decodePart(encodePart(p)).blocks, p.blocks);
	assert.deepEqual(decodePart(encodePart(emptyPart('e'))).blocks, []);
});

test('codec rejects garbage', () => {
	for (const bad of ['', 'v9~x~~', 'v1~x~1.2.3.qxf~', 'v1~x~a.b.c.pxf~', 'v1~x~99999.0.0.pxf~', null]) {
		assert.throws(() => decodePart(bad), undefined, String(bad));
	}
});

test('codec ignores unknown measurement keys', () => {
	const back = decodePart('v1~x~0.0.0.pxf~evil:1,pinHoleDiameter:abc,edgeMargin:0.3');
	assert.deepEqual(back.measurements, { edgeMargin: 0.3 });
});

test('parsePart rejects duplicates and bad values', () => {
	const dup = { version: 1, name: 'x', blocks: [blk([0, 0, 0]), blk([0, 0, 0])] };
	assert.throws(() => parsePart(dup));
	assert.throws(() => parsePart({ version: 1, name: 'x', blocks: [blk([0, 0, 0], { type: 'laser' })] }));
	assert.throws(() => parsePart({ version: 1, name: 'x', blocks: [blk([0.5, 0, 0])] }));
	assert.throws(() => parsePart({ version: 2, name: 'x', blocks: [] }));
});

test('setBlock replaces in place and removeBlock removes', () => {
	let p = setBlock(emptyPart(), blk([0, 0, 0]));
	p = setBlock(p, blk([0, 0, 0], { type: 'solid' }));
	assert.equal(p.blocks.length, 1);
	assert.equal(blockAt(p, [0, 0, 0]).type, 'solid');
	assert.equal(removeBlock(p, [0, 0, 0]).blocks.length, 0);
	assert.equal(removeBlock(p, [5, 5, 5]), p);
});

test('setBlock ignores out of range positions', () => {
	const p = emptyPart();
	assert.equal(setBlock(p, blk([5000, 0, 0])), p);
});

test('mirror and normalize', () => {
	const p = { ...emptyPart(), blocks: [blk([0, 0, 0]), blk([2, 1, 0])] };
	assert.deepEqual(mirrorX(p).blocks.map((x) => x.pos), [[2, 0, 0], [0, 1, 0]]);
	const n = normalizeOrigin({ ...p, blocks: p.blocks.map((x) => ({ ...x, pos: x.pos.map((v) => v - 5) })) });
	assert.deepEqual(n.blocks.map((x) => x.pos), [[0, 0, 0], [2, 1, 0]]);
});

test('measurements: defaults, validation, sparse', () => {
	assert.deepEqual(resolveMeasurements({}), DEFAULT_MEASUREMENTS);
	assert.equal(resolveMeasurements({ pinHoleDiameter: 99 }).pinHoleDiameter, DEFAULT_MEASUREMENTS.pinHoleDiameter);
	assert.equal(resolveMeasurements({ pinHoleDiameter: 5 }).pinHoleDiameter, 5);
	assert.equal(validateMeasurement('pinHoleDiameter', 5), null);
	assert.ok(validateMeasurement('pinHoleDiameter', 50));
	assert.ok(validateMeasurement('pinHoleDiameter', NaN));
	assert.ok(validateMeasurement('subdivisionsPerQuarter', 3.5));
	assert.ok(validateMeasurement('nope', 1));
	assert.deepEqual(sparseMeasurements({ pinHoleDiameter: 4.95, edgeMargin: 0.3, bogus: 1 }), { edgeMargin: 0.3 });
});

test('catalog ids are unique, presets have no duplicate cells, search works', () => {
	const ids = new Set(catalog.map((c) => c.id));
	assert.equal(ids.size, catalog.length);
	for (const c of catalog) assert.doesNotThrow(() => parsePart({ ...emptyPart(), blocks: c.blocks }), c.id);
	assert.ok(searchCatalog('frame').every((c) => /frame/i.test(c.name)));
	assert.ok(searchCatalog('', 'Beams').every((c) => c.category === 'Beams'));
});

test('download file names are sanitised', () => {
	assert.equal(fileNameFor('Beam Frame 5 x 7', 'stl'), 'Beam-Frame-5-x-7.stl');
	assert.equal(fileNameFor('../../etc/passwd', 'stl'), 'etcpasswd.stl');
	assert.equal(fileNameFor('', 'stl'), 'part.stl');
});

test('frame 5x7 has the right number of cells', () => {
	assert.equal(catalog.find((c) => c.id === 'frame-5x7').blocks.length, 2 * 5 + 2 * 7 - 4);
});

// ---- axes: X, Y flat and Z up for users, Y up internally

test('user cells: X same, Y is depth away from the viewer, Z is up', () => {
	assert.deepEqual(toUserCell([2, 5, 0]), [2, 0, 5]);      // 5 cells up internally = Z 5
	assert.deepEqual(toUserCell([0, 0, -3]), [0, 3, 0]);     // 3 cells away = Y 3
	assert.ok(!Object.is(toUserCell([0, 0, 0])[1], -0), 'never shows -0');
	assert.deepEqual(toUserSize([23.6, 7.6, 39.6]), [23.6, 39.6, 7.6]);
});

test('axis letters map both ways and round trip', () => {
	assert.deepEqual(AXIS_TO_USER, { x: 'X', z: 'Y', y: 'Z' });
	for (const internal of ['x', 'y', 'z']) {
		const user = AXIS_TO_USER[internal].toLowerCase();
		assert.equal(AXIS_FROM_USER[user], internal);
	}
	assert.equal(AXIS_FROM_USER.z, 'y', 'typing z selects the vertical (internal y) axis');
});

test('catalog presets lie on positive user Y and the old plates still sit on Z = 0', () => {
	for (const c of catalog) {
		for (const b of c.blocks) {
			const [X, Y, Z] = toUserCell(b.pos);
			assert.ok(Y >= 0, `${c.id} has Y ${Y}`);
			assert.ok(X >= 0 && Z >= 0, c.id);
		}
	}
});

function signedVolume(positions, indices) {
	let v = 0;
	for (let t = 0; t < indices.length; t += 3) {
		const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
		const [ax, ay, az] = [positions[a], positions[a + 1], positions[a + 2]];
		const [bx, by, bz] = [positions[b], positions[b + 1], positions[b + 2]];
		const [cx, cy, cz] = [positions[c], positions[c + 1], positions[c + 2]];
		v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
	}
	return v;
}

// a unit tetrahedron with outward facing triangles, offset so the lowest point is not at the origin
const TET = {
	positions: new Float32Array([1, 2, 3, 2, 2, 3, 1, 3, 3, 1, 2, 4]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};

test('Z-up export is a proper rotation: volume and winding are preserved, nothing is mirrored', () => {
	const before = signedVolume(TET.positions, TET.indices);
	const after = signedVolume(toZUp(TET.positions), TET.indices);
	assert.ok(before > 0);
	assert.ok(Math.abs(before - after) < 1e-6, `${before} vs ${after}`);
});

test('Z-up export: up stays up, depth becomes Y, and the part rests on Z = 0', () => {
	// one point 10 mm above (internal y) and 5 mm further away (internal -z) than the other
	const out = toZUp(new Float32Array([0, 0, 0, 0, 10, -5]));
	assert.deepEqual([...out.slice(0, 3)], [0, 0, 0]);       // lowest point is the origin
	assert.deepEqual([...out.slice(3, 6)], [0, 5, 10]);      // 5 away -> +Y, 10 up -> +Z
	const lifted = toZUp(new Float32Array([0, 7, 0, 0, 9, 0]));
	assert.equal(Math.min(lifted[2], lifted[5]), 0, 'dropped onto the bed');
});

test('STL is written Z-up by default and can be written as stored', () => {
	const view = (buf) => new DataView(buf);
	const zUp = view(toBinaryStl({ ...TET, triangleCount: 4 }, 't'));
	const raw = view(toBinaryStl({ ...TET, triangleCount: 4 }, 't', { zUp: false }));
	// first vertex of the first triangle: record starts at 84, 12 bytes of normal, then x y z
	const vz = [0, 1, 2].map((k) => zUp.getFloat32(84 + 12 + k * 4, true));
	const vr = [0, 1, 2].map((k) => raw.getFloat32(84 + 12 + k * 4, true));
	assert.deepEqual(vr, [1, 2, 3]);
	assert.deepEqual(vz, [1, -3, 0], 'x kept, Y = -z, Z = y minus the lowest y');
});

// ---- measurements belong to individual bricks

test('every editable measurement belongs to at least one brick type, and none is global', () => {
	for (const m of MEASUREMENTS) assert.ok(m.types.length > 0, m.key);
	assert.ok(!MEASUREMENTS.some((m) => m.key === 'gridUnit' || m.key === 'subdivisionsPerQuarter'), 'grid settings are not per brick');
	assert.deepEqual(measurementsForType('pinHole').map((m) => m.key), ['edgeMargin', 'cornerRadius', 'pinHoleDiameter', 'counterboreDiameter', 'counterboreDepth']);
	assert.deepEqual(measurementsForType('pin').map((m) => m.key), ['pinDiameter']);
	assert.ok(measurementsForType('ballJoint').every((m) => ['ballDiameter', 'ballBaseDiameter'].includes(m.key)));
});

test('cleanBlockMeasurements keeps only valid keys that apply to the type', () => {
	assert.deepEqual(cleanBlockMeasurements('pinHole', { pinHoleDiameter: 5.2, axleSpan: 4.8, gridUnit: 9, edgeMargin: 99, bogus: 1 }), { pinHoleDiameter: 5.2 });
	assert.equal(cleanBlockMeasurements('solid', { pinHoleDiameter: 5.2 }), undefined);
	assert.ok(relevantKeys('axle').has('axleArmWidth') && !relevantKeys('axle').has('pinDiameter'));
});

test('setBlockMeasurements changes one brick only, and "same as default" removes the override', () => {
	let p = { ...emptyPart(), blocks: [blk([0, 0, 0]), blk([1, 0, 0])] };
	p = setBlockMeasurements(p, [0, 0, 0], { pinHoleDiameter: 5.3, counterboreDepth: 0.8 }); // 0.8 is the default
	assert.deepEqual(blockAt(p, [0, 0, 0]).measurements, { pinHoleDiameter: 5.3 });
	assert.equal(blockAt(p, [1, 0, 0]).measurements, undefined);
	assert.equal(blockAt(p, [5, 5, 5]) , null);
	assert.equal(setBlockMeasurements(p, [5, 5, 5], { pinHoleDiameter: 5.3 }), p, 'no brick there: nothing changes');
	const reset = setBlockMeasurements(p, [0, 0, 0], {});
	assert.ok(!('measurements' in blockAt(reset, [0, 0, 0])));
});

test('setTypeMeasurements applies to every brick of that type and nothing else', () => {
	const p = { ...emptyPart(), blocks: [blk([0, 0, 0]), blk([1, 0, 0]), blk([2, 0, 0], { type: 'axleHole' })] };
	const q = setTypeMeasurements(p, 'pinHole', { pinHoleDiameter: 5.1 });
	assert.deepEqual(q.blocks.map((b) => b.measurements?.pinHoleDiameter), [5.1, 5.1, undefined]);
});

test('block measurement overrides count as a change, and survive parse, mirror and normalize', () => {
	const a = blk([0, 0, 0]);
	assert.ok(!sameBlock(a, { ...a, measurements: { edgeMargin: 0.4 } }));
	assert.ok(sameBlock({ ...a, measurements: { edgeMargin: 0.4 } }, { ...a, measurements: { edgeMargin: 0.4 } }));
	const p = { ...emptyPart(), blocks: [{ ...a, measurements: { pinHoleDiameter: 5.2 } }, blk([2, 0, 0])] };
	assert.deepEqual(parsePart(p).blocks[0].measurements, { pinHoleDiameter: 5.2 });
	assert.deepEqual(mirrorX(p).blocks[0].measurements, { pinHoleDiameter: 5.2 });
	assert.deepEqual(normalizeOrigin(p).blocks[0].measurements, { pinHoleDiameter: 5.2 });
	// junk is dropped rather than rejected
	const junk = parsePart({ ...emptyPart(), blocks: [{ ...a, measurements: { pinHoleDiameter: 'x', bogus: 1, axleSpan: 4.8 } }] });
	assert.equal(junk.blocks[0].measurements, undefined);
});

test('measurementsForBlock layers defaults, legacy whole-part values and the brick\'s own', () => {
	const part = { ...emptyPart(), measurements: { pinHoleDiameter: 5.0, edgeMargin: 0.3 } };
	const b = { ...blk([0, 0, 0]), measurements: { pinHoleDiameter: 5.4 } };
	const m = measurementsForBlock(part, b);
	assert.equal(m.pinHoleDiameter, 5.4);   // brick wins
	assert.equal(m.edgeMargin, 0.3);        // older whole-part value still applies
	assert.equal(m.counterboreDepth, DEFAULT_MEASUREMENTS.counterboreDepth);
});

test('codec round trips per-brick measurements, and old links without them still load', () => {
	const part = { ...emptyPart('m'), blocks: [
		{ ...blk([0, 0, 0]), measurements: { pinHoleDiameter: 5.2, edgeMargin: 0.35 } },
		blk([1, 0, 0], { type: 'axleHole', measurements: { axleHoleSpan: 5 } }),
		blk([2, 0, 0]),
	] };
	const text = encodePart(part);
	assert.match(text, /\(pinHoleDiameter=5\.2;edgeMargin=0\.35\)/);
	assert.deepEqual(decodePart(text).blocks, parsePart(part).blocks);
	assert.equal(decodePart('v1~old~0.0.0.pxfr_1.0.0.axf~').blocks.length, 2);
	// a measurement that does not belong to the type is ignored on decode
	assert.equal(decodePart('v1~x~0.0.0.pxfr(axleSpan=4.8)~').blocks[0].measurements, undefined);
	assert.throws(() => decodePart('v1~x~0.0.0.pxfr(a<b)~'));
});

// ---- placing a preset

test('footprintCenter picks the middle cell of the footprint', () => {
	const frame = catalog.find((c) => c.id === 'frame-5x7');
	const [cx, cz] = footprintCenter(frame.blocks);
	assert.equal(cx, 2);       // x runs 0..4
	assert.equal(cz, -3);      // z runs 0..-6
	assert.deepEqual(footprintCenter([]), [0, 0]);
});

test('insertPreset moves the preset to its origin and replaces bricks in the way', () => {
	const beam = catalog.find((c) => c.id === 'beam-3');
	const base = { ...emptyPart(), blocks: [blk([5, 2, 0], { type: 'solid' })] };
	const r = insertPreset(base, beam.blocks, [5, 2, 0]);
	assert.equal(r.placed, 3);
	assert.equal(r.part.blocks.length, 3, 'one of the three cells replaced the existing solid brick');
	assert.equal(blockAt(r.part, [5, 2, 0]).type, 'pinHole');
	assert.equal(base.blocks.length, 1, 'the original part is not mutated');
});

test('insertPreset refuses to exceed the block limit or leave the allowed range', () => {
	const beam = catalog.find((c) => c.id === 'beam-3');
	const full = { ...emptyPart(), blocks: [blk([0, 0, 0]), blk([0, 1, 0])] };
	const r = insertPreset(full, beam.blocks, [10, 0, 0], 3);
	assert.equal(r.placed, 0);
	assert.equal(r.reason, 'limit');
	assert.equal(r.part, full);
	assert.equal(insertPreset(full, beam.blocks, [100000, 0, 0]).reason, 'bounds');
});
