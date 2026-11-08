// Tiny external store (no extra dependency). The Part object is the single source of truth:
// undo/redo, autosave, URL sharing and cloud save all derive from it.
import { useSyncExternalStore } from 'react';
import {
	emptyPart, setBlock, removeBlock, blockAt, defaultBrush, mirrorX, inBounds, BLOCK_TYPES, MAX_BLOCKS,
	setBlockMeasurements, setTypeMeasurements, footprintCenter, insertPreset,
} from '../model/part.js';
import { cleanBlockMeasurements } from '../model/defaults.js';
import { orientBlocks } from '../model/orient.js';

export const DEFAULT_NAME = 'Untitled part';

const HISTORY_LIMIT = 100;

const initial = () => ({
	part: emptyPart(),
	cursor: [0, 0, 0],
	brush: defaultBrush(),
	past: [],
	future: [],
	displayStyle: 'contour',
	mesh: null,
	meshStatus: 'idle', // idle | building | error
	meshError: null,
	designId: null, // id of the saved cloud design this part came from
	dirty: false,
	toast: null,
	viewNonce: 0, // bump to ask the viewport to re-frame the part
	showBounds: false, // draw the part's bounding box
	partColor: '#aab7cc', // part colour, used by every display style (display only, not saved with the part)
	bgColor: null, // viewport background: null = the style's own backdrop (blueprint blue, or the sky when ray traced), else '#rrggbb'
	rtQuality: 'good', // ray tracing quality: draft | good | best
	rt: { state: 'off', samples: 0, max: 256 }, // off | loading | tracing | done | unsupported
	sections: { part: true, edit: true, catalog: true, measurements: true },
	dialog: null, // { type: 'new' | 'saveAs' | 'open' | 'help', ... } while a modal is open
	placement: null, // { item, center, origin, mesh } while a catalog preset is being positioned
	nameChosen: false, // false until the project got a name on purpose (New, Save as, rename, open)
	user: null,
	limits: { maxBlocks: 5000 },
	urls: {},
	csrf: '',
});

let state = initial();
const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
	state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
	listeners.forEach((l) => l());
}

export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function useStore(selector = (s) => s) {
	return useSyncExternalStore(subscribe, () => selector(state));
}

export function resetStoreForTests() { state = initial(); listeners.clear(); }

// ---------------------------------------------------------------- history

function commit(part, extra = {}) {
	if (part === state.part) return;
	setState((s) => ({
		part,
		past: [...s.past, s.part].slice(-HISTORY_LIMIT),
		future: [],
		dirty: true,
		...extra,
	}));
}

export function undo() {
	const { past, future, part } = state;
	if (!past.length) return;
	setState({ part: past[past.length - 1], past: past.slice(0, -1), future: [part, ...future], dirty: true });
}

export function redo() {
	const { past, future, part } = state;
	if (!future.length) return;
	setState({ part: future[0], future: future.slice(1), past: [...past, part], dirty: true });
}

// ---------------------------------------------------------------- editing

export function moveCursor(delta) {
	const next = state.cursor.map((n, i) => n + (delta[i] || 0));
	if (!inBounds(next)) return;
	const there = blockAt(state.part, next);
	setState({
		cursor: next,
		// Selecting an existing block shows its settings in the Edit Block panel.
		brush: there ? { type: there.type, axis: there.axis, size: there.size, rounded: there.rounded } : state.brush,
	});
}

export function setCursor(pos) {
	if (!inBounds(pos)) return;
	moveCursor(pos.map((n, i) => n - state.cursor[i]));
}

/** Change brush settings. The block under the cursor is edited, or created if the cell is empty. */
export function applyBrush(patch = {}) {
	const brush = { ...state.brush, ...patch };
	const existing = blockAt(state.part, state.cursor);
	const own = existing ? cleanBlockMeasurements(brush.type, existing.measurements) : undefined;
	const part = setBlock(state.part, { pos: state.cursor, ...brush, ...(own ? { measurements: own } : {}) });
	if (part === state.part && !existing) {
		setState({ brush, toast: { kind: 'error', text: `Block limit reached (${state.limits.maxBlocks}).` } });
		return;
	}
	setState({ brush });
	commit(part);
}

