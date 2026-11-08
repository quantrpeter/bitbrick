import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useStore, closeDialog, setState, showToast, getState } from '../state/store.js';
import { createProject, saveProjectAs, openDesign, renameProject, copyText } from '../state/actions.js';
import { listDesigns, deleteDesign, shareDesign, unshareDesign, renameDesign } from '../api/api.js';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Accessible modal: labelled, closes on Esc or a click outside, keeps Tab inside, returns focus afterwards. */
function Modal({ title, onClose, wide = false, children }) {
	const box = useRef(null);
	useEffect(() => {
		const before = document.activeElement;
		const first = box.current?.querySelector('[data-autofocus]') || box.current?.querySelector(FOCUSABLE) || box.current;
		first?.focus();
		if (first?.select) first.select();
		// Back to the working area, not to the menu button that opened the dialog: otherwise the next Enter (place a
		// block) would press that button again. The area is a focus target but not a control, so editing keys keep working.
		return () => {
			const stage = document.querySelector('.stage');
			if (stage) stage.focus({ preventScroll: true });
			else before?.focus?.();
		};
	}, []);

	// Esc is handled for the whole document: when the focused button disappears (after a delete, say) focus drops to the
	// page, and Esc must still close the dialog. Focus that falls out of the dialog is pulled back in.
	useEffect(() => {
		const onDocKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
		document.addEventListener('keydown', onDocKey);
		return () => document.removeEventListener('keydown', onDocKey);
	}, [onClose]);

	const onFocusOut = (e) => {
		if (e.relatedTarget) return; // moving to another element (the Tab trap covers leaving the dialog)
		requestAnimationFrame(() => {
			if (box.current && !box.current.contains(document.activeElement)) box.current.focus({ preventScroll: true });
		});
	};

	const onKeyDown = (e) => {
		if (e.key !== 'Tab') return;
		const items = [...box.current.querySelectorAll(FOCUSABLE)];
		if (!items.length) { e.preventDefault(); return; }
		const [first, last] = [items[0], items[items.length - 1]];
		const active = document.activeElement;
		if (e.shiftKey && (active === first || active === box.current)) { e.preventDefault(); last.focus(); }
		else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
	};

	return (
		<div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
			<div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={box} tabIndex={-1} onKeyDown={onKeyDown} onBlur={onFocusOut}>
				<div className="modal-head">
					<span className="tab"><span id="dialog-title">{title}</span></span>
					<button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
				</div>
				<div className="modal-body">{children}</div>
			</div>
		</div>
	);
}

/** Asks for a project name. */
function NameDialog({ title, label, initial, submitLabel, warning, onSubmit }) {
	const [name, setName] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const submit = async (e) => {
		e.preventDefault();
		if (!name.trim()) { setError('Enter a name.'); return; }
		setBusy(true);
		await onSubmit(name);
		setBusy(false);
	};

	return (
		<Modal title={title} onClose={closeDialog}>
			<form onSubmit={submit} className="stack">
				{warning && <p className="warning" role="alert">{warning}</p>}
				<label className="stack tight">
					<span>{label}</span>
					<input
						type="text" value={name} maxLength={120} data-autofocus placeholder="Project name"
						aria-invalid={!!error} aria-describedby={error ? 'name-error' : undefined}
						onChange={(e) => { setName(e.target.value); setError(''); }}
					/>
				</label>
				{error && <p className="field-error" id="name-error" role="alert">{error}</p>}
				<div className="modal-actions">
					<button type="button" className="btn" onClick={closeDialog}>Cancel</button>
					<button type="submit" className="btn primary" disabled={busy}>{submitLabel}</button>
				</div>
			</form>
		</Modal>
	);
}

export function NewProjectDialog() {
	const unsaved = useStore((s) => (s.dirty || !s.designId) && s.part.blocks.length > 0);
	return (
		<NameDialog
			title="New project" label="Name of the new project" initial="Untitled project"
			submitLabel={unsaved ? 'Discard and create' : 'Create'}
			warning={unsaved ? 'The current project has unsaved changes. Creating a new project discards them. Save first if you want to keep them.' : ''}
			onSubmit={createProject}
		/>
	);
}

