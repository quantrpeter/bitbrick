import test from 'node:test';
import assert from 'node:assert/strict';
import { orientBlocks, primaryAxis, orientationMatrix } from '../src/model/orient.js';
import { catalog } from '../src/model/catalog.js';
import { AXIS_FROM_USER } from '../src/model/axes.js';

const preset = (id) => catalog.find((i) => i.id === id).blocks;
// Where the user's +X / +Y / +Z point in the stored frame.
const USER_DIR = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] };
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const keyOf = (b) => b.pos.join(',');

test('the primary axis is the most common block axis', () => {
	assert.equal(primaryAxis(preset('beam-5')), 'y');
	assert.equal(primaryAxis(preset('pin')), 'x');
	assert.equal(primaryAxis(preset('ball-joint')), 'x');
});

test('every orientation is a proper rotation', () => {
	for (const primary of ['x', 'y', 'z']) for (const key of ['x', 'y', 'z']) for (const rev of [false, true]) {
		assert.equal(det(orientationMatrix(primary, key, rev)), 1, `${primary} -> ${key}${rev ? ' reversed' : ''}`);
	}
});

test('every preset keeps its bricks when turned: same count, no overlaps, lowest cell at 0', () => {
	for (const item of catalog) for (const key of ['x', 'y', 'z']) for (const rev of [false, true]) {
		const out = orientBlocks(item.blocks, key, rev);
		assert.equal(out.length, item.blocks.length, item.id);
		assert.equal(new Set(out.map(keyOf)).size, out.length, `${item.id} ${key}${rev}: overlapping cells`);
		for (let i = 0; i < 3; i++) assert.equal(Math.min(...out.map((b) => b.pos[i])), 0, `${item.id} axis ${i}`);
		assert.ok(out.every((b) => Number.isInteger(b.pos[0]) && Number.isInteger(b.pos[1]) && Number.isInteger(b.pos[2])), item.id);
	}
});

test('no key press leaves the preset as stored', () => {
	const blocks = preset('ball-joint');
	assert.equal(orientBlocks(blocks, null), blocks);
});

test('x / y / z point the hole axis along the chosen axis', () => {
	for (const id of ['pin', 'beam-5', 'axle-3', 'frame-3x5']) {
		for (const key of ['x', 'y', 'z']) {
			const out = orientBlocks(preset(id), key);
			assert.ok(out.every((b) => b.axis === AXIS_FROM_USER[key]), `${id} ${key}: ${out.map((b) => b.axis).join('')}`);
		}
	}
});

test('a ball joint extends along the chosen direction, and the same key again reverses it', () => {
	const blocks = preset('ball-joint'); // [solid, ballJoint]: the joint sits beyond the solid block
	const direction = (out) => {
		const solid = out.find((b) => b.type === 'solid');
		const joint = out.find((b) => b.type === 'ballJoint');
		return joint.pos.map((n, i) => n - solid.pos[i]);
	};
	for (const key of ['x', 'y', 'z']) {
		assert.deepEqual(direction(orientBlocks(blocks, key, false)), USER_DIR[key], `${key}`);
		assert.deepEqual(direction(orientBlocks(blocks, key, true)), USER_DIR[key].map((n) => (-n) || 0), `${key} reversed`);
	}
});

test('turning a flat beam about Z keeps it flat; pointing it along Z stands it up', () => {
	const out = orientBlocks(preset('beam-5'), 'x');
	assert.ok(out.every((b) => b.axis === 'x'));
	const standing = orientBlocks(preset('beam-5'), 'z'); // holes up: the stored form
	assert.deepEqual(standing, preset('beam-5'));
});
