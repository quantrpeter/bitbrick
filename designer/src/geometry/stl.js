// STL writers. Coordinates are already in millimetres.
// By default the part is rotated into the Z-up frame that slicers use (see model/axes.js), resting on Z = 0.
import { toZUp } from '../model/axes.js';

/**
 * STL for a part. One connected body gives a compact binary STL; several separate bodies give an ASCII STL with
 * one `solid` per body, since binary STL can only hold a single solid. Returns { data, bodies }.
 */
export function toStl(mesh, name = 'BitBrick part', opts = {}) {
	const bodies = splitBodies(mesh.indices, mesh.positions);
	if (bodies.length <= 1) return { data: toBinaryStl(mesh, name, opts), bodies: bodies.length };
	return { data: toAsciiStl(mesh, name, bodies, opts), bodies: bodies.length };
}

/** Writes each body (an array of triangle indices) as its own named solid. */
export function toAsciiStl(mesh, name, bodies, { zUp = true } = {}) {
	const { indices } = mesh;
	const positions = zUp ? toZUp(mesh.positions) : mesh.positions;
	const base = `${name}`.replace(/[\r\n]+/g, ' ').trim() || 'part';
	const f = (n) => (Object.is(n, -0) ? 0 : n).toExponential(6);
	const out = [];
	bodies.forEach((tris, b) => {
		const solid = `${base} ${b + 1}`;
		out.push(`solid ${solid}`);
		for (const t of tris) {
			const a = indices[t * 3] * 3, bb = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
			const [nx, ny, nz] = normalOf(positions, a, bb, c);
			out.push(`  facet normal ${f(nx)} ${f(ny)} ${f(nz)}`, '    outer loop');
			for (const p of [a, bb, c]) out.push(`      vertex ${f(positions[p])} ${f(positions[p + 1])} ${f(positions[p + 2])}`);
			out.push('    endloop', '  endfacet');
		}
		out.push(`endsolid ${solid}`);
	});
	return `${out.join('\n')}\n`;
}

/**
 * Groups triangles into separate bodies: triangles that share a vertex belong together. A closed inner shell (a
 * sealed cavity, negative volume) stays with the body around it rather than becoming a body of its own.
 * Returns arrays of triangle indices, largest body first.
 */
export function splitBodies(indices, positions) {
	const vertCount = positions.length / 3;
	const parent = new Uint32Array(vertCount);
	for (let i = 0; i < vertCount; i++) parent[i] = i;
	const find = (x) => {
		while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
		return x;
	};
	const tris = indices.length / 3;
	for (let t = 0; t < tris; t++) {
		const r = find(indices[t * 3]);
		for (let k = 1; k < 3; k++) {
			const s = find(indices[t * 3 + k]);
			if (s !== r) parent[s] = r;
		}
	}
	const byRoot = new Map();
	for (let t = 0; t < tris; t++) {
		const r = find(indices[t * 3]);
		let g = byRoot.get(r);
		if (!g) byRoot.set(r, (g = { tris: [], vol: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
		g.tris.push(t);
		const [a, b, c] = [indices[t * 3] * 3, indices[t * 3 + 1] * 3, indices[t * 3 + 2] * 3];
		g.vol += (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
			- positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
			+ positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) / 6;
		for (const p of [a, b, c]) {
			for (let k = 0; k < 3; k++) {
				if (positions[p + k] < g.min[k]) g.min[k] = positions[p + k];
				if (positions[p + k] > g.max[k]) g.max[k] = positions[p + k];
			}
		}
	}
	const groups = [...byRoot.values()];
	const solids = groups.filter((g) => g.vol >= 0).sort((x, y) => y.vol - x.vol);
	if (!solids.length) return groups.map((g) => g.tris);
	const inside = (g, h) => [0, 1, 2].every((k) => h.min[k] <= g.min[k] && g.max[k] <= h.max[k]);
	for (const cavity of groups.filter((g) => g.vol < 0)) {
		// the smallest solid that encloses the cavity, else the largest
		const host = [...solids].reverse().find((h) => inside(cavity, h)) || solids[0];
		for (const t of cavity.tris) host.tris.push(t);
	}
	return solids.map((g) => g.tris);
}

function normalOf(positions, a, b, c) {
	const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
	const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
	const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
	const len = Math.hypot(nx, ny, nz) || 1;
	return [nx / len, ny / len, nz / len];
}

export function toBinaryStl(mesh, name = 'BitBrick part', { zUp = true } = {}) {
	const { indices } = mesh;
	const positions = zUp ? toZUp(mesh.positions) : mesh.positions;
	const tris = indices.length / 3;
	const buffer = new ArrayBuffer(84 + tris * 50);
	const view = new DataView(buffer);

	const header = `${name}`.slice(0, 80);
	for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
	view.setUint32(80, tris, true);

	let o = 84;
	for (let t = 0; t < tris; t++) {
		const a = indices[t * 3] * 3;
		const b = indices[t * 3 + 1] * 3;
		const c = indices[t * 3 + 2] * 3;
		for (const n of normalOf(positions, a, b, c)) { view.setFloat32(o, n, true); o += 4; }
		for (const p of [a, b, c]) {
			for (let k = 0; k < 3; k++) { view.setFloat32(o, positions[p + k], true); o += 4; }
		}
		view.setUint16(o, 0, true);
		o += 2;
	}
	return buffer;
}

/** Safe file name for a download. */
export function fileNameFor(name, ext) {
	const base = String(name || 'part').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'part';
	return `${base}.${ext}`;
}
