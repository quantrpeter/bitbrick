// Records the BitBrick designer in a headless Chrome while a lesson's scenes run, one scene per narration clip.
// Adapted from the n project's skills/video recorder: Chrome DevTools screencast frames + a timeline of scene marks,
// which assemble.mjs turns into an MP4 with the narration laid on the marks.
//
//   node video/record.mjs <lang yue|en>        (build.sh runs the whole thing)
//
// Scenes: { id, text, run(ctx) }. `text` is spoken; [[cue]] markers inside it let `await ctx.at('cue')` wait until
// the narrator reaches that word, so the screen does what is being said. Captions (the same text) are shown at the bottom.
import { sleep, launch } from './cdp.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

export const W = 1920;
export const H = 1080;
export const LANG = process.env.VIDEO_LANG === 'en' ? 'en' : 'yue';
/** Pick the Cantonese or the English wording. */
export const L = (yue, en) => (LANG === 'en' ? en : yue);

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../..', import.meta.url).pathname;
const APP = process.env.BITBRICK_URL || 'http://localhost:8000';
const GAP = 0.6;
const LEAD = 0.25; // assemble.mjs starts each clip this long after its scene mark

export const spoken = (t) => t.replace(/\[\[.*?\]\]/g, '');
const weight = (t) => [...t].reduce((n, c) => n + (/[㐀-鿿]/.test(c) ? 1 : /[A-Za-z0-9]/.test(c) ? 0.35 : 0), 0);

function cueFraction(s, cue) {
	const marker = s.text.indexOf(`[[${cue}]]`);
	if (marker < 0) throw new Error(`cue "${cue}" is not in the ${s.id} narration`);
	return weight(spoken(s.text.slice(0, marker))) / weight(spoken(s.text));
}

/** Splits narration into caption-sized pieces (sentences, then commas when a sentence is long). */
export function captionChunks(text) {
	const t = spoken(text).replace(/\s+/g, ' ').trim();
	const sentences = t.split(/(?<=[。！？!?])\s*|(?<=[.])\s+(?=[A-Z])/).filter(Boolean);
	const limit = LANG === 'en' ? 95 : 34;
	const out = [];
	for (const s of sentences) {
		if (weightLen(s) <= limit) { out.push(s); continue; }
		let cur = '';
		for (const part of s.split(/(?<=[，,、；;])\s*/)) {
			if (cur && weightLen(cur + part) > limit) { out.push(cur.trim()); cur = ''; }
			cur += part;
		}
		if (cur.trim()) out.push(cur.trim());
	}
	return out;
}
const weightLen = (t) => [...t].length;

// ---------- title cards ----------
const FONT = `'Avenir Next','PingFang HK','Heiti TC','Helvetica Neue',Arial,sans-serif`;
export const cardCss = `position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
	background:radial-gradient(circle at 20% 15%,#2447a6 0%,#10246b 45%,#081544 100%);color:#fff;font-family:${FONT};
	text-align:center;transition:opacity .5s;opacity:1;pointer-events:none`;
export const beamIcon = (w = 360) =>
	`<svg width="${w}" height="${w * 0.3}" viewBox="0 0 360 108"><rect x="6" y="6" width="348" height="96" rx="48" fill="#ffd23f" stroke="#fff" stroke-width="5"/>
	<circle cx="64" cy="54" r="22" fill="#10246b"/><circle cx="180" cy="54" r="22" fill="#10246b"/><circle cx="296" cy="54" r="22" fill="#10246b"/></svg>`;
export const titleCard = (label, title, subtitle) =>
	`${beamIcon()}<div style="font-size:30px;letter-spacing:4px;color:#ffd23f">${label}</div>
	<div style="font-size:104px;font-weight:700;line-height:1.05;max-width:1700px;text-shadow:0 6px 24px rgba(0,0,0,.3)">${title}</div>
	<div style="font-size:38px;opacity:.95;max-width:1600px">${subtitle}</div>`;
export const card = (heading, html) =>
	`<div style="font-size:50px;letter-spacing:2px;color:#ffd23f">${heading}</div><div style="font-size:42px;max-width:1650px;line-height:1.4">${html}</div>`;
export const key = (k) =>
	`<span style="display:inline-block;min-width:64px;padding:6px 18px;margin:0 6px;border-radius:14px;background:#fff;color:#10246b;font-weight:700;box-shadow:0 5px 0 #8fa3d9">${k}</span>`;

