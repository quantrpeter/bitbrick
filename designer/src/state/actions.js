// Side-effecting actions: files, clipboard, cloud save, draft autosave.
import {
	getState, setState, showToast, markSaved, loadPart, openDialog, closeDialog, STYLE_ORDER, PART_COLORS, RT_QUALITIES,
} from './store.js';
import { toBinaryStl, fileNameFor } from '../geometry/stl.js';
import { encodePart, decodePart } from '../model/codec.js';
import { parsePart, emptyPart } from '../model/part.js';
import { createDesign, updateDesign, getDesign, renameDesign, ApiError } from '../api/api.js';

const DRAFT_KEY = 'bitbrick.draft.v1';

// The viewport registers itself here so actions can capture a thumbnail / re-frame.
export const viewportApi = { capture: () => null };

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function saveStl() {
	const { mesh, part, meshStatus } = getState();
	if (meshStatus === 'building') return showToast('Still building the mesh, try again in a moment.', 'error');
	if (!mesh || !mesh.triangleCount) return showToast('Add at least one block first.', 'error');
	if (!mesh.manifold) {
		return showToast(`The mesh is not watertight (${mesh.status}). Change the design or the measurements.`, 'error');
	}
	downloadBlob(new Blob([toBinaryStl(mesh, part.name)], { type: 'model/stl' }), fileNameFor(part.name, 'stl'));
	showToast('STL saved');
}

export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		let ok = false;
		try { ok = document.execCommand('copy'); } catch { ok = false; }
		ta.remove();
		return ok;
	}
}

export function shareLink(part = getState().part) {
	return `${window.location.origin}/designer#part=${encodePart(part)}`;
}

export async function shareByLink() {
	const { part } = getState();
	if (!part.blocks.length) return showToast('Add at least one block first.', 'error');
	const link = shareLink(part);
	if (link.length > 8000) {
		return showToast('This part is too large for a link. Save it, then use Share in the Open dialog to get a link.', 'error');
	}
	showToast((await copyText(link)) ? 'Link copied' : 'Could not copy. Select the address bar instead.', 'info');
	window.history.replaceState(null, '', `/designer#part=${encodePart(part)}`);
}

export function goToLogin() {
	const { urls } = getState();
	window.location.href = `${urls.login || '/'}?next=${encodeURIComponent('/designer')}`;
}

// ---------------------------------------------------------------- projects (New / Open / Save / Save as / rename)

const cleanName = (raw) => String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);

function sessionExpired(e) {
	showToast(e.message, 'error');
	if (e instanceof ApiError && (e.status === 401 || e.status === 419)) setState({ user: null });
}

/** New: ask for a name (the dialog warns when unsaved work would be discarded). */
export function startNewProject() { openDialog({ type: 'new' }); }

/** Creates the new, still unsaved, project. */
export function createProject(raw) {
	const name = cleanName(raw);
	if (!name) return showToast('Give the project a name.', 'error');
	loadPart(emptyPart(name), { designId: null, dirty: false, nameChosen: true });
	window.history.replaceState(null, '', '/designer');
	closeDialog();
	showToast(`New project "${name}"`);
}

export function openProjectList() { openDialog({ type: 'open' }); }

/** Save: writes the current project; a project that was never named or saved asks for a name first. */
export async function saveProject() {
	const { user, part, designId, nameChosen } = getState();
	if (!user) return goToLogin();
	if (!part.blocks.length) return showToast('Add at least one block first.', 'error');
	if (!designId && !nameChosen) return openDialog({ type: 'saveAs' });
	return writeProject({ asNew: false, name: part.name });
}

export function startSaveAs() {
	if (!getState().part.blocks.length) return showToast('Add at least one block first.', 'error');
	openDialog({ type: 'saveAs' });
}

/** Save as: stores a copy under a new name; that copy becomes the current project. */
export async function saveProjectAs(raw) {
	const name = cleanName(raw);
	if (!name) return showToast('Give the project a name.', 'error');
	const saved = await writeProject({ asNew: true, name });
	if (saved) closeDialog();
	return saved;
}

