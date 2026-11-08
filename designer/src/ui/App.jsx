import Viewport from '../render/Viewport.jsx';
import Icon, { Logo } from './Icon.jsx';
import { useState, useRef, useEffect } from 'react';
import { useStore, cycleDisplayStyle, frameView, toggleBounds, revealSection, cancelPlacement, confirmPlacement, setBgColor, openDialog } from '../state/store.js';
import { startNewProject, openProjectList, saveProject, startSaveAs, renameProject } from '../state/actions.js';
import { DialogHost } from './dialogs.jsx';
import { PartPanel, EditBlockPanel, CatalogPanel, MeasurementsPanel } from './panels.jsx';
import { useKeyboard } from './useKeyboard.js';
import { toUserSize } from '../model/axes.js';

const STYLE_LABEL = { contour: 'Contour', solid: 'Solid', wireframe: 'Wireframe', xray: 'X-ray', realistic: 'Realistic (ray traced)' };

/** Project name at the top right. Click to rename (a saved project is renamed on the server at once). */
function ProjectChip() {
	const name = useStore((s) => s.part.name);
	const designId = useStore((s) => s.designId);
	const dirty = useStore((s) => s.dirty);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState('');
	const finished = useRef(false);

	const begin = () => { finished.current = false; setDraft(name); setEditing(true); };
	const finish = async (commit) => {
		if (finished.current) return;
		finished.current = true;
		if (commit) await renameProject(draft);
		setEditing(false);
	};
	const state = designId ? (dirty ? 'Unsaved changes' : 'Saved') : 'Not saved yet';

	if (editing) {
		return (
			<span className="project editing">
				<Icon name="file" size={18} />
				<input
					className="project-input" aria-label="Project name" value={draft} maxLength={120}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } }}
					onBlur={() => finish(true)}
					ref={(el) => { if (el && !el.dataset.f) { el.dataset.f = '1'; el.focus(); el.select(); } }}
				/>
			</span>
		);
	}
	return (
		<button className="project" onClick={begin} title="Click to rename this project" aria-label={`Project ${name}, ${state}. Click to rename.`}>
			<Icon name="file" size={18} />
			<span className="pname">{name}</span>
			<span className={`pstate ${designId && !dirty ? 'ok' : 'warn'}`}>{state}</span>
			<Icon name="edit" size={15} className="pedit" />
		</button>
	);
}

function Header() {
	const user = useStore((s) => s.user);
	const urls = useStore((s) => s.urls);
	const csrf = useStore((s) => s.csrf);
	return (
		<header className="topbar">
			<a className="brand" href={urls.home || '/'} aria-label="BitBrick home">
				<Logo height={44} />
				<span>BitBrick</span>
			</a>
			<span className="sep" aria-hidden="true" />
			<nav className="menu" aria-label="Project">
				<button className="menu-btn" onClick={startNewProject}><Icon name="filePlus" size={18} />New</button>
				<button className="menu-btn" onClick={openProjectList}><Icon name="folder" size={18} />Open</button>
				<button className="menu-btn primary" onClick={saveProject}><Icon name="save" size={18} />Save</button>
				<button className="menu-btn" onClick={startSaveAs}><Icon name="saveAs" size={18} />Save as</button>
				<button className="menu-btn" onClick={() => openDialog({ type: 'help' })}><Icon name="help" size={18} />Help</button>
			</nav>
			<span className="spacer" />
			{user && (
				<nav className="usernav" aria-label="Account">
					<span className="who" title={user.email}>{user.name}</span>
					{urls.admin && <a className="nav-yellow" href={urls.admin}>Admin</a>}
					<form method="post" action={urls.logout}>
						<input type="hidden" name="_token" value={csrf} />
						<button className="nav-link" type="submit">Sign out</button>
					</form>
				</nav>
			)}
			<ProjectChip />
		</header>
	);
}