export function SaveAsDialog() {
	const { part, designId, nameChosen } = getState();
	const initial = designId ? `${part.name} copy`.slice(0, 120) : nameChosen ? part.name : '';
	return (
		<NameDialog
			title="Save as" label={designId ? 'Save a copy as' : 'Project name'} initial={initial} submitLabel="Save"
			onSubmit={saveProjectAs}
		/>
	);
}

const formatDate = (iso) => {
	try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
};

/** Lists every saved project: open, rename, share link and delete. */
export function OpenDialog() {
	const urls = useStore((s) => s.urls);
	const currentId = useStore((s) => s.designId);
	const unsaved = useStore((s) => s.dirty && s.part.blocks.length > 0);
	const [items, setItems] = useState(null);
	const [error, setError] = useState('');
	const [editing, setEditing] = useState(null); // { id, name }
	const [deleting, setDeleting] = useState(null);
	const [busy, setBusy] = useState(false);

	const refresh = async () => {
		try { setItems(await listDesigns(urls.designs)); setError(''); } catch (e) { setError(e.message); setItems([]); }
	};
	useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

	const open = async (d) => {
		if (d.id === currentId) { closeDialog(); return; }
		setBusy(true);
		if (await openDesign(d.id)) closeDialog();
		setBusy(false);
	};

	const committed = useRef(null); // Enter and the following blur must not rename twice
	const commitRename = async () => {
		const edit = editing;
		if (!edit || committed.current === edit) return;
		committed.current = edit;
		setEditing(null);
		const name = edit.name.trim();
		if (!name) { showToast('The name cannot be blank.', 'error'); return; }
		if (edit.id === currentId) await renameProject(name);
		else {
			try { await renameDesign(urls.designs, edit.id, name); } catch (e) { showToast(e.message, 'error'); }
		}
		refresh();
	};

	const toggleShare = async (d) => {
		try {
			if (d.is_public) {
				await unshareDesign(urls.designs, d.id);
				showToast('Share link turned off');
			} else {
				const r = await shareDesign(urls.designs, d.id);
				showToast((await copyText(r.url)) ? 'Share link copied (signed-in users with the link can open it)' : r.url);
			}
			refresh();
		} catch (e) { showToast(e.message, 'error'); }
	};

	const remove = async (d) => {
		setDeleting(null);
		try {
			await deleteDesign(urls.designs, d.id);
			if (d.id === currentId) {
				// the project stays open in the editor, but is no longer saved anywhere
				setState({ designId: null, dirty: true });
				window.history.replaceState(null, '', '/designer');
			}
			showToast(`Deleted "${d.name}"`);
			refresh();
		} catch (e) { showToast(e.message, 'error'); }
	};

	// Esc cancels an inline rename or a pending delete first; only then does it close the dialog
	const pendingRef = useRef(false);
	pendingRef.current = !!(editing || deleting);
	useEffect(() => {
		const onEsc = (e) => {
			if (e.key === 'Escape' && pendingRef.current) {
				e.stopImmediatePropagation(); // runs before the dialog's own document handler
				setEditing(null);
				setDeleting(null);
			}
		};
		window.addEventListener('keydown', onEsc, true);
		return () => window.removeEventListener('keydown', onEsc, true);
	}, []);

	return (
		<Modal title="Open project" onClose={closeDialog} wide>
			<div className="stack">
				{unsaved && <p className="warning" role="alert">The current project has unsaved changes. Opening another project discards them.</p>}
				{error && <p className="field-error" role="alert">{error}</p>}
				{items === null && !error && <p className="hint">Loading projects...</p>}
				{items && !items.length && !error && <p className="hint">No saved projects yet. Use Save to store this one.</p>}
				<ul className="projects">
					{(items || []).map((d) => (
						<li key={d.id} className={d.id === currentId ? 'current' : ''}>
							{d.thumbnail ? <img src={d.thumbnail} alt="" width="64" height="48" /> : <span className="noimg" />}
							<div className="project-main">
								{editing?.id === d.id ? (
									<input
										type="text" className="inline-input" value={editing.name} maxLength={120} data-autofocus aria-label={`New name for ${d.name}`}
										onChange={(e) => setEditing({ ...editing, name: e.target.value })}
										onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } }}
										onBlur={commitRename}
										ref={(el) => { if (el && !el.dataset.f) { el.dataset.f = '1'; el.focus(); el.select(); } }}
									/>
								) : (
									<button className="link strong" disabled={busy} onClick={() => open(d)} title="Open this project">{d.name}</button>
								)}
								<span className="hint">
									{formatDate(d.updated_at)}{d.is_public ? ' · shared' : ''}{d.id === currentId ? ' · open now' : ''}
								</span>
							</div>
							<div className="project-actions">
								{deleting === d.id ? (
									<>
										<span className="hint">Delete?</span>
										<button className="link danger" onClick={() => remove(d)}>Yes</button>
										<button className="link" onClick={() => setDeleting(null)}>No</button>
									</>
								) : (
									<>
										<button className="link" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing({ id: d.id, name: d.name })} aria-label={`Rename ${d.name}`}>Rename</button>
										<button className="link" onClick={() => toggleShare(d)} aria-label={`${d.is_public ? 'Stop sharing' : 'Share'} ${d.name}`}>{d.is_public ? 'Unshare' : 'Share'}</button>
										<button className="link danger" onClick={() => setDeleting(d.id)} aria-label={`Delete ${d.name}`}>Delete</button>
									</>
								)}
							</div>
						</li>
					))}
				</ul>
			</div>
		</Modal>
	);
}

