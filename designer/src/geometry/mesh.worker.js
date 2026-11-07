// Builds meshes off the main thread. Messages: { id, part } -> { id, mesh } | { id, error }
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm';
import { buildMesh } from './build.js';

let wasmPromise = null;
function wasm() {
	if (!wasmPromise) {
		const url = new URL(wasmUrl, self.__BITBRICK_ORIGIN__ || self.location.href).href;
		wasmPromise = Module({ locateFile: () => url }).then((w) => { w.setup(); return w; });
	}
	return wasmPromise;
}

self.onmessage = async (event) => {
	const { id, part } = event.data;
	try {
		const w = await wasm();
		const mesh = buildMesh(w, part);
		self.postMessage({ id, mesh }, [mesh.positions.buffer, mesh.indices.buffer]);
	} catch (error) {
		self.postMessage({ id, error: String(error && error.message ? error.message : error) });
	}
};
