// Part data model. No DOM and no Three.js in here, so it runs in Node tests and in the worker.
import { cleanBlockMeasurements, resolveMeasurements } from './defaults.js';

export const SCHEMA_VERSION = 1;

export const BLOCK_TYPES = ['pinHole', 'axleHole', 'pin', 'axle', 'solid', 'ballJoint', 'gear'];
export const TYPE_LABELS = {
	pinHole: 'Pin Hole', axleHole: 'Axle Hole', pin: 'Pin', axle: 'Axle', solid: 'Solid', ballJoint: 'Ball Joint', gear: 'Gear',
};
export const AXES = ['x', 'y', 'z'];
export const AXIS_INDEX = { x: 0, y: 1, z: 2 };

export const MAX_BLOCKS = 5000;
export const COORD_LIMIT = 1024;

export function emptyPart(name = 'Untitled part') {
	return { version: SCHEMA_VERSION, name, blocks: [], measurements: {} };
}

export const keyOf = (pos) => `${pos[0]},${pos[1]},${pos[2]}`;

const indexCache = new WeakMap();

/** Map of "x,y,z" -> block, cached per blocks array (parts are treated as immutable). */
export function blockIndex(blocks) {
	let idx = indexCache.get(blocks);
	if (!idx) {
		idx = new Map(blocks.map((b) => [keyOf(b.pos), b]));
		indexCache.set(blocks, idx);
	}
	return idx;
}

export function blockAt(part, pos) {
	return blockIndex(part.blocks).get(keyOf(pos)) || null;
}

export function inBounds(pos) {
	return pos.every((n) => Number.isInteger(n) && Math.abs(n) <= COORD_LIMIT);
}

/** Insert or replace the block at block.pos. Returns a new part. */
export function setBlock(part, block) {
	if (!inBounds(block.pos)) return part;
	const k = keyOf(block.pos);
	const existing = blockIndex(part.blocks).get(k);
	if (existing && sameBlock(existing, block)) return part;
	if (!existing && part.blocks.length >= MAX_BLOCKS) return part;
	const blocks = existing
		? part.blocks.map((b) => (keyOf(b.pos) === k ? { ...block, pos: [...block.pos] } : b))
		: [...part.blocks, { ...block, pos: [...block.pos] }];
	return { ...part, blocks };
}

export function removeBlock(part, pos) {
	const k = keyOf(pos);
	if (!blockIndex(part.blocks).has(k)) return part;
	return { ...part, blocks: part.blocks.filter((b) => keyOf(b.pos) !== k) };
}

function sameMeasurements(a, b) {
	const ka = Object.keys(a || {});
	const kb = Object.keys(b || {});
	return ka.length === kb.length && ka.every((k) => a[k] === (b || {})[k]);
}

export function sameBlock(a, b) {
	return a.type === b.type && a.axis === b.axis && a.size === b.size && a.rounded === b.rounded
		&& a.pos[0] === b.pos[0] && a.pos[1] === b.pos[1] && a.pos[2] === b.pos[2]
		&& sameMeasurements(a.measurements, b.measurements);
}

// ---------------------------------------------------------------- per-brick measurements

/**
 * Set the measurement overrides of the brick at `pos` (replacing its previous ones). Values equal to what the part
 * would use anyway are dropped, so "reset" and "same as default" are the same thing and saves stay small.
 */
export function setBlockMeasurements(part, pos, overrides) {
	const block = blockAt(part, pos);
	if (!block) return part;
	const base = resolveMeasurements(part.measurements);
	const clean = cleanBlockMeasurements(block.type, overrides) || {};
	const kept = Object.fromEntries(Object.entries(clean).filter(([k, v]) => v !== base[k]));
	const next = { ...block };
	if (Object.keys(kept).length) next.measurements = kept;
	else delete next.measurements;
	return setBlock(part, next);
}

/** Same overrides for every brick of one type ("apply to all Pin Hole bricks"). */
export function setTypeMeasurements(part, type, overrides) {
	let next = part;
	for (const b of part.blocks) {
		if (b.type === type) next = setBlockMeasurements(next, b.pos, overrides);
	}
	return next;
}

