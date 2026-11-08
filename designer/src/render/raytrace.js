// GPU path tracing for the "Realistic" display style (three-gpu-pathtracer, WebGL2).
//
// The tracer gets its own small scene (the part, a ground plane and a studio light environment) so the
// editing helpers (cursor, bounds) are never traced; the viewport draws those on top afterwards.
// While the camera moves, or before enough samples exist, the library shows a fast raster preview of the
// same scene and fades the traced image in as it converges.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';
import hdrUrl from '../assets/studio-sunrise-2k.hdr.jpg';

export const QUALITY = {
	draft: { samples: 64, label: 'Draft (64 samples)' },
	good: { samples: 256, label: 'Good (256 samples)' },
	best: { samples: 1024, label: 'Best (1024 samples)' },
};

const GROUND = 0xcfd5de;
const CREASE_ANGLE = (35 * Math.PI) / 180;

/**
 * The HDR backdrop: an Ultra HDR JPEG (an ordinary JPEG plus a gain map that restores the full brightness range), the
 * same kind of image as three.js's webgl_loader_texture_ultrahdr example. It is both what you see behind the part and
 * the light the part is lit by, so reflections and shadows match the picture. Resolves to null if it cannot be loaded,
 * and the tracer then falls back to plain studio lighting.
 */
function loadHdrTexture() {
	return new Promise((resolve) => {
		new UltraHDRLoader().load(hdrUrl, (texture) => {
			texture.mapping = THREE.EquirectangularReflectionMapping;
			resolve(texture);
		}, undefined, (e) => {
			// eslint-disable-next-line no-console
			console.warn('HDR background could not be loaded, using studio lighting:', e && e.message ? e.message : e);
			resolve(null);
		});
	});
}

let libPromise = null;
/** The library and the HDR image are large, so they are only downloaded the first time someone picks the Realistic style. */
export function loadRayTracer() {
	libPromise ||= Promise.all([import(/* webpackChunkName: "raytracer" */ 'three-gpu-pathtracer'), loadHdrTexture()])
		.then(([lib, hdr]) => ({ lib, hdr }));
	return libPromise;
}

/** The tracer needs WebGL2 and float render targets. */
export function rayTracingSupported(renderer) {
	const gl = renderer.getContext();
	const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
	return webgl2 && !!renderer.extensions.get('EXT_color_buffer_float');
}

/** Soft studio lighting as an equirect HDR: a pale dome, a large warm key softbox, a cool fill and a rim light. */
function makeStudioEnvironment(lib) {
	const tex = new lib.ProceduralEquirectTexture(256, 128);
	const dir = new THREE.Vector3();
	const key = new THREE.Vector3(-0.55, 0.85, 0.55).normalize();
	const fill = new THREE.Vector3(0.9, 0.35, 0.25).normalize();
	const rim = new THREE.Vector3(0.1, 0.45, -1).normalize();
	tex.generationCallback = (polar, uv, coord, target) => {
		dir.setFromSpherical(polar);
		const dome = 0.22 + 0.4 * (dir.y * 0.5 + 0.5);
		let r = dome * 0.95;
		let g = dome * 0.97;
		let b = dome;
		const k = Math.pow(Math.max(0, dir.dot(key)), 28) * 9;
		r += k; g += k * 0.95; b += k * 0.88;
		const f = Math.pow(Math.max(0, dir.dot(fill)), 14) * 1.6;
		r += f * 0.85; g += f * 0.92; b += f;
		const m = Math.pow(Math.max(0, dir.dot(rim)), 22) * 3;
		target.setRGB(r + m, g + m, b + m);
	};
	tex.update();
	return tex;
}

export class RayTracer {
	constructor(renderer, camera, { lib, hdr }) {
		this.renderer = renderer;
		this.camera = camera;
		this.maxSamples = QUALITY.good.samples;
		this.hasPart = false;

		this.scene = new THREE.Scene();
		this.hdr = hdr || null;
		this.customBackground = null; // a colour string replaces the HDR picture (and tints the floor to match)
		this.defaultBackground = this.hdr || new THREE.Color(0xbfc6d1);
		this.scene.background = this.defaultBackground;
		this.env = this.hdr || makeStudioEnvironment(lib); // lit by the picture itself when there is one
		this.scene.environment = this.env;
		this.scene.environmentIntensity = 1;

		this.material = new THREE.MeshPhysicalMaterial({
			color: 0xaab7cc, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.14,
		});
		this.mesh = null;
		// A round floor, sized to the part (see applyGround), so the HDR picture shows around it and not only overhead.
		this.groundRadius = 60;
		this.ground = new THREE.Mesh(
			new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2),
			new THREE.MeshStandardMaterial({ color: GROUND, roughness: 0.95, metalness: 0 }),
		);
		this.scene.add(this.ground);

