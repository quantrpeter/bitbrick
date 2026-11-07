// Binary STL writer. Coordinates are already in millimetres.
// By default the part is rotated into the Z-up frame that slicers use (see model/axes.js), resting on Z = 0.
import { toZUp } from '../model/axes.js';

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
		const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
		const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
		const len = Math.hypot(nx, ny, nz) || 1;
		nx /= len; ny /= len; nz /= len;
		for (const n of [nx, ny, nz]) { view.setFloat32(o, n, true); o += 4; }
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