const BG_PRESETS = [
	{ name: 'Blueprint blue', value: '#153a86' }, { name: 'Dark', value: '#1b1f27' }, { name: 'Graphite', value: '#4a5160' },
	{ name: 'Light grey', value: '#d3d8e0' }, { name: 'White', value: '#ffffff' }, { name: 'Sand', value: '#e9dfc9' },
	{ name: 'Mint', value: '#bfe3d0' }, { name: 'Sky', value: '#9cc8f0' },
];

/** Toolbar button that opens a small panel to pick the viewport background colour. */
function BackgroundTool() {
	const bg = useStore((s) => s.bgColor);
	const style = useStore((s) => s.displayStyle);
	const [open, setOpen] = useState(false);
	const box = useRef(null);
	useEffect(() => {
		if (!open) return undefined;
		const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
		const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
		document.addEventListener('pointerdown', away);
		document.addEventListener('keydown', esc, true);
		return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true); };
	}, [open]);
	const defaultName = style === 'realistic' ? 'HDR picture' : 'Blueprint';
	const label = `Background colour: ${bg || defaultName} (click to change)`;
	return (
		<div className="bg-tool" ref={box}>
			<button className={`tool ${open ? 'on' : ''}`} title={label} aria-label={label} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
				<Icon name="palette" size={26} />
			</button>
			{open && (
				<div className="bg-pop" role="group" aria-label="Background colour">
					<div className="swatches">
						{BG_PRESETS.map((c) => (
							<button
								key={c.value} className="swatch" style={{ background: c.value }} title={c.name} aria-label={c.name}
								aria-pressed={bg === c.value} onClick={() => setBgColor(c.value)}
							/>
						))}
					</div>
					<label className="bg-custom">
						<span>Custom</span>
						<input type="color" value={bg || '#153a86'} aria-label="Custom background colour" onChange={(e) => setBgColor(e.target.value)} />
					</label>
					<button className="btn small wide" disabled={!bg} onClick={() => setBgColor(null)}>
						{style === 'realistic' ? 'Use the HDR picture' : 'Use the default'}
					</button>
				</div>
			)}
		</div>
	);
}

function Toolbar() {
	const style = useStore((s) => s.displayStyle);
	const bounds = useStore((s) => s.showBounds);
	const tools = [
		{ icon: 'fit', label: 'Fit view', on: false, run: frameView },
		{ icon: 'style', label: `Display style: ${STYLE_LABEL[style]} (click to change)`, on: false, run: cycleDisplayStyle },
		{ icon: 'bounds', label: 'Show part bounds', on: bounds, run: toggleBounds, toggle: true },
		{ icon: 'background' },
		{ icon: 'gear', label: 'Measurements', on: false, run: () => revealSection('measurements') },
	];
	return (
		<div className="toolbar" role="toolbar" aria-label="View tools">
			{tools.map((t) => (t.icon === 'background' ? <BackgroundTool key="background" /> : (
				<button
					key={t.icon}
					className={`tool ${t.on ? 'on' : ''}`}
					title={t.label}
					aria-label={t.label}
					{...(t.toggle ? { 'aria-pressed': t.on } : {})}
					onClick={t.run}
				>
					<Icon name={t.icon} size={26} />
				</button>
			)))}
		</div>
	);
}

