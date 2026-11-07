// Real 3D thumbnails for the catalog: each preset is built by the same geometry code as the viewport and
// rendered once from a three-quarter view into a small transparent PNG (cached for the session).
//
// Presets are built one after another on a dedicated mesh worker, and one offscreen WebGL renderer is shared
// and released again when the queue is empty. If anything fails (no WebGL, worker error) the promise
// rejects and the catalog keeps its simple flat sketch.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createMeshClient } from '../geometry/client.js';

const WIDTH = 288;
const HEIGHT = 192;
const COLOR = 0x8da2cc;
const EDGE = 0x24365c;
const CREASE_ANGLE = (35 * Math.PI) / 180;
// Looking from the front-right and above, in the stored (Y up) frame.
const VIEW_DIR = new THREE.Vector3(0.62, 0.78, 0.9).normalize();

const meshClient = createMeshClient();
const cache = new Map(); // item id -> data URL
const failed = new Set();
const waiting = new Map(); // item id -> { item, listeners: Set<fn> }
const queue = [];
let running = false;
let renderer = null;

function getRenderer() {
	if (renderer) return renderer;
	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
	renderer.setPixelRatio(1);
	renderer.setSize(WIDTH, HEIGHT, false);
	renderer.setClearColor(0x000000, 0);
	return renderer;
}

function releaseRenderer() {
	if (!renderer) return;
	renderer.dispose();
	renderer.forceContextLoss();
	renderer = null;
}

/** Render a worker mesh to a PNG data URL. */
function snapshot(mesh) {
	const gl = getRenderer();
	const indexed = new THREE.BufferGeometry();
	indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
	indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
	const geometry = toCreasedNormals(indexed, CREASE_ANGLE);
	indexed.dispose();

	const scene = new THREE.Scene();
	const material = new THREE.MeshStandardMaterial({ color: COLOR, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
	const body = new THREE.Mesh(geometry, material);
	const edgeGeometry = new THREE.EdgesGeometry(geometry, 35);
	const edgeMaterial = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.55 });
	scene.add(body, new THREE.LineSegments(edgeGeometry, edgeMaterial));
	scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96ad, 1.5));
	const key = new THREE.DirectionalLight(0xffffff, 2.1);
	key.position.set(-0.6, 1, 0.8);
	scene.add(key);

	geometry.computeBoundingBox();
	const box = geometry.boundingBox;
	const centre = box.getCenter(new THREE.Vector3());
	const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);

	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 20);
	camera.position.copy(centre).addScaledVector(VIEW_DIR, radius * 6);
	camera.lookAt(centre);
	camera.updateMatrixWorld();

	// Fit the eight corners of the bounding box into the image with a small margin.
	const view = camera.matrixWorldInverse;
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
		const p = new THREE.Vector3(x, y, z).applyMatrix4(view);
		minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
	}
	const aspect = WIDTH / HEIGHT;
	const half = Math.max((maxX - minX) / 2 / aspect, (maxY - minY) / 2) * 1.12;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	camera.left = cx - half * aspect; camera.right = cx + half * aspect;
	camera.top = cy + half; camera.bottom = cy - half;
	camera.updateProjectionMatrix();

	gl.render(scene, camera);
	const url = gl.domElement.toDataURL('image/png');

	geometry.dispose(); edgeGeometry.dispose(); material.dispose(); edgeMaterial.dispose();
	return url;
}

function finish(id, url) {
	const entry = waiting.get(id);
	waiting.delete(id);
	if (url) cache.set(id, url); else failed.add(id);
	entry?.listeners.forEach((fn) => fn(url));
}

async function pump() {
	if (running) return;
	running = true;
	try {
		while (queue.length) {
			const item = queue.shift();
			if (!waiting.has(item.id)) continue; // everyone stopped waiting for it
			try {
				const mesh = await meshClient({ version: 1, name: item.name, blocks: item.blocks });
				finish(item.id, mesh && mesh.triangleCount ? snapshot(mesh) : null);
			} catch {
				finish(item.id, null);
			}
		}
	} finally {
		running = false;
		releaseRenderer();
	}
}

/** The cached thumbnail (a data URL) or null. */
export function cachedThumbnail(id) { return cache.get(id) || null; }

/** True once a preset is known not to have a rendered thumbnail. */
export function thumbnailFailed(id) { return failed.has(id); }

/**
 * Ask for a preset's thumbnail. `onReady(url|null)` is called when it exists (immediately if cached).
 * Returns a function that stops listening.
 */
export function requestThumbnail(item, onReady) {
	const hit = cache.get(item.id);
	if (hit) { onReady(hit); return () => {}; }
	if (failed.has(item.id)) { onReady(null); return () => {}; }
	let entry = waiting.get(item.id);
	if (!entry) {
		entry = { item, listeners: new Set() };
		waiting.set(item.id, entry);
		queue.push(item);
	}
	entry.listeners.add(onReady);
	pump();
	return () => {
		entry.listeners.delete(onReady);
		if (!entry.listeners.size && waiting.get(item.id) === entry) waiting.delete(item.id);
	};
}
