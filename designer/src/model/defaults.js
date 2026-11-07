// Measurement definitions. Every entry here is actually used by the geometry
// generator (src/geometry/build.js); defaults are in millimetres.
// Measurements belong to individual bricks. Each entry says which brick types it applies to; the
// Measurements panel shows only those for the selected brick.
const BODY = ['pinHole', 'axleHole', 'solid'];
export const MEASUREMENTS = [
	{ key: 'edgeMargin', label: 'Edge Margin', unit: 'mm', default: 0.2, min: 0, max: 1, step: 0.05, group: 'Body', types: BODY,
		help: 'Outer faces of this brick are pulled in by this amount so parts fit side by side.' },
	{ key: 'cornerRadius', label: 'Corner Radius', unit: 'mm', default: 3.4, min: 0.2, max: 6, step: 0.1, group: 'Body', types: BODY,
		help: 'Radius of this brick\'s rounded edges (used when Edges is set to Rounded).' },

	{ key: 'pinHoleDiameter', label: 'Pin Hole Diameter', unit: 'mm', default: 4.95, min: 3, max: 7, step: 0.01, group: 'Pin hole', types: ['pinHole'],
		help: 'Through hole for a pin. Tune for your printer.' },
	{ key: 'counterboreDiameter', label: 'Counterbore Diameter', unit: 'mm', default: 6.2, min: 3, max: 8, step: 0.05, group: 'Pin hole', types: ['pinHole'],
		help: 'Wider opening at both ends of the hole. Must be larger than the hole to take effect.' },
	{ key: 'counterboreDepth', label: 'Counterbore Depth', unit: 'mm', default: 0.8, min: 0, max: 2, step: 0.05, group: 'Pin hole', types: ['pinHole'] },

	{ key: 'axleHoleSpan', label: 'Axle Hole Span', unit: 'mm', default: 4.9, min: 3, max: 7, step: 0.01, group: 'Axle hole', types: ['axleHole'],
		help: 'Tip to tip width of the cross shaped hole.' },
	{ key: 'axleHoleSize', label: 'Axle Hole Arm Width', unit: 'mm', default: 2.02, min: 1, max: 3.5, step: 0.01, group: 'Axle hole', types: ['axleHole'] },

	{ key: 'pinDiameter', label: 'Pin Diameter', unit: 'mm', default: 4.63, min: 3, max: 6.5, step: 0.01, group: 'Pin', types: ['pin'] },
	{ key: 'axleSpan', label: 'Axle Span', unit: 'mm', default: 4.7, min: 3, max: 6.5, step: 0.01, group: 'Axle', types: ['axle'],
		help: 'Tip to tip width of the axle.' },
	{ key: 'axleArmWidth', label: 'Axle Arm Width', unit: 'mm', default: 1.8, min: 1, max: 3.5, step: 0.01, group: 'Axle', types: ['axle'] },

	{ key: 'ballDiameter', label: 'Ball Diameter', unit: 'mm', default: 6, min: 3, max: 9, step: 0.1, group: 'Ball joint', types: ['ballJoint'] },
	{ key: 'gearTeeth', label: 'Teeth', unit: '', default: 16, min: 8, max: 64, step: 1, integer: true, group: 'Gear', types: ['gear'],
		help: 'Number of teeth. The tooth size is fixed, so a gear with N teeth is N mm across at the pitch circle (8 mm per grid cell): two gears mesh when the distance between their centres is half the sum of their teeth.' },
	{ key: 'ballBaseDiameter', label: 'Ball Base Diameter', unit: 'mm', default: 3.2, min: 1.5, max: 6, step: 0.1, group: 'Ball joint', types: ['ballJoint'] },
];

// Fixed for the whole part, so they cannot be set per brick: the pitch between cells and the smoothness of round shapes.
// There is no editor for them any more; older designs that stored overrides keep working (see resolveMeasurements).
export const PART_LEVEL = [
	{ key: 'gridUnit', label: 'Grid Unit', unit: 'mm', default: 8, min: 4, max: 20, step: 0.1 },
	{ key: 'subdivisionsPerQuarter', label: 'Subdivisions Per Quarter', unit: '', default: 8, min: 2, max: 32, step: 1, integer: true },
];

const ALL = [...PART_LEVEL, ...MEASUREMENTS];
export const SPEC = Object.fromEntries(ALL.map((m) => [m.key, m]));

export const DEFAULT_MEASUREMENTS = Object.fromEntries(ALL.map((m) => [m.key, m.default]));

/** Defaults overlaid with the part's overrides; unknown keys and bad values are ignored. */
export function resolveMeasurements(overrides = {}) {
	const out = { ...DEFAULT_MEASUREMENTS };
	for (const [k, v] of Object.entries(overrides || {})) {
		const spec = SPEC[k];
		if (spec && Number.isFinite(v) && v >= spec.min && v <= spec.max) out[k] = v;
	}
	return out;
}

/** Returns an error message, or null when the value is acceptable. */
export function validateMeasurement(key, value) {
	const spec = SPEC[key];
	if (!spec) return 'Unknown setting';
	if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number';
	if (spec.integer && !Number.isInteger(value)) return 'Enter a whole number';
	if (value < spec.min || value > spec.max) return `Must be between ${spec.min} and ${spec.max}`;
	return null;
}

/** Keeps only overrides that differ from the defaults (short URLs, stable saves). */
export function sparseMeasurements(values = {}) {
	const out = {};
	for (const [k, v] of Object.entries(values)) {
		if (SPEC[k] && v !== SPEC[k].default && validateMeasurement(k, v) === null) out[k] = v;
	}
	return out;
}

/** Measurement definitions that apply to a brick type, in display order. */
export function measurementsForType(type) {
	return MEASUREMENTS.filter((m) => m.types.includes(type));
}

/** Keys a brick of this type may override. */
export function relevantKeys(type) {
	return new Set(measurementsForType(type).map((m) => m.key));
}

/** Only the overrides that make sense for the type and are valid; undefined when nothing is left. */
export function cleanBlockMeasurements(type, overrides) {
	const keep = relevantKeys(type);
	const out = {};
	for (const [k, v] of Object.entries(overrides || {})) {
		if (keep.has(k) && validateMeasurement(k, v) === null) out[k] = v;
	}
	return Object.keys(out).length ? out : undefined;
}

/**
 * The effective measurements of one brick: built-in defaults, then the part's legacy whole-part overrides
 * (older saved designs), then the brick's own overrides.
 */
export function measurementsForBlock(part, block) {
	return resolveMeasurements({ ...(part.measurements || {}), ...(block.measurements || {}) });
}
