import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getState, setState, setCursor, showToast, useStore, hoverPlacement, confirmPlacement } from '../state/store.js';
import { RayTracer, QUALITY, loadRayTracer, rayTracingSupported } from './raytrace.js';
import { viewportApi } from '../state/actions.js';
import { resolveMeasurements } from '../model/defaults.js';

// One blueprint palette; the canvas is transparent so the stage's blue grid shows through.
const PALETTE = { mesh: 0xaab7cc, edge: 0x0a1633, grid: 0x7fa6ff, bounds: 0xffc800, cursor: 0x3d86ff };
// Behind exported thumbnails (the canvas itself is transparent).
const STAGE_BG = { default: '#153a86', realistic: '#8fb8e6' };
const CREASE_ANGLE = (35 * Math.PI) / 180; // smooth round holes, keep box edges sharp

export default function Viewport() {
	const hostRef = useRef(null);
	const sceneRef = useRef(null);

	const mesh = useStore((s) => s.mesh);
	const cursor = useStore((s) => s.cursor);
	const style = useStore((s) => s.displayStyle);
	const measurements = useStore((s) => s.part.measurements);
	const viewNonce = useStore((s) => s.viewNonce);
	const showBounds = useStore((s) => s.showBounds);
	const partColor = useStore((s) => s.partColor);
	const bgColor = useStore((s) => s.bgColor);
	const rtQuality = useStore((s) => s.rtQuality);
	const placement = useStore((s) => s.placement);

	const U = resolveMeasurements(measurements).gridUnit;

	// ---- one time setup
	useEffect(() => {
		const host = hostRef.current;
		const palette = () => PALETTE;

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setClearColor(0x000000, 0);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		host.appendChild(renderer.domElement);
		renderer.domElement.style.display = 'block';
		renderer.domElement.setAttribute('aria-label', '3D view of the part');

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
		camera.position.set(90, 80, 110);

		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.screenSpacePanning = true;

		const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3a4a6e, 1.25);
		scene.add(hemi);
		const sun = new THREE.DirectionalLight(0xffffff, 1.6);
		sun.position.set(60, 120, 80);
		camera.add(sun); // light follows the camera so faces stay readable while orbiting
		scene.add(camera);

		// Realistic style only: a fixed key light that casts a soft shadow onto a ground plane.
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;
		const key = new THREE.DirectionalLight(0xfff6ea, 3.0);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		key.shadow.bias = -0.0004;
		key.shadow.normalBias = 0.4;
		key.shadow.radius = 4; // blur of the shadow edge
		key.visible = false;
		scene.add(key, key.target);
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
			new THREE.ShadowMaterial({ color: 0x1b2230, opacity: 0.38 }),
		);
		ground.receiveShadow = true;
		ground.visible = false;
		scene.add(ground);

		// Soft blob under the part: grounds it whatever the key light direction is.
		const blob = document.createElement('canvas');
		blob.width = blob.height = 256;
		const bg = blob.getContext('2d');
		const grad = bg.createRadialGradient(128, 128, 8, 128, 128, 128);
		grad.addColorStop(0, 'rgba(20,28,45,0.55)');
		grad.addColorStop(0.55, 'rgba(20,28,45,0.22)');
		grad.addColorStop(1, 'rgba(20,28,45,0)');
		bg.fillStyle = grad;
		bg.fillRect(0, 0, 256, 256);
		const contact = new THREE.Mesh(
			new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }),
		);
		contact.visible = false;
		contact.renderOrder = -1;
		scene.add(contact);

		const group = new THREE.Group(); // the part
		scene.add(group);
		const cursorGroup = new THREE.Group();
		scene.add(cursorGroup);

		// Transparent preview of a catalog preset while it is being positioned.
		const placeGroup = new THREE.Group();
		placeGroup.visible = false;
		scene.add(placeGroup);

		// Orientation gizmo, drawn in the bottom right corner with the camera's orientation.
		const gizmo = buildAxisGizmo();

		const ctx = { renderer, scene, camera, controls, group, cursorGroup, grid: null, palette, U: 8, dirty: true, hemi, sun, key, ground, contact, style: 'contour', env: null,
			rt: null, rtOn: false, rtMeshSrc: null, rtReported: 0, gizmo, hideGizmo: false, placeGroup };
		sceneRef.current = ctx;

		const resize = () => {
			const w = host.clientWidth || 1;
			const h = host.clientHeight || 1;
			renderer.setSize(w, h, false);
			renderer.domElement.style.width = '100%';
			renderer.domElement.style.height = '100%';
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			ctx.dirty = true;
			if (ctx.rtOn) ctx.rt?.reset();
		};
		const ro = new ResizeObserver(resize);
		ro.observe(host);
		resize();

		controls.addEventListener('change', () => { ctx.dirty = true; });

		// Look of the scene for the current style; the ray tracer replaces the raster part, ground and light.
		ctx.applyLook = () => {
			const real = ctx.style === 'realistic';
			const tracing = real && ctx.rtOn && !!ctx.rt?.hasPart;
			ctx.group.visible = !tracing;
			ctx.key.visible = real && !tracing;
			ctx.ground.visible = real && !tracing;
			ctx.contact.visible = real && !tracing;
			ctx.dirty = true;
		};

		// Draws the axis gizmo into a square in the bottom right corner (no depth interaction with the scene).
		ctx.drawGizmo = () => {
			if (ctx.hideGizmo) return;
			const w = host.clientWidth;
			const h = host.clientHeight;
			const size = Math.round(Math.min(200, Math.max(120, w * 0.17)));
			const pad = 16;
			const g = ctx.gizmo;
			g.camera.quaternion.copy(camera.quaternion); // same orientation as the scene camera
			g.camera.position.set(0, 0, 10).applyQuaternion(g.camera.quaternion); // looking at the origin from the scene camera's side
			const autoClear = renderer.autoClear;
			renderer.autoClear = false;
			renderer.setScissorTest(true);
			renderer.setViewport(w - size - pad, pad, size, size);
			renderer.setScissor(w - size - pad, pad, size, size);
			renderer.clearDepth();
			renderer.render(g.scene, g.camera);
			renderer.setScissorTest(false);
			renderer.setViewport(0, 0, w, h);
			renderer.autoClear = autoClear;
		};

		// Editing helpers (cursor, bounds) are drawn on top of the traced image.
		ctx.drawOverlay = () => {
			const hidden = [ctx.group, ctx.ground, ctx.contact, ctx.grid].filter(Boolean);
			const was = hidden.map((o) => o.visible);
			hidden.forEach((o) => { o.visible = false; });
			const autoClear = renderer.autoClear;
			renderer.autoClear = false;
			renderer.clearDepth();
			renderer.render(scene, camera);
			renderer.autoClear = autoClear;
			hidden.forEach((o, i) => { o.visible = was[i]; });
			ctx.drawGizmo();
		};

		const reportRayTracing = () => {
			const now = performance.now();
			if (now - ctx.rtReported < 250) return;
			ctx.rtReported = now;
			const rt = ctx.rt;
			const next = { state: rt.done ? 'done' : 'tracing', samples: rt.samples, max: rt.maxSamples };
			const cur = getState().rt;
			if (cur.state !== next.state || cur.samples !== next.samples || cur.max !== next.max) setState({ rt: next });
		};

		let raf = 0;
		const loop = () => {
			raf = requestAnimationFrame(loop);
			const moved = controls.update();
			if (ctx.rtOn && ctx.rt && ctx.rt.hasPart) {
				if (moved) ctx.rt.cameraChanged(); // restarts accumulation, preview shows meanwhile
				if (moved || ctx.dirty || ctx.rt.active) {
					ctx.rt.renderFrame();
					ctx.drawOverlay();
					ctx.dirty = false;
					reportRayTracing();
				}
				return;
			}
			if (moved || ctx.dirty) {
				renderer.render(scene, camera);
				ctx.drawGizmo();
				ctx.dirty = false;
			}
		};
		loop();

		// ---- picking: click selects, shift+click selects the cell next to the clicked face
		const ray = new THREE.Raycaster();
		const ndc = new THREE.Vector2();
		let down = null;
		const el = renderer.domElement;
		const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
		const onUp = (e) => {
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
			down = null;
			if (getState().placement) { confirmPlacement(); return; } // a click places the preset instead of selecting a cell
			const r = el.getBoundingClientRect();
			ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
			ray.setFromCamera(ndc, camera);
			const u = ctx.U;
			const target = group.children.find((c) => c.isMesh);
			const hit = target ? ray.intersectObject(target, false)[0] : null;
			if (hit) {
				const n = hit.face.normal.clone();
				const sign = e.shiftKey ? 1 : -1;
				const p = hit.point.clone().addScaledVector(n, sign * 0.05);
				setCursor([Math.floor(p.x / u), Math.floor(p.y / u), Math.floor(p.z / u)]);
				return;
			}
			const cy = getState().cursor[1];
			const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cy * u);
			const pt = new THREE.Vector3();
			if (ray.ray.intersectPlane(plane, pt)) setCursor([Math.floor(pt.x / u), cy, Math.floor(pt.z / u)]);
		};
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointerup', onUp);

		// While a preset is being placed it follows the pointer, at the height chosen with w / s.
		const hoverPlane = new THREE.Plane();
		const hoverPoint = new THREE.Vector3();
		const onMove = (e) => {
			const placing = getState().placement;
			if (!placing || e.buttons) return; // not placing, or the user is orbiting
			const r = el.getBoundingClientRect();
			ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
			ray.setFromCamera(ndc, camera);
			hoverPlane.set(new THREE.Vector3(0, 1, 0), -placing.origin[1] * ctx.U);
			if (ray.ray.intersectPlane(hoverPlane, hoverPoint)) {
				hoverPlacement(Math.floor(hoverPoint.x / ctx.U), Math.floor(hoverPoint.z / ctx.U));
			}
		};
		el.addEventListener('pointermove', onMove);

		viewportApi.capture = () => {
			ctx.hideGizmo = true; // thumbnails show the part only
			try {
				if (ctx.rtOn && ctx.rt?.hasPart) {
					ctx.rt.renderFrame();
					ctx.drawOverlay();
				} else {
					renderer.render(scene, camera);
				}
				const out = document.createElement('canvas');
				out.width = 240;
				out.height = 180;
				const c2d = out.getContext('2d');
				c2d.fillStyle = ctx.bgColor || STAGE_BG[ctx.style === 'realistic' ? 'realistic' : 'default'];
				c2d.fillRect(0, 0, out.width, out.height);
				const src = renderer.domElement;
				const scale = Math.max(out.width / src.width, out.height / src.height);
				const w = src.width * scale;
				const h = src.height * scale;
				c2d.drawImage(src, (out.width - w) / 2, (out.height - h) / 2, w, h);
				return out.toDataURL('image/webp', 0.8);
			} catch {
				return null;
			} finally {
				ctx.hideGizmo = false;
			}
		};

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('pointermove', onMove);
			controls.dispose();
			clearGroup(group);
			clearGroup(cursorGroup);
			clearGroup(placeGroup);
			if (ctx.boundsGroup) clearGroup(ctx.boundsGroup);
			ctx.grid?.geometry.dispose();
			ctx.env?.dispose();
			ctx.rt?.dispose();
			disposeGizmo(gizmo);
			ground.geometry.dispose();
			ground.material.dispose();
			contact.material.map.dispose();
			contact.material.dispose();
			contact.geometry.dispose();
			renderer.dispose();
			host.removeChild(renderer.domElement);
			viewportApi.capture = () => null;
			sceneRef.current = null;
		};
	}, []);

	// ---- grid follows the grid unit
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		ctx.U = U;
		const build = () => {
			if (ctx.grid) { ctx.scene.remove(ctx.grid); ctx.grid.geometry.dispose(); ctx.grid.material.dispose(); }
			const cells = 40;
			const grid = new THREE.GridHelper(cells * U, cells, gridColorFor(ctx.bgColor), gridColorFor(ctx.bgColor));
			grid.visible = ctx.style !== 'realistic';
			grid.material.transparent = true;
			grid.material.opacity = 0.32;
			grid.material.depthWrite = false;
			// 40 cells centred on the origin, so grid lines fall on cell corners
			grid.position.set(0, -0.02, 0);
			ctx.scene.add(grid);
			ctx.grid = grid;
			ctx.dirty = true;
		};
		build();
		ctx.rebuild = build;
	}, [U]);

	// ---- scene look for the chosen display style (before the mesh effect so new materials pick it up)
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return undefined;
		const real = style === 'realistic';
		ctx.style = style;
		ctx.renderer.toneMapping = real ? THREE.NeutralToneMapping : THREE.NoToneMapping; // keeps plastic colours saturated
		ctx.renderer.toneMappingExposure = 1;
		if (real && !ctx.env) {
			const pmrem = new THREE.PMREMGenerator(ctx.renderer);
			ctx.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // soft studio reflections (raster preview)
			pmrem.dispose();
		}
		ctx.scene.environment = real ? ctx.env : null;
		ctx.scene.environmentIntensity = 0.7;
		ctx.hemi.intensity = real ? 0.1 : 1.25;
		ctx.sun.visible = !real;
		if (ctx.grid) ctx.grid.visible = !real;

		if (!real) {
			ctx.rtOn = false;
			ctx.applyLook();
			setState({ rt: { state: 'off', samples: 0, max: QUALITY[getState().rtQuality].samples } });
			return undefined;
		}

		// Realistic: show the fast preview at once, then switch to ray tracing when the library is ready.
		ctx.applyLook();
		let cancelled = false;
		(async () => {
			setState({ rt: { state: 'loading', samples: 0, max: QUALITY[getState().rtQuality].samples } });
			try {
				const tracerLib = await loadRayTracer();
				if (cancelled || ctx.style !== 'realistic') return;
				if (!rayTracingSupported(ctx.renderer)) throw new Error('this browser or GPU lacks WebGL2 float rendering');
				ctx.rt ||= new RayTracer(ctx.renderer, ctx.camera, tracerLib);
				ctx.rt.setBackground(ctx.bgColor);
				ctx.rt.setQuality(getState().rtQuality);
				const { mesh: current, partColor: colour } = getState();
				ctx.rt.setPart(current, colour);
				ctx.rtMeshSrc = current;
				ctx.rtOn = true;
				ctx.applyLook();
				setState({ rt: { state: 'tracing', samples: 0, max: ctx.rt.maxSamples } });
			} catch (e) {
				if (cancelled) return;
				// eslint-disable-next-line no-console
				console.warn('Ray tracing unavailable, using the fast preview:', e && e.message ? e.message : e);
				ctx.rtOn = false;
				ctx.applyLook();
				setState({ rt: { state: 'unsupported', samples: 0, max: 0 } });
				showToast('Ray tracing is not available here. Showing the fast realistic preview.', 'error');
			}
		})();
		return () => { cancelled = true; };
	}, [style]);

	// ---- background colour (null = the style's own backdrop; the page paints it behind the transparent canvas)
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		ctx.bgColor = bgColor;
		ctx.rt?.setBackground(bgColor); // the ray tracer draws its own background, so it needs telling
		if (ctx.grid) ctx.grid.material.color.set(gridColorFor(bgColor));
		ctx.dirty = true;
	}, [bgColor]);

	// ---- ray tracing quality
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		ctx.rt?.setQuality(rtQuality);
		if (ctx.rtOn) setState({ rt: { ...getState().rt, state: 'tracing', max: QUALITY[rtQuality].samples } });
		ctx.dirty = true;
	}, [rtQuality]);

	// ---- part mesh and display style
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		clearGroup(ctx.group);
		const real = style === 'realistic';
		if (mesh && mesh.triangleCount) {
			const indexed = new THREE.BufferGeometry();
			indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
			indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
			let geometry;
			if (real) {
				geometry = toCreasedNormals(indexed, CREASE_ANGLE); // smooth curves, crisp edges
			} else {
				geometry = indexed.toNonIndexed(); // flat shading
				geometry.computeVertexNormals();
			}
			indexed.dispose();

			const p = ctx.palette();
			const material = real
				? new THREE.MeshPhysicalMaterial({
					color: partColor, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.14,
				})
				: new THREE.MeshStandardMaterial({
					color: partColor, roughness: 0.5, metalness: 0.12,
					wireframe: style === 'wireframe',
					transparent: style === 'xray', opacity: style === 'xray' ? 0.35 : 1,
					depthWrite: style !== 'xray',
					polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
				});
			const m = new THREE.Mesh(geometry, material);
			m.castShadow = real;
			m.receiveShadow = real;
			ctx.group.add(m);

			if (style === 'contour' || style === 'xray') {
				const edges = new THREE.LineSegments(
					new THREE.EdgesGeometry(geometry, 35),
					new THREE.LineBasicMaterial({ color: edgeColor(partColor, p.edge), transparent: true, opacity: style === 'xray' ? 0.5 : 0.85 }),
				);
				ctx.group.add(edges);
			}
		}

		// Ground and key light follow the part so the shadow always fits.
		if (mesh?.bbox) {
			const min = new THREE.Vector3(...mesh.bbox.min);
			const max = new THREE.Vector3(...mesh.bbox.max);
			const centre = min.clone().add(max).multiplyScalar(0.5);
			const r = Math.max(max.distanceTo(min) / 2, 8);
			ctx.ground.position.y = min.y - 0.02;
			ctx.contact.position.set(centre.x, min.y - 0.01, centre.z);
			ctx.contact.scale.set((max.x - min.x) * 1.7 + 12, 1, (max.z - min.z) * 1.7 + 12);
			ctx.key.target.position.copy(centre);
			// From the upper left in front, so the shadow falls to the right and behind where the camera sees it.
			ctx.key.position.set(centre.x - r * 1.3, centre.y + r * 2.2, centre.z + r * 0.9);
			const cam = ctx.key.shadow.camera;
			cam.left = -r * 1.7; cam.right = r * 1.7; cam.top = r * 1.7; cam.bottom = -r * 1.7;
			cam.near = 1; cam.far = r * 8;
			cam.updateProjectionMatrix();
		}

		// Keep the ray tracer's scene in step (new geometry, or just a new colour).
		if (ctx.rtOn && ctx.rt) {
			if (ctx.rtMeshSrc !== mesh) {
				ctx.rt.setPart(mesh, partColor);
				ctx.rtMeshSrc = mesh;
			} else {
				ctx.rt.setColor(partColor);
			}
			ctx.applyLook();
		}
		ctx.dirty = true;
	}, [mesh, style, partColor]);

	// ---- optional bounding box of the part (toolbar "bounds" button)
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		ctx.boundsGroup ||= (() => { const g = new THREE.Group(); ctx.scene.add(g); return g; })();
		clearGroup(ctx.boundsGroup);
		if (showBounds && mesh?.bbox) {
			const min = new THREE.Vector3(...mesh.bbox.min);
			const max = new THREE.Vector3(...mesh.bbox.max);
			const size = max.clone().sub(min);
			const box = new THREE.LineSegments(
				new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
				new THREE.LineBasicMaterial({ color: style === 'realistic' ? 0xd97706 : PALETTE.bounds, depthTest: false, transparent: true, opacity: 0.9 }),
			);
			box.position.copy(min.clone().add(max).multiplyScalar(0.5));
			box.renderOrder = 9;
			ctx.boundsGroup.add(box);
		}
		ctx.dirty = true;
	}, [mesh, showBounds, style]);

	// ---- cursor box with axis arrows
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		clearGroup(ctx.cursorGroup);
		const box = new THREE.LineSegments(
			new THREE.EdgesGeometry(new THREE.BoxGeometry(U, U, U)),
			new THREE.LineBasicMaterial({ color: style === 'realistic' ? 0x2b5fd9 : 0xa9c7ff, depthTest: false, transparent: true }),
		);
		box.renderOrder = 10;
		const ghost = new THREE.Mesh(
			new THREE.BoxGeometry(U, U, U),
			new THREE.MeshBasicMaterial({ color: PALETTE.cursor, transparent: true, opacity: 0.2, depthWrite: false }),
		);
		ctx.cursorGroup.add(box, ghost);
		const len = U * 0.9;
		const arrow = (dir, color) => {
			const a = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), len, color, U * 0.34, U * 0.24);
			a.line.material.depthTest = false;
			a.cone.material.depthTest = false;
			a.renderOrder = 11;
			ctx.cursorGroup.add(a);
		};
		// User axes: X red, Y green (away from the viewer), Z blue (up)
		arrow(new THREE.Vector3(1, 0, 0), 0xff2d20);
		arrow(new THREE.Vector3(0, 0, -1), 0x2ee05a);
		arrow(new THREE.Vector3(0, 1, 0), 0x2b7bff);
		ctx.cursorGroup.position.set((cursor[0] + 0.5) * U, (cursor[1] + 0.5) * U, (cursor[2] + 0.5) * U);
		ctx.dirty = true;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [U, style]);

	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		ctx.cursorGroup.position.set((cursor[0] + 0.5) * U, (cursor[1] + 0.5) * U, (cursor[2] + 0.5) * U);
		ctx.dirty = true;
	}, [cursor, U]);

	// ---- transparent preview of the preset being placed
	const placing = !!placement;
	const placeMesh = placement?.mesh || null;
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		clearGroup(ctx.placeGroup);
		if (placeMesh && placeMesh.triangleCount) {
			const indexed = new THREE.BufferGeometry();
			indexed.setAttribute('position', new THREE.BufferAttribute(placeMesh.positions, 3));
			indexed.setIndex(new THREE.BufferAttribute(placeMesh.indices, 1));
			const geometry = indexed.toNonIndexed();
			indexed.dispose();
			// unlit, so the preview looks the same in every display style
			ctx.placeGroup.add(new THREE.Mesh(
				geometry,
				new THREE.MeshBasicMaterial({ color: partColor, transparent: true, opacity: 0.45, depthWrite: false }),
			));
			ctx.placeGroup.add(new THREE.LineSegments(
				new THREE.EdgesGeometry(geometry, 35),
				new THREE.LineBasicMaterial({ color: style === 'realistic' ? 0x1d3a8a : 0xe6efff, transparent: true, opacity: 0.9 }),
			));
		}
		ctx.placeGroup.visible = placing;
		ctx.cursorGroup.visible = !placing; // the editing cursor is hidden while positioning
		ctx.dirty = true;
	}, [placeMesh, placing, partColor, style]);

	const originKey = placement ? placement.origin.join(',') : '';
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx || !placement) return;
		ctx.placeGroup.position.set(placement.origin[0] * U, placement.origin[1] * U, placement.origin[2] * U);
		ctx.dirty = true;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [originKey, U]);

	// ---- re-frame on request (load, clear, "Fit view")
	useEffect(() => {
		const ctx = sceneRef.current;
		if (!ctx) return;
		const { part } = getState();
		const box = new THREE.Box3();
		if (part.blocks.length) {
			for (const b of part.blocks) {
				box.expandByPoint(new THREE.Vector3(b.pos[0] * U, b.pos[1] * U, b.pos[2] * U));
				box.expandByPoint(new THREE.Vector3((b.pos[0] + 1) * U, (b.pos[1] + 1) * U, (b.pos[2] + 1) * U));
			}
		} else {
			box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3 * U, U, 3 * U));
		}
		const centre = box.getCenter(new THREE.Vector3());
		const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, U);
		const dist = radius / Math.sin((ctx.camera.fov * Math.PI) / 360) * 1.05;
		const dir = new THREE.Vector3(0.6, 0.55, 0.75).normalize();
		ctx.camera.position.copy(centre).addScaledVector(dir, dist);
		ctx.controls.target.copy(centre);
		ctx.controls.update();
		ctx.dirty = true;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewNonce]);

	return <div ref={hostRef} className="viewport" />;
}

