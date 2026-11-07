// Compact, readable text encoding of a part, used for share links (URL hash).
//   v1~<name>~<blocks>~<measurements>
// blocks: "x.y.z.TAS" joined by "_", T = type letter, A = axis letter, S = f/h (+ "r" if rounded),
//         optionally followed by that brick's measurement overrides: "(pinHoleDiameter=5.1;edgeMargin=0.3)"
// Example: 0.0.0.pxf_1.0.0.axfr(axleHoleSpan=5)
import { BLOCK_TYPES, AXES, SCHEMA_VERSION, parsePart } from './part.js';
import { SPEC, sparseMeasurements, cleanBlockMeasurements } from './defaults.js';

const TYPE_CODE = { pinHole: 'p', axleHole: 'h', pin: 'n', axle: 'a', solid: 's', ballJoint: 'b' };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));

export function encodePart(part) {
	const blocks = part.blocks.map((b) => {
		const own = cleanBlockMeasurements(b.type, b.measurements);
		const suffix = own ? `(${Object.entries(own).map(([k, v]) => `${k}=${v}`).join(';')})` : '';
		return `${b.pos.join('.')}.${TYPE_CODE[b.type]}${b.axis}${b.size === 'half' ? 'h' : 'f'}${b.rounded ? 'r' : ''}${suffix}`;
	}).join('_');
	const meas = Object.entries(sparseMeasurements(part.measurements))
		.map(([k, v]) => `${k}:${v}`).join(',');
	// encodeURIComponent leaves "~" alone, but it is our field separator.
	const name = encodeURIComponent(part.name || '').replace(/~/g, '%7E');
	return ['v' + SCHEMA_VERSION, name, blocks, meas].join('~');
}

export function decodePart(text) {
	if (typeof text !== 'string') throw new Error('Bad link');
	const [ver, name = '', blocksText = '', measText = ''] = text.split('~');
	if (ver !== 'v' + SCHEMA_VERSION) throw new Error('Unsupported link version');

	const blocks = blocksText === '' ? [] : blocksText.split('_').map((token) => {
		const m = /^(-?\d+)\.(-?\d+)\.(-?\d+)\.([a-z])([xyz])([fh])(r?)(?:\(([A-Za-z;=.\d-]*)\))?$/.exec(token);
		if (!m || !CODE_TYPE[m[4]]) throw new Error('Bad block in link');
		const block = {
			pos: [Number(m[1]), Number(m[2]), Number(m[3])],
			type: CODE_TYPE[m[4]], axis: m[5], size: m[6] === 'h' ? 'half' : 'full', rounded: m[7] === 'r',
		};
		if (m[8]) {
			const own = {};
			for (const pair of m[8].split(';')) {
				const [k, v] = pair.split('=');
				if (SPEC[k] && Number.isFinite(Number(v))) own[k] = Number(v);
			}
			const clean = cleanBlockMeasurements(block.type, own);
			if (clean) block.measurements = clean;
		}
		return block;
	});

	const measurements = {};
	if (measText) {
		for (const pair of measText.split(',')) {
			const [k, v] = pair.split(':');
			const n = Number(v);
			if (SPEC[k] && Number.isFinite(n)) measurements[k] = n;
		}
	}

	let decodedName = '';
	try { decodedName = decodeURIComponent(name); } catch { decodedName = ''; }
	return parsePart({ version: SCHEMA_VERSION, name: decodedName || 'Untitled part', blocks, measurements });
}

export const _internal = { BLOCK_TYPES, AXES };