export function setTypeByIndex(i) {
	if (BLOCK_TYPES[i]) applyBrush({ type: BLOCK_TYPES[i] });
}

export function removeAtCursor() {
	commit(removeBlock(state.part, state.cursor));
}

/** Measurements of one brick (the one at `pos`); replaces its overrides. */
export function setMeasurementsAt(pos, overrides) {
	commit(setBlockMeasurements(state.part, pos, overrides));
}

/** The same overrides for every brick of one type. */
export function setMeasurementsForType(type, overrides) {
	commit(setTypeMeasurements(state.part, type, overrides));
}

/** Replace the blocks of the current project with a preset's (an ordinary, undoable edit; the project keeps its name). */
export function replaceBlocks(blocks) {
	commit({ ...state.part, blocks: blocks.map((b) => ({ ...b, pos: [...b.pos], ...(b.measurements ? { measurements: { ...b.measurements } } : {}) })) });
	setState({ cursor: [0, 0, 0], viewNonce: state.viewNonce + 1 });
}

// ---------------------------------------------------------------- placing a catalog preset

/** Start positioning a preset: it follows the pointer as a transparent preview until a click places it. */
export function startPlacement(item) {
	const [cx, cz] = footprintCenter(item.blocks);
	const c = state.cursor;
	// `blocks` is what will be placed: the preset as stored, or turned by x / y / z (see model/orient.js)
	setState({ placement: { item, blocks: item.blocks, orient: { key: null, reversed: false }, center: [cx, cz], origin: [c[0] - cx, c[1], c[2] - cz], mesh: null } });
}

/**
 * x / y / z (user axes) point the preset along that axis; the same key again reverses it. The part stays under
 * the pointer: the cell it was centred on remains the centre.
 */
export function orientPlacement(key) {
	const p = state.placement;
	if (!p) return;
	const reversed = p.orient.key === key ? !p.orient.reversed : false;
	const blocks = orientBlocks(p.item.blocks, key, reversed);
	const [cx, cz] = footprintCenter(blocks);
	const origin = [p.origin[0] + p.center[0] - cx, p.origin[1], p.origin[2] + p.center[1] - cz];
	if (!inBounds(origin)) { showToast('There is no room to turn it here. Move it towards the middle first.', 'error'); return; }
	setState({ placement: { ...p, blocks, orient: { key, reversed }, center: [cx, cz], origin, mesh: null } });
}

export function cancelPlacement() {
	if (state.placement) setState({ placement: null });
}

/** Move the preview by whole cells (keyboard). */
export function movePlacement(delta) {
	const p = state.placement;
	if (!p) return;
	const origin = p.origin.map((n, i) => n + (delta[i] || 0));
	if (inBounds(origin)) setState({ placement: { ...p, origin } });
}

/** The pointer is over cell (hx, hz) at the current height: centre the preview on it. */
export function hoverPlacement(hx, hz) {
	const p = state.placement;
	if (!p) return;
	const origin = [hx - p.center[0], p.origin[1], hz - p.center[1]];
	if (inBounds(origin) && (origin[0] !== p.origin[0] || origin[2] !== p.origin[2])) setState({ placement: { ...p, origin } });
}

/** The preview mesh arrives from the worker; ignored if the preset was turned or replaced meanwhile. */
export function setPlacementMesh(blocks, mesh) {
	const p = state.placement;
	if (p && p.blocks === blocks) setState({ placement: { ...p, mesh } });
}