/** X (red), Y (green, away from the viewer) and Z (blue, up) arrows with labels; stored axes: x, -z, y. */
function buildAxisGizmo() {
	const scene = new THREE.Scene();
	// Orthographic: with a perspective lens the arrows lean away from the true view directions (they looked unparallel to
	// the cursor's arrows in the scene). Using the scene camera's own orientation makes them point exactly the same way.
	const camera = new THREE.OrthographicCamera(-1.75, 1.75, 1.75, -1.75, 0.1, 40);
	const axes = [
		{ dir: new THREE.Vector3(1, 0, 0), color: 0xe0302a, label: 'X' },
		{ dir: new THREE.Vector3(0, 0, -1), color: 0x2fbf4a, label: 'Y' },
		{ dir: new THREE.Vector3(0, 1, 0), color: 0x3a4fe6, label: 'Z' },
	];
	const up = new THREE.Vector3(0, 1, 0);
	for (const { dir, color, label } of axes) {
		const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
		const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.7, 14).translate(0, 0.35, 0), material);
		const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 18).translate(0, 0.88, 0), material);
		const arrow = new THREE.Group();
		arrow.add(shaft, head);
		arrow.quaternion.setFromUnitVectors(up, dir);
		scene.add(arrow);

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 96;
		const c2d = canvas.getContext('2d');
		c2d.font = '700 60px system-ui, sans-serif';
		c2d.textAlign = 'center';
		c2d.textBaseline = 'middle';
		c2d.lineJoin = 'round';
		c2d.lineWidth = 15;
		c2d.strokeStyle = 'rgba(10,22,51,0.8)'; // dark outer edge, then a light ring: readable on pale and on dark backdrops
		c2d.strokeText(label, 48, 52);
		c2d.lineWidth = 8;
		c2d.strokeStyle = 'rgba(255,255,255,0.95)';
		c2d.strokeText(label, 48, 52);
		c2d.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
		c2d.fillText(label, 48, 52);
		const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, toneMapped: false }));
		sprite.position.copy(dir).multiplyScalar(1.3);
		sprite.scale.setScalar(0.62);
		scene.add(sprite);
	}
	scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8a94a6, toneMapped: false })));
	return { scene, camera };
}

function disposeGizmo(gizmo) {
	gizmo.scene.traverse((o) => {
		o.geometry?.dispose?.();
		o.material?.map?.dispose?.();
		o.material?.dispose?.();
	});
}

/** Floor grid colour: the usual light blue, or a darker blue-grey when the background colour is light. */
function gridColorFor(bg) {
	if (!bg) return PALETTE.grid;
	const c = new THREE.Color(bg);
	return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.45 ? 0x3d5a94 : PALETTE.grid;
}

/** Outline colour that stays visible on dark parts too. */
function edgeColor(partColor, dark) {
	const c = new THREE.Color(partColor);
	const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
	return luminance < 0.05 ? 0xdfe9ff : dark;
}

function clearGroup(group) {
	for (const child of [...group.children]) {
		group.remove(child);
		child.traverse?.((o) => {
			o.geometry?.dispose?.();
			const mat = o.material;
			if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
			else mat?.dispose?.();
		});
	}
}