// ---------------------------------------------------------------- placing a preset

/** Cell [x, z] at the middle of a preset's footprint, so it can be centred under the pointer. */
export function footprintCenter(blocks) {
	if (!blocks.length) return [0, 0];
	const xs = blocks.map((b) => b.pos[0]);
	const zs = blocks.map((b) => b.pos[2]);
	return [Math.floor((Math.min(...xs) + Math.max(...xs)) / 2), Math.floor((Math.min(...zs) + Math.max(...zs)) / 2)];
}

/**
 * Add a preset's blocks with its origin at `origin`. Bricks already in those cells are replaced.
 * Returns { part, placed, skipped }; nothing is added when the result would exceed the block limit.
 */
export function insertPreset(part, blocks, origin, maxBlocks = MAX_BLOCKS) {
	const index = blockIndex(part.blocks);
	const moved = blocks.map((b) => ({ ...b, pos: b.pos.map((n, i) => n + origin[i]) }));
	if (moved.some((b) => !inBounds(b.pos))) return { part, placed: 0, skipped: moved.length, reason: 'bounds' };
	const added = moved.filter((b) => !index.has(keyOf(b.pos))).length;
	if (part.blocks.length + added > maxBlocks) return { part, placed: 0, skipped: moved.length, reason: 'limit' };
	let next = part;
	for (const b of moved) next = setBlock(next, b);
	return { part: next, placed: moved.length, skipped: 0 };
}

/** Translate all blocks so the smallest coordinate on each axis is 0. */
export function normalizeOrigin(part) {
	if (!part.blocks.length) return part;
	const min = [0, 1, 2].map((i) => Math.min(...part.blocks.map((b) => b.pos[i])));
	return { ...part, blocks: part.blocks.map((b) => ({ ...b, pos: b.pos.map((n, i) => n - min[i]) })) };
}

export function mirrorX(part) {
	const max = Math.max(...part.blocks.map((b) => b.pos[0]), 0);
	return {
		...part,
		blocks: part.blocks.map((b) => ({ ...b, pos: [max - b.pos[0], b.pos[1], b.pos[2]] })),
	};
}

export function bounds(part) {
	if (!part.blocks.length) return null;
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (const b of part.blocks) {
		for (let i = 0; i < 3; i++) {
			min[i] = Math.min(min[i], b.pos[i]);
			max[i] = Math.max(max[i], b.pos[i]);
		}
	}
	return { min, max };
}

/** Throws on anything that is not a well formed part; returns a cleaned copy. */
export function parsePart(raw) {
	if (!raw || typeof raw !== 'object') throw new Error('Not a part');
	if (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > SCHEMA_VERSION) {
		throw new Error('Unsupported part version');
	}
	if (!Array.isArray(raw.blocks) || raw.blocks.length > MAX_BLOCKS) throw new Error('Bad block list');
	const seen = new Set();
	const blocks = raw.blocks.map((b) => {
		const ok = b && Array.isArray(b.pos) && b.pos.length === 3 && inBounds(b.pos)
			&& BLOCK_TYPES.includes(b.type) && AXES.includes(b.axis)
			&& (b.size === 'full' || b.size === 'half') && typeof b.rounded === 'boolean';
		if (!ok) throw new Error('Bad block');
		const k = keyOf(b.pos);
		if (seen.has(k)) throw new Error('Duplicate block');
		seen.add(k);
		const measurements = cleanBlockMeasurements(b.type, b.measurements);
		return { pos: [...b.pos], type: b.type, axis: b.axis, size: b.size, rounded: b.rounded, ...(measurements ? { measurements } : {}) };
	});
	const measurements = {};
	for (const [k, v] of Object.entries(raw.measurements || {})) {
		if (typeof v === 'number' && Number.isFinite(v)) measurements[k] = v;
	}
	return {
		version: SCHEMA_VERSION,
		name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Untitled part',
		blocks,
		measurements,
	};
}

export const defaultBrush = () => ({ type: 'pinHole', axis: 'x', size: 'full', rounded: true });
