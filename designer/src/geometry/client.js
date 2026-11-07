// Main-thread wrapper around the mesh worker. Each client owns one worker and drops stale results, so only the
// latest request resolves. The main part and the catalog placement preview use separate clients, so one never
// cancels the other.
import './workerFactory.js';

export function createMeshClient() {
	let worker = null;
	let seq = 0;
	const pending = new Map();

	function ensureWorker() {
		if (worker) return worker;
		worker = new BitBrickWorker(new URL('./mesh.worker.js', import.meta.url));
		worker.onmessage = (e) => {
			const { id, mesh, error } = e.data;
			const entry = pending.get(id);
			if (!entry) return;
			pending.delete(id);
			if (error) entry.reject(new Error(error));
			else entry.resolve(mesh);
		};
		worker.onerror = (e) => {
			for (const entry of pending.values()) entry.reject(new Error(e.message || 'Mesh worker failed'));
			pending.clear();
			worker = null;
		};
		return worker;
	}

	/** Resolves with a mesh, or with null when a newer request replaced this one. */
	return function requestMesh(part) {
		const id = ++seq;
		for (const [oldId, entry] of pending) {
			entry.resolve(null);
			pending.delete(oldId);
		}
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			ensureWorker().postMessage({ id, part });
		});
	};
}

export const requestMesh = createMeshClient();
export const requestPreviewMesh = createMeshClient();
