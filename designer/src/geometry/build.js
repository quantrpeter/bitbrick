// Turns a Part into one watertight triangle mesh using manifold-3d.
// Pure function of (wasm module, part): no DOM, runs in the worker and in Node tests.
import { blockIndex, keyOf, AXIS_INDEX } from '../model/part.js';
import { resolveMeasurements, measurementsForBlock } from '../model/defaults.js';

const EPS = 0.02; // cutters poke this far out of open faces so no zero-thickness skins remain

// For a block whose hole axis is A, the local frame has z along A and (u, v) in the cross-section.
// rot is the rotation (degrees) that takes local z onto the world axis; u/v are the world
// directions the local x/y axes end up pointing to.
const FRAMES = {
	z: { rot: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], a: [0, 0, 1] },
	x: { rot: [0, 90, 0], u: [0, 0, -1], v: [0, 1, 0], a: [1, 0, 0] },
	y: { rot: [-90, 0, 0], u: [1, 0, 0], v: [0, 0, -1], a: [0, 1, 0] },
};

const BODY_TYPES = new Set(['pinHole', 'axleHole', 'solid']);

const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];

export function buildMesh(wasm, part) {
	const { Manifold, CrossSection } = wasm;
	const m = resolveMeasurements(part.measurements);
	const U = m.gridUnit;
	const segments = Math.max(8, Math.round(m.subdivisionsPerQuarter) * 4);
	const index = blockIndex(part.blocks);
	const owned = new Set();
	const own = (o) => { owned.add(o); return o; };

	try {
		if (!part.blocks.length) return emptyResult();

		const neighbour = (block, dir) => index.get(keyOf(add(block.pos, dir))) || null;

		// Does the block reach the cell boundary on this side of `axisName`?
		const reaches = (block, axisName, side) => !(side > 0 && block.size === 'half' && block.axis === axisName);

		const placeLocal = (block, localShape) => {
			const f = FRAMES[block.axis];
			own(localShape);
			const s = own(localShape.rotate(f.rot));
			const t = block.pos.map((p) => p * U);
			// local shape has its xy centred on the hole axis and z starting at the cell's minimum face
			for (let i = 0; i < 3; i++) if (i !== AXIS_INDEX[block.axis]) t[i] += U / 2;
			return own(s.translate(t));
		};

		const lengthOf = (block) => (block.size === 'half' ? U / 2 : U);

		const rectSection = (u0, u1, v0, v1) =>
			own(own(CrossSection.square([u1 - u0, v1 - v0])).translate([u0, v0]));

		const extrude = (section, z0, z1) =>
			own(own(Manifold.extrude(section, z1 - z0, 0, 0, [1, 1])).translate([0, 0, z0]));

		const cylinder = (d, z0, z1) => own(own(Manifold.cylinder(z1 - z0, d / 2, d / 2, segments)).translate([0, 0, z0]));

		const crossShape = (span, arm, z0, z1) => {
			const a = rectSection(-span / 2, span / 2, -arm / 2, arm / 2);
			const b = rectSection(-arm / 2, arm / 2, -span / 2, span / 2);
			return extrude(own(a.add(b)), z0, z1);
		};

		const bodies = [];
		const cutters = [];
		const attachments = [];

		for (const block of part.blocks) {
			const f = FRAMES[block.axis];
			const mb = measurementsForBlock(part, block); // this brick's own measurements
			const len = lengthOf(block);

			if (BODY_TYPES.has(block.type)) {
				const hasNb = (dir) => neighbour(block, dir) !== null;

				const inset = (dir) => (hasNb(dir) ? 0 : mb.edgeMargin);
				const u0 = -U / 2 + inset(add([0, 0, 0], f.u, -1));
				const u1 = U / 2 - inset(f.u);
				const v0 = -U / 2 + inset(add([0, 0, 0], f.v, -1));
				const v1 = U / 2 - inset(f.v);

				// Along the hole axis: a neighbour only counts when its face actually meets ours.
				const axisName = block.axis;
				const lo = neighbour(block, add([0, 0, 0], f.a, -1));
				const hi = neighbour(block, f.a);
				const loTouch = !!lo && reaches(lo, axisName, 1);
				const hiTouch = !!hi && reaches(block, axisName, 1);
				const z0 = loTouch ? 0 : mb.edgeMargin;
				const z1 = len - (hiTouch ? 0 : mb.edgeMargin);

				let section = rectSection(u0, u1, v0, v1);
				if (block.rounded) {
					const r = Math.min(mb.cornerRadius, (u1 - u0) / 2, (v1 - v0) / 2);
					for (const su of [-1, 1]) {
						for (const sv of [-1, 1]) {
							const du = su > 0 ? f.u : add([0, 0, 0], f.u, -1);
							const dv = sv > 0 ? f.v : add([0, 0, 0], f.v, -1);
							if (hasNb(du) || hasNb(dv) || hasNb(add(du, dv))) continue;
							const cu = su > 0 ? u1 : u0;
							const cv = sv > 0 ? v1 : v0;
							const corner = own(own(CrossSection.square([r, r]))
								.translate([Math.min(cu, cu - su * r), Math.min(cv, cv - sv * r)]));
							const disc = own(own(CrossSection.circle(r, segments)).translate([cu - su * r, cv - sv * r]));
							section = own(section.subtract(own(corner.subtract(disc))));
						}
					}
				}
				bodies.push(placeLocal(block, extrude(section, z0, z1)));

				if (block.type === 'pinHole') {
					const open0 = !loTouch;
					const open1 = !hiTouch;
					const a = open0 ? z0 - EPS : z0;
					const b = open1 ? z1 + EPS : z1;
					let cutter = cylinder(mb.pinHoleDiameter, a, b);
					if (mb.counterboreDepth > 0 && mb.counterboreDiameter > mb.pinHoleDiameter) {
						// Counterbore at both faces of every pin hole.
						const cbD = mb.counterboreDiameter;
						cutter = own(cutter.add(cylinder(cbD, z0 - EPS, z0 + mb.counterboreDepth)));
						cutter = own(cutter.add(cylinder(cbD, z1 - mb.counterboreDepth, z1 + EPS)));
					}
					cutters.push(placeLocal(block, cutter));
				} else if (block.type === 'axleHole') {
					const a = loTouch ? z0 : z0 - EPS;
					const b = hiTouch ? z1 : z1 + EPS;
					cutters.push(placeLocal(block, crossShape(mb.axleHoleSpan, mb.axleHoleSize, a, b)));
				}
			} else if (block.type === 'pin') {
				attachments.push(placeLocal(block, cylinder(mb.pinDiameter, 0, len)));
			} else if (block.type === 'axle') {
				attachments.push(placeLocal(block, crossShape(mb.axleSpan, mb.axleArmWidth, 0, len)));
			} else if (block.type === 'ballJoint') {
				const d = Math.min(mb.ballDiameter, len);
				const centre = len - d / 2;
				const neck = cylinder(mb.ballBaseDiameter, 0, Math.max(centre, 0.1));
				const ball = own(own(Manifold.sphere(d / 2, segments)).translate([0, 0, centre]));
				attachments.push(placeLocal(block, own(neck.add(ball))));
			}
		}

		let solid = bodies.length ? own(Manifold.union(bodies)) : null;
		if (solid && cutters.length) solid = own(solid.subtract(own(Manifold.union(cutters))));
		if (attachments.length) {
			const att = own(Manifold.union(attachments));
			solid = solid ? own(solid.add(att)) : att;
		}

		const status = solid.status();
		const mesh = solid.getMesh();
		const stride = mesh.numProp;
		const vertCount = mesh.vertProperties.length / stride;
		const positions = new Float32Array(vertCount * 3);
		for (let i = 0; i < vertCount; i++) {
			positions[i * 3] = mesh.vertProperties[i * stride];
			positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1];
			positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2];
		}
		const bb = solid.boundingBox();
		return {
			positions,
			indices: Uint32Array.from(mesh.triVerts),
			triangleCount: mesh.triVerts.length / 3,
			volume: solid.volume(),
			surfaceArea: solid.surfaceArea(),
			manifold: status === 'NoError',
			status,
			bbox: { min: [...bb.min], max: [...bb.max] },
		};
	} finally {
		for (const o of [...owned].reverse()) {
			try { o.delete(); } catch { /* already freed */ }
		}
	}
}

export function emptyResult() {
	return {
		positions: new Float32Array(0), indices: new Uint32Array(0), triangleCount: 0,
		volume: 0, surfaceArea: 0, manifold: true, status: 'NoError', bbox: null,
	};
}
