import { useEffect, useMemo, useState } from 'react';
import {
	useStore, applyBrush, removeAtCursor, clearPart, setDisplayStyle, undo, redo, mirror,
	setMeasurementsAt, setMeasurementsForType, startPlacement, cancelPlacement, showToast, frameView, toggleSection,
	setPartColor, PART_COLORS, setRtQuality,
} from '../state/store.js';
import { QUALITY } from '../render/raytrace.js';
import { cachedThumbnail, requestThumbnail } from '../render/thumbnails.js';
import Icon from './Icon.jsx';
import { toUserCell } from '../model/axes.js';
import { saveStl, shareByLink } from '../state/actions.js';
import { BLOCK_TYPES, TYPE_LABELS, blockAt } from '../model/part.js';
import { resolveMeasurements, validateMeasurement, measurementsForType, measurementsForBlock } from '../model/defaults.js';
import { catalog, CATEGORIES, searchCatalog } from '../model/catalog.js';

export function Section({ id, title, icon, children }) {
	const open = useStore((st) => st.sections[id]);
	return (
		<section className="card" id={`section-${id}`}>
			<button className="card-head" aria-expanded={open} aria-controls={`body-${id}`} onClick={() => toggleSection(id)}>
				<span className="tab"><Icon name={icon} size={22} /><span>{title}</span></span>
				<Icon name="chevron" size={22} className={`chev ${open ? '' : 'closed'}`} />
			</button>
			{open && <div className="card-body" id={`body-${id}`}>{children}</div>}
		</section>
	);
}