function StatusBar() {
	const mesh = useStore((s) => s.mesh);
	const status = useStore((s) => s.meshStatus);
	const error = useStore((s) => s.meshError);
	const rt = useStore((s) => s.rt);
	const style = useStore((s) => s.displayStyle);
	const count = useStore((s) => s.part.blocks.length);
	const max = useStore((s) => s.limits.maxBlocks);
	// X \u00D7 Y \u00D7 Z in the user's axes (Z is height)
	const size = mesh?.bbox ? toUserSize(mesh.bbox.max.map((v, i) => v - mesh.bbox.min[i])) : null;

	return (
		<div className="statusbar" role="status">
			<span className="stat"><Icon name="blocks" size={20} />{count} block{count === 1 ? '' : 's'}{count > max * 0.9 ? ` (limit ${max})` : ''}</span>
			{size && <span className="stat"><Icon name="cube" size={20} />{size.map((v) => v.toFixed(1)).join(' × ')} mm</span>}
			{mesh?.triangleCount > 0 && <span className="stat"><Icon name="volume" size={20} />{(mesh.volume / 1000).toFixed(2)} cm{'³'}</span>}
			{status === 'building' && <span className="stat dim">Building...</span>}
			{style === 'realistic' && rt.state === 'loading' && <span className="stat dim">Loading ray tracer...</span>}
			{style === 'realistic' && rt.state === 'tracing' && <span className="stat dim">Ray tracing {rt.samples} / {rt.max}</span>}
			{style === 'realistic' && rt.state === 'done' && <span className="stat">Ray traced, {rt.max} samples</span>}
			{style === 'realistic' && rt.state === 'unsupported' && <span className="stat dim">Fast preview (ray tracing unavailable)</span>}
			{status === 'error' && <span className="stat bad">Mesh error: {error}</span>}
			{status !== 'error' && mesh && mesh.triangleCount > 0 && !mesh.manifold && (
				<span className="stat bad">Not watertight ({mesh.status}): STL export is blocked</span>
			)}
		</div>
	);
}

/** Shown while a catalog preset is being positioned. */
function PlacementBanner() {
	const placement = useStore((s) => s.placement);
	if (!placement) return null;
	return (
		<div className="placing" role="status">
			<strong>Placing {placement.item.name}{placement.orient.key && ` (${placement.orient.reversed ? '-' : '+'}${placement.orient.key.toUpperCase()})`}</strong>
			<span>Move the mouse, <kbd>w</kbd>/<kbd>s</kbd> up and down, <kbd>x</kbd> <kbd>y</kbd> <kbd>z</kbd> turn it (again to reverse), click or <kbd>Enter</kbd> to place, <kbd>Esc</kbd> to cancel</span>
			<span className="placing-actions">
				<button className="btn small primary" onClick={confirmPlacement}>Place</button>
				<button className="btn small" onClick={cancelPlacement}>Cancel</button>
			</span>
		</div>
	);
}

function Toast() {
	const toast = useStore((s) => s.toast);
	if (!toast) return null;
	return <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.text}</div>;
}

/** Blueprint-style page decoration: yellow wedges and faded beams in the corners. */
function Decor() {
	return (
		<div className="decor" aria-hidden="true">
			<span className="wedge top" />
			<span className="wedge bottom" />
			<svg className="ghost-beam a" viewBox="0 0 220 70"><rect x="4" y="4" width="212" height="62" rx="31" /><circle cx="42" cy="35" r="14" /><circle cx="110" cy="35" r="14" /><circle cx="178" cy="35" r="14" /></svg>
			<svg className="ghost-beam b" viewBox="0 0 220 70"><rect x="4" y="4" width="212" height="62" rx="31" /><circle cx="42" cy="35" r="14" /><circle cx="110" cy="35" r="14" /><circle cx="178" cy="35" r="14" /></svg>
		</div>
	);
}

export default function App() {
	useKeyboard();
	const empty = useStore((s) => s.part.blocks.length === 0 && !s.placement);
	const style = useStore((s) => s.displayStyle);
	const bgColor = useStore((s) => s.bgColor);
	return (
		<div className="app">
			<Decor />
			<Header />
			<div className="body">
				<aside className="sidebar" aria-label="Part tools">
					<PartPanel />
					<EditBlockPanel />
					<CatalogPanel />
					<MeasurementsPanel />
				</aside>
				<main className="stage" data-style={style} data-custom-bg={bgColor ? '' : undefined} style={bgColor ? { background: bgColor } : undefined} tabIndex={-1} aria-label="3D view">
					<Viewport />
					<Toolbar />
					{empty && (
						<div className="empty">
							<strong>Start your part</strong>
							<span>Choose a block type on the left or press <kbd>Enter</kbd> to place the first block,
								or open a preset from the catalog.</span>
						</div>
					)}
					<PlacementBanner />
					<StatusBar />
				</main>
			</div>
			<Toast />
			<DialogHost />
		</div>
	);
}