/** Put the preset where the preview is. Bricks in those cells are replaced; one undo step. */
export function confirmPlacement() {
	const p = state.placement;
	if (!p) return false;
	const r = insertPreset(state.part, p.blocks, p.origin, MAX_BLOCKS);
	if (!r.placed) {
		showToast(r.reason === 'limit' ? `That would exceed the ${MAX_BLOCKS} block limit.` : 'That position is outside the allowed area.', 'error');
		return false;
	}
	commit(r.part);
	setState({ placement: null });
	showToast(`${p.item.name} placed`);
	return true;
}

// ---------------------------------------------------------------- dialogs

export function openDialog(dialog) { setState({ dialog }); }
export function closeDialog() { if (state.dialog) setState({ dialog: null }); }

export function mirror() {
	commit(mirrorX(state.part));
}

/** Remove every block. It is an edit of the current project (undoable), so the project and its name stay. */
export function clearPart() {
	commit({ ...emptyPart(state.part.name), measurements: state.part.measurements });
	setState({ cursor: [0, 0, 0] });
}

export function setName(name) {
	// Renaming is not an undo step, but it does make the design dirty.
	setState((s) => ({ part: { ...s.part, name }, dirty: true }));
}

export function setDisplayStyle(displayStyle) { setState({ displayStyle }); }

export const STYLE_ORDER = ['contour', 'solid', 'wireframe', 'xray', 'realistic'];
export const PART_COLORS = [
	{ name: 'Steel', value: '#aab7cc' }, { name: 'Blue', value: '#2f62c9' }, { name: 'White', value: '#f1f2f4' }, { name: 'Orange', value: '#f08a1c' },
	{ name: 'Red', value: '#c8281e' }, { name: 'Yellow', value: '#ffc800' }, { name: 'Green', value: '#1f9d3a' },
	{ name: 'Black', value: '#26292e' },
];
export const RT_QUALITIES = ['draft', 'good', 'best'];
export function setRtQuality(rtQuality) {
	if (RT_QUALITIES.includes(rtQuality)) setState({ rtQuality });
}
export function setPartColor(partColor) {
	if (PART_COLORS.some((c) => c.value === partColor)) setState({ partColor });
}
/** Pass a '#rrggbb' colour, or null to go back to the style's own backdrop. */
export function setBgColor(bgColor) {
	if (bgColor === null || /^#[0-9a-f]{6}$/i.test(bgColor)) setState({ bgColor: bgColor && bgColor.toLowerCase() });
}
export function cycleDisplayStyle() {
	setState((s) => ({ displayStyle: STYLE_ORDER[(STYLE_ORDER.indexOf(s.displayStyle) + 1) % STYLE_ORDER.length] }));
}

export function toggleBounds() { setState((s) => ({ showBounds: !s.showBounds })); }

export function toggleSection(id) {
	setState((s) => ({ sections: { ...s.sections, [id]: !s.sections[id] } }));
}

/** Open a sidebar section and scroll it into view (used by the toolbar). */
export function revealSection(id) {
	setState((s) => ({ sections: { ...s.sections, [id]: true } }));
	requestAnimationFrame(() => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** Replace the whole part (open, catalog, share link). Starts a fresh history. */
export function loadPart(part, { designId = null, dirty = false, nameChosen = part.name !== DEFAULT_NAME } = {}) {
	setState((s) => ({
		part, designId, dirty, nameChosen, past: [], future: [], cursor: [0, 0, 0], placement: null, viewNonce: s.viewNonce + 1,
	}));
}

export function markSaved(designId) { setState({ designId, dirty: false, nameChosen: true }); }

// ---------------------------------------------------------------- misc

let toastTimer = null;
export function showToast(text, kind = 'info') {
	clearTimeout(toastTimer);
	setState({ toast: { text, kind } });
	toastTimer = setTimeout(() => setState({ toast: null }), kind === 'error' ? 6000 : 2500);
}

export function frameView() { setState((s) => ({ viewNonce: s.viewNonce + 1 })); }