		this.pt = new lib.WebGLPathTracer(renderer);
		this.pt.bounces = 5;
		this.pt.filterGlossyFactor = 0.4; // fewer fireflies
		this.pt.tiles.set(2, 2); // render a quarter of the frame per call so the page stays responsive
		this.pt.renderDelay = 150; // ms of stillness before tracing starts (raster preview until then)
		this.pt.minSamples = 3;
		this.pt.fadeDuration = 300;
	}

	setQuality(key) {
		this.maxSamples = (QUALITY[key] || QUALITY.good).samples;
		if (this.pt.samples < this.maxSamples) this.pt.pausePathTracing = false;
	}

	/** Replace the traced part. `meshData` is the worker result (positions, indices, bbox). */
	setPart(meshData, color) {
		if (this.mesh) {
			this.scene.remove(this.mesh);
			this.mesh.geometry.dispose();
			this.mesh = null;
		}
		this.hasPart = !!(meshData && meshData.triangleCount);
		if (!this.hasPart) return;

		const indexed = new THREE.BufferGeometry();
		indexed.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
		indexed.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
		const geometry = toCreasedNormals(indexed, CREASE_ANGLE);
		indexed.dispose();

		this.material.color.set(color);
		this.mesh = new THREE.Mesh(geometry, this.material);
		this.scene.add(this.mesh);
		const bb = meshData.bbox;
		const size = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
		this.groundRadius = Math.max(size * 2.2, 40);
		this.ground.position.set((bb.min[0] + bb.max[0]) / 2, bb.min[1] - 0.02, (bb.min[2] + bb.max[2]) / 2);
		this.applyGround();

		this.pt.setScene(this.scene, this.camera);
		this.pt.pausePathTracing = false;
	}

	/** The floor is a round platform around the part, or practically endless when a flat background colour is chosen. */
	applyGround() {
		const r = this.customBackground ? 4000 : this.groundRadius;
		this.ground.scale.set(r, r, r);
	}

	/** `null` shows the HDR picture; a colour string shows a flat backdrop of that colour instead. */
	setBackground(color) {
		this.customBackground = color || null;
		this.scene.background = color ? new THREE.Color(color) : this.defaultBackground;
		this.ground.material.color.set(color || GROUND);
		this.applyGround();
		if (!this.hasPart) return;
		this.pt.setScene(this.scene, this.camera); // the floor changed size as well as the background
		this.pt.pausePathTracing = false;
	}

	setColor(color) {
		this.material.color.set(color);
		if (!this.hasPart) return;
		this.pt.updateMaterials();
		this.pt.pausePathTracing = false;
	}

	cameraChanged() {
		if (!this.hasPart) return;
		this.pt.updateCamera();
		this.pt.pausePathTracing = false;
	}

	reset() {
		if (!this.hasPart) return;
		this.pt.reset();
		this.pt.pausePathTracing = false;
	}

	get samples() { return Math.floor(this.pt.samples); }

	/** True while more samples are still being added (the viewport keeps rendering frames). */
	get active() { return this.hasPart && !this.pt.pausePathTracing; }

	get done() { return this.hasPart && this.pt.pausePathTracing; }

	/** Draw one frame (raster preview, traced image, or the finished image again) into the canvas. */
	renderFrame() {
		this.pt.renderSample();
		if (this.pt.samples >= this.maxSamples) this.pt.pausePathTracing = true;
	}

	dispose() {
		if (this.mesh) this.mesh.geometry.dispose();
		this.ground.geometry.dispose();
		this.ground.material.dispose();
		this.material.dispose();
		this.env.dispose(); // the HDR texture when there is one (it is also the background)
		this.pt.dispose();
	}
}