async function writeProject({ asNew, name }) {
	const { part, designId, urls } = getState();
	const next = name && name !== part.name ? { ...part, name } : part;
	const payload = { name: next.name, data: next, thumbnail: viewportApi.capture() };
	try {
		const saved = asNew || !designId ? await createDesign(urls.designs, payload) : await updateDesign(urls.designs, designId, payload);
		if (next !== part) setState({ part: next });
		markSaved(saved.id);
		window.history.replaceState(null, '', `/designer/d/${saved.id}`);
		showToast(`Saved "${saved.name}"`);
		return saved;
	} catch (e) {
		sessionExpired(e);
		return null;
	}
}

/** Rename the open project. A saved project is renamed on the server at once; its blocks are not touched. */
export async function renameProject(raw) {
	const name = cleanName(raw);
	if (!name) { showToast('The name cannot be blank.', 'error'); return false; }
	const { part, designId, urls } = getState();
	if (name === part.name) return true;
	if (designId) {
		try { await renameDesign(urls.designs, designId, name); } catch (e) { sessionExpired(e); return false; }
	}
	setState((s) => ({ part: { ...s.part, name }, nameChosen: true }));
	return true;
}

export async function openDesign(id) {
	const { urls } = getState();
	try {
		const d = await getDesign(urls.designs, id);
		loadPart(parsePart({ ...d.data, name: d.name }), { designId: d.id, nameChosen: true });
		window.history.replaceState(null, '', `/designer/d/${d.id}`);
		return true;
	} catch (e) {
		showToast(e.message, 'error');
		return false;
	}
}

// ---------------------------------------------------------------- view preferences (style + colour)

const VIEW_KEY = 'bitbrick.view.v1';

export function saveViewPrefs() {
	const { displayStyle, partColor, rtQuality, bgColor } = getState();
	try { window.localStorage.setItem(VIEW_KEY, JSON.stringify({ displayStyle, partColor, rtQuality, bgColor })); } catch { /* optional */ }
}

export function restoreViewPrefs() {
	try {
		const p = JSON.parse(window.localStorage.getItem(VIEW_KEY) || '{}');
		const patch = {};
		if (STYLE_ORDER.includes(p.displayStyle)) patch.displayStyle = p.displayStyle;
		if (PART_COLORS.some((c) => c.value === p.partColor)) patch.partColor = p.partColor;
		if (RT_QUALITIES.includes(p.rtQuality)) patch.rtQuality = p.rtQuality;
		if (typeof p.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(p.bgColor)) patch.bgColor = p.bgColor.toLowerCase();
		if (Object.keys(patch).length) setState(patch);
	} catch { /* ignore a corrupt value */ }
}

// ---------------------------------------------------------------- drafts (localStorage is optional)

export function saveDraft(part) {
	try {
		if (!part.blocks.length && part.name === 'Untitled part') window.localStorage.removeItem(DRAFT_KEY);
		else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ part, savedAt: Date.now() }));
	} catch { /* private mode, quota or blocked storage: autosave is a convenience only */ }
}

export function readDraft() {
	try {
		const raw = window.localStorage.getItem(DRAFT_KEY);
		return raw ? parsePart(JSON.parse(raw).part) : null;
	} catch {
		return null;
	}
}

/** Decide what to show on startup: shared design > link in the hash > saved design path > draft. */
export async function bootstrapPart(boot) {
	if (boot.shared) {
		try {
			loadPart(parsePart({ ...boot.shared.data, name: boot.shared.name }), { dirty: false });
			showToast('Opened a shared design as an unsaved copy');
			return;
		} catch { showToast('This shared design could not be opened.', 'error'); }
	}

	// A link opened while signed out is parked by the login page for the trip through sign-in.
	let pending = null;
	try {
		pending = window.sessionStorage.getItem('bitbrick.pendingHash');
		window.sessionStorage.removeItem('bitbrick.pendingHash');
	} catch { /* storage blocked */ }

	const hash = (window.location.hash || pending || '').match(/^#part=(.+)$/);
	if (hash) {
		try {
			loadPart(decodePart(hash[1]), { dirty: true });
			window.history.replaceState(null, '', '/designer');
			return;
		} catch { showToast('This link is not valid.', 'error'); }
	}

	const m = window.location.pathname.match(/^\/designer\/d\/(\d+)$/);
	if (m && boot.user) {
		if (await openDesign(Number(m[1]))) return;
	}

	const draft = readDraft();
	if (draft) loadPart(draft, { dirty: true });
	else loadPart(emptyPart());
}