function Segmented({ label, options, value, onChange }) {
	return (
		<div className="row">
			<span className="row-label" id={`seg-${label}`}>{label}</span>
			<div className="pills" role="group" aria-labelledby={`seg-${label}`}>
				{options.map((o) => (
					<button
						key={o.value}
						className={`pill ${value === o.value ? 'on' : ''} ${o.className || ''}`}
						aria-pressed={value === o.value}
						onClick={() => onChange(o.value)}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- Part

export function PartPanel() {
	const part = useStore((s) => s.part);
	const style = useStore((s) => s.displayStyle);
	const partColor = useStore((s) => s.partColor);
	const rtQuality = useStore((s) => s.rtQuality);
	const canUndo = useStore((s) => s.past.length > 0);
	const canRedo = useStore((s) => s.future.length > 0);

	const clear = () => {
		if (!part.blocks.length || window.confirm('Remove all blocks from this part?')) clearPart();
	};

	return (
		<Section id="part" title="Part" icon="cube">
			<div className="buttons three">
				<button className="btn" onClick={clear}><Icon name="clear" />Clear</button>
				<button className="btn" onClick={shareByLink}><Icon name="share" />Share</button>
				<button className="btn" onClick={saveStl}><Icon name="download" />Save STL</button>
			</div>
			<div className="buttons">
				<button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)"><Icon name="undo" />Undo</button>
				<button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)"><Icon name="redo" />Redo</button>
				<button className="btn" onClick={mirror} disabled={!part.blocks.length} title="Mirror along X"><Icon name="mirror" />Mirror</button>
				<button className="btn" onClick={frameView} title="Fit the part in the view"><Icon name="fit" />Fit view</button>
			</div>
			<label className="row">
				<span className="row-label">Display style</span>
				<select value={style} onChange={(e) => setDisplayStyle(e.target.value)}>
					<option value="contour">Contour</option>
					<option value="solid">Solid</option>
					<option value="wireframe">Wireframe</option>
					<option value="xray">X-ray</option>
					<option value="realistic">Realistic (ray traced)</option>
				</select>
			</label>
			{style === 'realistic' && (
				<label className="row">
					<span className="row-label">Quality</span>
					<select value={rtQuality} onChange={(e) => setRtQuality(e.target.value)}>
						{Object.entries(QUALITY).map(([k, q]) => <option key={k} value={k}>{q.label}</option>)}
					</select>
				</label>
			)}
			{(
				<div className="row">
					<span className="row-label" id="colour-label">Colour</span>
					<div className="swatches" role="group" aria-labelledby="colour-label">
						{PART_COLORS.map((c) => (
							<button
								key={c.value}
								className="swatch"
								style={{ background: c.value }}
								title={c.name}
								aria-label={c.name}
								aria-pressed={partColor === c.value}
								onClick={() => setPartColor(c.value)}
							/>
						))}
					</div>
				</div>
			)}
		</Section>
	);
}

// ---------------------------------------------------------------- Edit block

export function EditBlockPanel() {
	const brush = useStore((s) => s.brush);
	const part = useStore((s) => s.part);
	const cursor = useStore((s) => s.cursor);
	const existing = blockAt(part, cursor);

	return (
		<Section id="edit" title="Edit Block" icon="gear">
			<p className="hint">
				Cell {toUserCell(cursor).join(', ')} (X, Y, Z): {existing ? 'edit the selected block.' : 'empty. Choose a type to place a block here.'}
			</p>
			<div className="row top">
				<span className="row-label" id="type-label">Type</span>
				<div className="type-grid" role="group" aria-labelledby="type-label">
					{BLOCK_TYPES.map((t, i) => (
						<button
							key={t}
							className={`type ${brush.type === t && existing ? 'on' : ''}`}
							aria-pressed={brush.type === t && !!existing}
							title={`${TYPE_LABELS[t]} (key ${i + 1})`}
							onClick={() => applyBrush({ type: t })}
						>
							<Icon name={t} size={24} />
							<span>{TYPE_LABELS[t]}</span>
						</button>
					))}
				</div>
			</div>
			<Segmented
				label="Orientation"
				value={brush.axis}
				onChange={(v) => applyBrush({ axis: v })}
				options={[
					// Labels are the user's axes (X, Y flat, Z up); values are the stored axes, see model/axes.js.
					{ value: 'x', label: 'X', className: 'ax-x' },
					{ value: 'z', label: 'Y', className: 'ax-y' },
					{ value: 'y', label: 'Z', className: 'ax-z' },
				]}
			/>
			<Segmented
				label="Size"
				value={brush.size}
				onChange={(v) => applyBrush({ size: v })}
				options={[{ value: 'full', label: 'Full Block' }, { value: 'half', label: 'Half Block' }]}
			/>
			<Segmented
				label="Edges"
				value={brush.rounded ? 'rounded' : 'sharp'}
				onChange={(v) => applyBrush({ rounded: v === 'rounded' })}
				options={[{ value: 'rounded', label: 'Rounded' }, { value: 'sharp', label: 'Not Rounded' }]}
			/>
			<button className="btn wide" onClick={removeAtCursor} disabled={!existing}><Icon name="trash" />Remove block</button>
		</Section>
	);
}

// ---------------------------------------------------------------- Catalog

function FlatThumb({ blocks }) {
	// Top-down sketch: one square per column, the colour tells the hole type.
	const cells = useMemo(() => {
		const cols = new Map();
		for (const b of blocks) {
			const k = `${b.pos[0]},${b.pos[2]}`;
			if (!cols.has(k) || b.pos[1] >= cols.get(k).pos[1]) cols.set(k, b);
		}
		return [...cols.values()];
	}, [blocks]);
	const minX = Math.min(...cells.map((c) => c.pos[0]));
	const minZ = Math.min(...cells.map((c) => c.pos[2]));
	const w = Math.max(...cells.map((c) => c.pos[0])) - minX + 1;
	const h = Math.max(...cells.map((c) => c.pos[2])) - minZ + 1;
	const size = Math.max(w, h);
	const fill = { pinHole: 'var(--thumb-a)', axleHole: 'var(--thumb-b)', solid: 'var(--thumb-c)', pin: 'var(--thumb-d)', axle: 'var(--thumb-d)', gear: 'var(--thumb-b)', ballJoint: 'var(--thumb-d)' };
	return (
		<svg viewBox={`0 0 ${size} ${size}`} className="thumb" aria-hidden="true">
			<g transform={`translate(${(size - w) / 2} ${(size - h) / 2})`}>
				{cells.map((c) => (
					<g key={`${c.pos[0]},${c.pos[2]}`}>
						<rect x={c.pos[0] - minX + 0.06} y={c.pos[2] - minZ + 0.06} width={0.88} height={0.88} rx={0.18} fill={fill[c.type]} />
						{(c.type === 'pinHole' || c.type === 'axleHole') && (
							<circle cx={c.pos[0] - minX + 0.5} cy={c.pos[2] - minZ + 0.5} r={0.2} fill="var(--thumb-hole)" />
						)}
					</g>
				))}
			</g>
		</svg>
	);
}

/** The rendered 3D picture of a preset; the flat sketch shows until it is ready (or if it cannot be made). */
function Thumb({ item }) {
	const [url, setUrl] = useState(() => cachedThumbnail(item.id));
	useEffect(() => {
		if (url) return undefined;
		return requestThumbnail(item, setUrl);
	}, [item, url]);
	return (
		<span className="thumb-box">
			{url
				? <img className="thumb-img" src={url} alt="" width="144" height="96" draggable="false" />
				: <FlatThumb blocks={item.blocks} />}
		</span>
	);
}

export function CatalogPanel() {
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState('');
	const items = useMemo(() => searchCatalog(query, category), [query, category]);

	const placement = useStore((st) => st.placement);

	// Clicking a part does not add it: a transparent copy follows the mouse until a click places it.
	const pick = (e, item) => {
		e.currentTarget.blur(); // so Enter / w / s go to the view, not to this button
		if (placement?.item.id === item.id) cancelPlacement(); else startPlacement(item);
	};

	return (
		<Section id="catalog" title="Catalog" icon="layers">
			<label className="search">
				<Icon name="search" size={18} />
				<input type="search" placeholder="Search parts" aria-label="Search the catalog" value={query} onChange={(e) => setQuery(e.target.value)} />
			</label>
			<div className="chips" role="group" aria-label="Category">
				<button className={`chip ${category === '' ? 'on' : ''}`} onClick={() => setCategory('')}>All</button>
				{CATEGORIES.map((c) => (
					<button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
				))}
			</div>
			{!items.length && <p className="hint">Nothing matches "{query}".</p>}
			<div className="catalog">
				{items.map((item) => {
					const active = placement?.item.id === item.id;
					return (
						<div key={item.id} className={`item ${active ? 'on' : ''}`}>
							<button
								className="card-main"
								onClick={(e) => pick(e, item)}
								aria-pressed={active}
								title={active ? `Placing ${item.name}: click again to cancel` : `Place ${item.name}: move the mouse over the view, click to place`}
							>
								<Thumb item={item} />
								<span className="card-name">{item.name}</span>
							</button>
						</div>
					);
				})}
			</div>
			<p className="hint">{catalog.length} presets. Click a part, move the mouse over the view (w / s change the height), then click to place it. Esc cancels.</p>
		</Section>
	);
}

// ---------------------------------------------------------------- Measurements (one brick at a time)

const toText = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));

/** Measurements of the brick at the cursor. There are no whole-part settings: each brick has its own. */
export function MeasurementsPanel() {
	const part = useStore((s) => s.part);
	const cursor = useStore((s) => s.cursor);
	const block = blockAt(part, cursor);

	if (!block) {
		return (
			<Section id="measurements" title="Measurements" icon="size">
				<p className="hint">
					Measurements belong to individual bricks. Click a brick in the view, or move the cursor onto one, to edit its values.
				</p>
			</Section>
		);
	}
	// The form is rebuilt (not reset) whenever another brick is selected or this brick's saved values change,
	// so it can never show the previous brick's numbers.
	const signature = JSON.stringify([block.pos, block.type, block.measurements, part.measurements]);
	return (
		<Section id="measurements" title="Measurements" icon="size">
			<BrickMeasurements key={signature} part={part} block={block} />
		</Section>
	);
}

function BrickMeasurements({ part, block }) {
	const specs = measurementsForType(block.type);
	const base = resolveMeasurements(part.measurements);
	const effective = measurementsForBlock(part, block);
	const [draft, setDraft] = useState(() => toText(Object.fromEntries(specs.map((m) => [m.key, effective[m.key]]))));

	const parsed = Object.fromEntries(specs.map((m) => [m.key, draft[m.key] === '' || draft[m.key] === undefined ? NaN : Number(draft[m.key])]));
	const errors = Object.fromEntries(specs.map((m) => [m.key, validateMeasurement(m.key, parsed[m.key])]));
	const hasErrors = Object.values(errors).some(Boolean);
	const changed = specs.some((m) => parsed[m.key] !== effective[m.key]);
	const groups = [...new Set(specs.map((m) => m.group))];
	const typeLabel = TYPE_LABELS[block.type];
	const [X, Y, Z] = toUserCell(block.pos);
	const sameType = part.blocks.filter((b) => b.type === block.type).length;

	return (
		<>
			<p className="hint">
				This brick: <strong>{typeLabel}</strong> at {X}, {Y}, {Z}. Values are in millimetres and apply to this brick only.
			</p>
			{!specs.length && <p className="hint">A solid block has no measurements to tune.</p>}
			{groups.map((g) => (
				<fieldset key={g} className="group">
					<legend>{g}</legend>
					{specs.filter((m) => m.group === g).map((m) => (
						<div className="mrow" key={m.key}>
							<label htmlFor={`m-${m.key}`} title={m.help || ''}>{m.label}</label>
							<button
								className="link"
								disabled={draft[m.key] === String(base[m.key])}
								onClick={() => setDraft({ ...draft, [m.key]: String(base[m.key]) })}
							>
								Reset
							</button>
							<div className="num">
								<input
									id={`m-${m.key}`}
									type="number"
									inputMode="decimal"
									step={m.step}
									min={m.min}
									max={m.max}
									value={draft[m.key] ?? ''}
									aria-invalid={!!errors[m.key]}
									aria-describedby={errors[m.key] ? `e-${m.key}` : undefined}
									onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })}
								/>
								<span className="unit">{m.unit}</span>
							</div>
							{errors[m.key] && <div className="field-error" id={`e-${m.key}`} role="alert">{errors[m.key]}</div>}
						</div>
					))}
				</fieldset>
			))}
			{specs.length > 0 && (
				<>
					<div className="buttons">
						<button className="btn" onClick={() => setDraft(toText(Object.fromEntries(specs.map((m) => [m.key, base[m.key]]))))}>Reset all</button>
						<button className="btn primary" disabled={hasErrors || !changed} onClick={() => setMeasurementsAt(block.pos, parsed)}>Apply</button>
					</div>
					{sameType > 1 && (
						<button
							className="btn wide"
							disabled={hasErrors}
							title={`Give every ${typeLabel} brick these values`}
							onClick={() => { setMeasurementsForType(block.type, parsed); showToast(`Applied to ${sameType} ${typeLabel} bricks`); }}
						>
							Apply to all {sameType} {typeLabel} bricks
						</button>
					)}
				</>
			)}
		</>
	);
}
