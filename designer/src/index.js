import { createRoot } from 'react-dom/client';
import './ui/styles.css';
import App from './ui/App.jsx';
import { getState, setState, subscribe, setPlacementMesh } from './state/store.js';
import { bootstrapPart, saveDraft, restoreViewPrefs, saveViewPrefs } from './state/actions.js';
import { requestMesh, requestPreviewMesh } from './geometry/client.js';

const boot = window.__BITBRICK__ || { user: null, urls: {}, csrf: '', limits: { maxBlocks: 5000 } };

setState({
	user: boot.user || null,
	urls: boot.urls || {},
	csrf: boot.csrf || '',
	limits: boot.limits || getState().limits,
});

restoreViewPrefs();

// Rebuild the mesh in the worker whenever the part changes (debounced; stale results are dropped).
let meshTimer = null;
let lastBlocks = null;
let lastMeasurements = null;
function scheduleMesh() {
	const { part } = getState();
	// Only the blocks and measurements matter: renaming the project must not rebuild the mesh.
	if (part.blocks === lastBlocks && part.measurements === lastMeasurements) return;
	lastBlocks = part.blocks;
	lastMeasurements = part.measurements;
	clearTimeout(meshTimer);
	if (!part.blocks.length) {
		setState({ mesh: null, meshStatus: 'idle', meshError: null });
		return;
	}
	setState({ meshStatus: 'building' });
	meshTimer = setTimeout(async () => {
		try {
			const mesh = await requestMesh(part);
			if (mesh && getState().part.blocks === part.blocks) setState({ mesh, meshStatus: 'idle', meshError: null });
		} catch (e) {
			if (getState().part.blocks === part.blocks) setState({ meshStatus: 'error', meshError: e.message });
		}
	}, 120);
}

// Build the transparent preview for the preset being placed (again whenever it is turned with x / y / z).
let previewBlocks = null;
function schedulePreview() {
	const placement = getState().placement;
	if (!placement) { previewBlocks = null; return; }
	if (placement.blocks === previewBlocks) return;
	previewBlocks = placement.blocks;
	const { blocks, item } = placement;
	requestPreviewMesh({ version: 1, name: item.name, blocks, measurements: getState().part.measurements })
		.then((mesh) => { if (mesh) setPlacementMesh(blocks, mesh); })
		.catch(() => { /* no preview: the preset can still be placed */ });
}

// Autosave a local draft (debounced).
let draftTimer = null;
let lastView = '';
subscribe(() => {
	scheduleMesh();
	schedulePreview();
	const view = getState().displayStyle + getState().partColor + getState().rtQuality + getState().bgColor;
	if (view !== lastView) { lastView = view; saveViewPrefs(); }
	const { part } = getState();
	clearTimeout(draftTimer);
	draftTimer = setTimeout(() => saveDraft(part), 600);
});

const mount = document.getElementById('main');
createRoot(mount).render(<App />);
bootstrapPart(boot);