/** What BitBrick is for and every keyboard shortcut (opened from "Help" in the top bar). */
export function HelpDialog() {
	return (
		<Modal title="Help" onClose={closeDialog}>
			<div className="stack">
				<p className="hint">Design pin-and-axle building parts for 3D printing. Your designs are saved to your account.</p>
				<dl className="keys">
					<dt><kbd>1</kbd>-<kbd>6</kbd></dt><dd>set type</dd>
					<dt><kbd>x</kbd> <kbd>y</kbd> <kbd>z</kbd></dt><dd>set orientation (X, Y flat, Z up)</dd>
					<dt><kbd>h</kbd> <kbd>r</kbd></dt><dd>half block / rounded edges</dd>
					<dt><kbd>{'←'}</kbd> <kbd>{'→'}</kbd></dt><dd>move cursor along X</dd>
					<dt><kbd>{'↑'}</kbd> <kbd>{'↓'}</kbd></dt><dd>move cursor along Y (away / towards you)</dd>
					<dt><kbd>w</kbd> <kbd>s</kbd></dt><dd>move cursor up and down (Z)</dd>
					<dt><kbd>Enter</kbd></dt><dd>place a block</dd>
					<dt><kbd>Del</kbd> <kbd>Backspace</kbd></dt><dd>remove block</dd>
					<dt><kbd>Ctrl/Cmd</kbd>+<kbd>Z</kbd></dt><dd>undo (add Shift to redo)</dd>
					<dt><kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd></dt><dd>save</dd>
				</dl>
				<p className="hint">Click the 3D view to move the cursor. Shift+click selects the cell next to the clicked face.</p>
				<p className="hint small">BitBrick is an independent project and is not affiliated with any brand owner.</p>
				<div className="modal-actions">
					<button type="button" className="btn primary" onClick={closeDialog} data-autofocus>Close</button>
				</div>
			</div>
		</Modal>
	);
}

export function DialogHost() {
	const dialog = useStore((s) => s.dialog);
	if (!dialog) return null;
	if (dialog.type === 'new') return <NewProjectDialog />;
	if (dialog.type === 'saveAs') return <SaveAsDialog />;
	if (dialog.type === 'open') return <OpenDialog />;
	if (dialog.type === 'help') return <HelpDialog />;
	return null;
}