// ---------- recorder ----------
const KEYS = {
	ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'],
	Enter: [13, 'Enter'], Escape: [27, 'Escape'], Delete: [46, 'Delete'], Backspace: [8, 'Backspace'], Tab: [9, 'Tab'],
};

export async function record(lesson) {
	const audioDir = `${ROOT}video/build/audio/${LANG}`;
	const outDir = `${ROOT}video/build/take/${LANG}`;
	const scenes = lesson.scenes;
	const dur = {};
	for (const s of scenes) {
		const f = `${audioDir}/${s.id}.wav`;
		dur[s.id] = existsSync(f)
			? Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
			: weight(spoken(s.text)) / (LANG === 'en' ? 6.2 : 5.3);
	}
	rmSync(outDir, { recursive: true, force: true, maxRetries: 5 });
	mkdirSync(`${outDir}/frames`, { recursive: true });
	mkdirSync(`${ROOT}video/build/shots`, { recursive: true });

	// A throwaway account to sign in with on camera; removed again at the end.
	const password = randomBytes(9).toString('base64url');
	const php = (action) => spawnSync('php', [`${ROOT}video/lib/demo-user.php`, action], { env: { ...process.env, VIDEO_DEMO_PASSWORD: password }, encoding: 'utf8' });
	if (php('create').status !== 0) throw new Error('could not create the demo account');
	let b;
	const cleanup = () => { try { b?.close(); } catch {} php('delete'); };
	process.on('exit', cleanup);

	b = await launch({
		width: W, height: H, port: Number(process.env.VIDEO_PORT) || 9702,
		profile: `${process.env.VIDEO_PROFILES || '/tmp/bitbrick-video'}/profile-${LANG}-${Date.now()}`,
		// The page tries the webpack dev server first when APP_ENV=local; block it so the built bundle is recorded.
		block: ['http://localhost:8095/*'],
		// VIDEO_GL=software forces software WebGL (slower); by default Chrome uses the machine's GPU.
		args: [...(process.env.VIDEO_GL === 'software' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), '--ignore-gpu-blocklist', '--lang=' + (LANG === 'en' ? 'en-US' : 'zh-HK')],
	});
	const errors = [];
	b.on(async (m) => {
		if (m.method === 'Page.javascriptDialogOpening') await b.send('Page.handleJavaScriptDialog', { accept: true });
		if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300));
	});
	await b.send('Runtime.enable');
	await b.goto(`${APP}/`, 2500);

	const ctx = { b, dur, errors, sleep, lesson, password, app: APP };
	ctx.q = (css) => `document.querySelector(${JSON.stringify(css)})`;
	/** Expression for the first element matching `css` whose text contains `text`. */
	ctx.qt = (css, text) =>
		`[...document.querySelectorAll(${JSON.stringify(css)})].find((e) => (e.getAttribute('aria-label') || e.innerText || '').includes(${JSON.stringify(text)}))`;
	const target = (sel) => (typeof sel === 'string' ? ctx.q(sel) : sel.expr);
	ctx.rect = async (sel) => {
		const r = await b.rect(target(sel));
		if (!r) throw new Error('not found: ' + JSON.stringify(sel));
		return r;
	};
	ctx.point = async (sel, dx = 0, dy = 0, steps = 24) => { const r = await ctx.rect(sel); await b.move(r.x + dx, r.y + dy, steps); return r; };
	ctx.click = async (sel, dx = 0, dy = 0) => { const r = await ctx.rect(sel); await b.click(r.x + dx, r.y + dy); return r; };
	ctx.text = (sel, x) => ({ expr: ctx.qt(sel, x) });
	ctx.has = (css) => b.evaluate(`!!${ctx.q(css)}`);
	ctx.waitFor = async (css, ms = 15000) => {
		for (let t = 0; t < ms; t += 200) { if (await ctx.has(css)) return true; await sleep(200); }
		throw new Error('timed out waiting for ' + css);
	};
	ctx.press = async (name, times = 1, gap = 380) => {
		for (let i = 0; i < times; i++) {
			if (KEYS[name]) await b.key(name, KEYS[name][1], KEYS[name][0]);
			else {
				// plain character keys: the page listens for keydown with e.key
				await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: /\d/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`, text: name, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) });
				await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: /\d/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) });
			}
			await sleep(gap);
		}
	};
	ctx.wheel = async (x, y, deltaY, steps = 8) => {
		for (let i = 0; i < steps; i++) {
			await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: deltaY / steps });
			await sleep(60);
		}
	};
	/** Waits for the geometry worker, so the picture is up to date. */
	ctx.settle = async () => {
		await sleep(250);
		for (let i = 0; i < 100; i++) {
			if (!(await b.evaluate(`/Building/.test(document.querySelector('.statusbar')?.textContent || '')`))) break;
			await sleep(150);
		}
		await sleep(250);
	};
	/** The 3D view's box: x, y is the top left corner (b.rect gives the centre). */
	ctx.stage = async () => {
		const r = await b.rect(ctx.q('.stage'));
		return { x: r.x - r.w / 2, y: r.y - r.h / 2, w: r.w, h: r.h };
	};

	/** The blocks of the open part, read from the autosaved draft (stored axes; user Y = -z, user Z = y). */
	ctx.blocks = async () => {
		await sleep(900); // the draft is written 600 ms after the last change
		const raw = await b.evaluate(`localStorage.getItem('bitbrick.draft.v1')`);
		return raw ? JSON.parse(raw).part.blocks : [];
	};
	/** The cursor cell as shown in the Edit Block panel, in the user's X, Y, Z. */
	ctx.cursorCell = async () => {
		const t = await b.evaluate(`${ctx.q('#section-edit .hint')}?.textContent || ''`);
		const m = /Cell (-?\d+), (-?\d+), (-?\d+)/.exec(t);
		if (!m) throw new Error('cursor cell not readable: ' + t);
		return [Number(m[1]), Number(m[2]), Number(m[3])];
	};
	/** Moves the cursor to a cell (user X, Y, Z) with the arrow keys and w / s, like a person would. */
	ctx.goCell = async ([X, Y, Z], gap = 260) => {
		const [x, y, z] = await ctx.cursorCell();
		await ctx.press(X > x ? 'ArrowRight' : 'ArrowLeft', Math.abs(X - x), gap);
		await ctx.press(Y > y ? 'ArrowUp' : 'ArrowDown', Math.abs(Y - y), gap); // ArrowUp is away from you = +Y
		await ctx.press(Z > z ? 'w' : 's', Math.abs(Z - z), gap);
	};
	/** Spotlights a rectangle that is not an element. */
	ctx.highlightBox = (x, y, w, h, pad = 8) =>
		b.evaluate(`(() => {
			let h = document.getElementById('__demo_hl');
			if (!h) { h = document.createElement('div'); h.id = '__demo_hl'; document.body.appendChild(h); }
			h.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;border:5px solid #ffd23f;border-radius:18px;box-shadow:0 0 0 9999px rgba(8,21,68,.5),0 0 24px #ffd23f;transition:all .4s;left:' + (${x} - ${pad}) + 'px;top:' + (${y} - ${pad}) + 'px;width:' + (${w} + ${pad * 2}) + 'px;height:' + (${h} + ${pad * 2}) + 'px';
		})()`);

	ctx.overlay = (html) =>
		b.evaluate(`(() => {
			let o = document.getElementById('__demo_card');
			if (!o) { o = document.createElement('div'); o.id = '__demo_card'; document.body.appendChild(o); }
			o.style.cssText = ${JSON.stringify(cardCss)};
			o.innerHTML = ${JSON.stringify(html)};
			const c = document.getElementById('__demo_cursor'); if (c) c.style.visibility = 'hidden';
		})()`);
	ctx.hideOverlay = async () => {
		await b.evaluate(`(() => { const o = document.getElementById('__demo_card'); if (o) o.style.opacity = '0'; })()`);
		await sleep(550);
		await b.evaluate(`(() => { document.getElementById('__demo_card')?.remove(); const c = document.getElementById('__demo_cursor'); if (c) c.style.visibility = ''; })()`);
	};
	/** Dims the page except for one element, like a spotlight. */
	ctx.highlight = (sel, pad = 8) =>
		b.evaluate(`(() => {
			let h = document.getElementById('__demo_hl');
			if (!h) { h = document.createElement('div'); h.id = '__demo_hl'; document.body.appendChild(h); }
			const t = ${target(sel)}; if (!t) return;
			const r = t.getBoundingClientRect();
			h.style.cssText = 'position:fixed;z-index:2147483000;pointer-events:none;border:5px solid #ffd23f;border-radius:18px;box-shadow:0 0 0 9999px rgba(8,21,68,.5),0 0 24px #ffd23f;transition:all .4s;left:' + (r.left - ${pad}) + 'px;top:' + (r.top - ${pad}) + 'px;width:' + (r.width + ${pad * 2}) + 'px;height:' + (r.height + ${pad * 2}) + 'px';
		})()`);
	ctx.unhighlight = () => b.evaluate(`document.getElementById('__demo_hl')?.remove()`);
	const captionCss = `position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:2147483645;max-width:1500px;padding:14px 34px;border-radius:18px;background:rgba(8,21,68,.86);color:#fff;font:600 36px/1.35 ${FONT};text-align:center;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.35)`;
	ctx.caption = async (text) => {
		const r = await b.evaluate(`(() => {
			let c = document.getElementById('__caption');
			if (!c) { c = document.createElement('div'); c.id = '__caption'; document.body.appendChild(c); }
			c.style.cssText = ${JSON.stringify(captionCss)};
			c.style.display = ${JSON.stringify(text)} ? 'block' : 'none';
			c.textContent = ${JSON.stringify(text)};
		})()`);
		if (typeof r === 'string' && r.startsWith('ERR')) console.log('caption error:', r.slice(0, 160));
	};

	// ---- screencast ----
	const frames = [];
	let recording = false;
	b.on(async (m) => {
		if (m.method !== 'Page.screencastFrame') return;
		const { data, metadata, sessionId } = m.params;
		b.send('Page.screencastFrameAck', { sessionId });
		if (!recording) return;
		const file = `${outDir}/frames/${String(frames.length).padStart(6, '0')}.jpg`;
		frames.push({ file, t: metadata.timestamp });
		writeFileSync(file, Buffer.from(data, 'base64'));
	});
	const marks = [];
	let startT = 0;
	const begin = async () => {
		await b.move(W / 2, H - 120, 1);
		recording = true;
		await b.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
		await sleep(700);
		startT = Date.now() / 1000;
	};

	// The opening card is up before the first frame, so the video starts on it.
	if (lesson.prepare) await lesson.prepare(ctx);
	await begin();

	const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // rehearse a few scenes
	for (const s of scenes) {
		if (only && !only.includes(s.id)) { if (s.setup) await s.setup(ctx); continue; }
		const t0 = Date.now() / 1000;
		marks.push({ id: s.id, t: t0 });
		console.log('scene', s.id, dur[s.id].toFixed(1) + 's');

		// captions follow the narration, each piece for its share of the clip
		const chunks = captionChunks(s.text);
		const total = chunks.reduce((n, c) => n + weight(c), 0) || 1;
		let live = true;
		(async () => {
			let at = t0 + LEAD;
			for (const c of chunks) {
				if (!live) return;
				const wait = at - Date.now() / 1000;
				if (wait > 0) await sleep(wait * 1000);
				if (!live) return;
				await ctx.caption(c);
				at += dur[s.id] * (weight(c) / total);
			}
		})();

		ctx.at = async (cue) => {
			const f = typeof cue === 'string' ? cueFraction(s, cue) : cue;
			const wait = t0 + LEAD + dur[s.id] * f - Date.now() / 1000;
			if (wait > 0) await sleep(wait * 1000);
		};
		ctx.end = async (margin = 0.3) => {
			const wait = t0 + LEAD + dur[s.id] - margin - Date.now() / 1000;
			if (wait > 0) await sleep(wait * 1000);
		};
		try {
			await s.run(ctx);
		} catch (e) {
			live = false;
			await b.shot(`${ROOT}video/build/shots/fail-${LANG}-${s.id}.jpg`);
			throw e;
		}
		const left = t0 + LEAD + dur[s.id] + (s.gap ?? GAP) - Date.now() / 1000;
		if (left > 0) await sleep(left * 1000);
		else console.log(`  ! ${s.id} actions overran the narration by ${(-left).toFixed(1)}s`);
		live = false;
		await ctx.caption('');
		if (process.env.SHOTS) await b.shot(`${ROOT}video/build/shots/${LANG}-${s.id}.jpg`);
	}
	await sleep(1200);
	const endT = Date.now() / 1000;
	await b.send('Page.stopScreencast');
	await sleep(400);
	recording = false;
	writeFileSync(`${outDir}/timeline.json`, JSON.stringify({ startT, endT, marks, frames, dur, pops: [] }, null, 1));
	console.log('frames', frames.length, 'length', (endT - startT).toFixed(1) + 's');
	console.log('page errors', errors.filter((e) => !/favicon|ERR_BLOCKED/.test(e)).slice(0, 10));
	cleanup();
	process.exit(0);
}
