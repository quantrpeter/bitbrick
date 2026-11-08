// Minimal Chrome DevTools driver for scripted screen demos.
// Copied from the n project (skills/video/cdp.mjs) with two changes: `args` adds Chrome flags (software WebGL for the
// 3D view) and downloads are refused so the Save STL button does not drop files into ~/Downloads.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome profiles hold login cookies, so they live outside the repo. */
export const profileDir = (name) => `${process.env.VIDEO_PROFILES || '/tmp/bitbrick-video'}/profile-${name}`;

export async function launch({ width = 1440, height = 900, port = 9444, profile = profileDir('default'), block = [], reuse = false, patch = [], args = [] } = {}) {
	mkdirSync(profile, { recursive: true });
	let running = false;
	if (reuse) {
		try {
			running = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
		} catch {}
	}
	const chrome = running
		? null
		: spawn(
				'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
				[
					'--headless=new',
					`--remote-debugging-port=${port}`,
					`--user-data-dir=${profile}`,
					`--window-size=${width},${height}`,
					'--hide-scrollbars',
					'--force-device-scale-factor=1',
					'--autoplay-policy=no-user-gesture-required',
					...args,
					'about:blank',
				],
				{ detached: reuse, stdio: 'ignore' },
			);
	if (reuse && chrome) chrome.unref();
	let targets;
	for (let i = 0; i < 60; i++) {
		try {
			targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
			if (targets.some((t) => t.type === 'page')) break;
		} catch {}
		await sleep(200);
	}
	const page = targets.find((t) => t.type === 'page');
	return attach(page.webSocketDebuggerUrl, { width, height, port, block, patch, close: () => !reuse && chrome?.kill() });
}

/** Connects to one page target and returns the page API. `newPage` opens another page in its own window. */
async function attach(wsUrl, { width, height, port, block, patch, close }) {
	const ws = new WebSocket(wsUrl);
	await new Promise((r) => (ws.onopen = r));
	let id = 0;
	const pending = new Map();
	const listeners = [];
	ws.onmessage = (m) => {
		const msg = JSON.parse(m.data);
		if (msg.id && pending.has(msg.id)) {
			pending.get(msg.id)(msg);
			pending.delete(msg.id);
		} else if (msg.method) listeners.forEach((l) => l(msg));
	};
	const send = (method, params = {}) =>
		new Promise((r) => {
			const n = ++id;
			pending.set(n, r);
			ws.send(JSON.stringify({ id: n, method, params }));
		});
	await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
	await send('Page.enable');
	await send('Network.enable');
	await send('Browser.setDownloadBehavior', { behavior: 'deny' });
	if (block.length) await send('Network.setBlockedURLs', { urls: block });
	if (patch.length) {
		// Rewrites matching script responses in this headless session only.
		listeners.push(async (m) => {
			if (m.method !== 'Fetch.requestPaused') return;
			const { requestId, request, responseStatusCode, responseHeaders } = m.params;
			const p = patch.find((x) => request.url.includes(x.url));
			if (!p || !responseStatusCode) return send('Fetch.continueRequest', { requestId });
			const res = await send('Fetch.getResponseBody', { requestId });
			let body = res.result.base64Encoded ? Buffer.from(res.result.body, 'base64').toString('utf8') : res.result.body;
			body = p.apply(body);
			await send('Fetch.fulfillRequest', {
				requestId,
				responseCode: responseStatusCode,
				responseHeaders: responseHeaders.filter((h) => !/content-(length|encoding)/i.test(h.name)),
				body: Buffer.from(body, 'utf8').toString('base64'),
			});
		});
		await send('Fetch.enable', { patterns: patch.map((x) => ({ urlPattern: `*${x.url}*`, requestStage: 'Response' })) });
	}

	const evaluate = async (expression) => {
		const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
		if (r.result?.exceptionDetails) return 'ERR ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
		return r.result?.result?.value;
	};

	// A drawn cursor, since headless screenshots have none.
	const cursorJs = `(() => {
		if (document.getElementById('__demo_cursor')) return;
		const c = document.createElement('div');
		c.id = '__demo_cursor';
		c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform 0.05s linear;';
		c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.5 L12 13.8 L19 13.8 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
		document.documentElement.appendChild(c);
	})()`;
	let cx = width / 2;
	let cy = height / 2;
	const placeCursor = async (x, y, down = false) => {
		await evaluate(`${cursorJs}; (() => { const c = document.getElementById('__demo_cursor'); c.style.transform = 'translate(${x - 3}px, ${y - 2}px) scale(${down ? 0.85 : 1})'; })()`);
	};

	const api = {
		send,
		evaluate,
		on: (fn) => listeners.push(fn),
		/** Draw the fake cursor at a point already reached with raw input events. */
		async cursor(x, y, down = false) {
			cx = x;
			cy = y;
			await placeCursor(x, y, down);
		},
		async goto(url, wait = 3000) {
			await send('Page.navigate', { url });
			await sleep(wait);
		},
		async rect(selectorJs) {
			return evaluate(`(() => { const el = ${selectorJs}; if (!el) return null; el.scrollIntoView({block:'nearest', inline:'nearest'}); const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height}; })()`);
		},
		/** Element whose visible text or aria-label starts with `text`. */
		byText(text, tags = 'button, [role=tab], [role=button], [role=combobox], [role=option], [role=menuitem], a, li, label') {
			return `[...document.querySelectorAll(${JSON.stringify(tags)})].find((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const t = (e.getAttribute('aria-label') || e.innerText || e.textContent || '').trim(); return t.startsWith(${JSON.stringify(text)}); })`;
		},
		async move(x, y, steps = 18, onFrame) {
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
				const nx = cx + (x - cx) * e;
				const ny = cy + (y - cy) * e;
				await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nx, y: ny });
				await placeCursor(nx, ny);
				if (onFrame) await onFrame();
			}
			cx = x;
			cy = y;
		},
		async click(x, y, { onFrame, clickCount = 1, button = 'left', modifiers = 0 } = {}) {
			await api.move(x, y, 18, onFrame);
			await placeCursor(x, y, true);
			await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount, buttons: 1, modifiers });
			await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount, buttons: 0, modifiers });
			await placeCursor(x, y, false);
		},
		async drag(x1, y1, x2, y2, { onFrame, steps = 24 } = {}) {
			await api.move(x1, y1, 16, onFrame);
			await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 });
			await placeCursor(x1, y1, true);
			for (let i = 1; i <= steps; i++) {
				const k = 0.5 - Math.cos((Math.PI * i) / steps) / 2;
				const nx = x1 + (x2 - x1) * k;
				const ny = y1 + (y2 - y1) * k;
				await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: nx, y: ny, button: 'left', buttons: 1 });
				await placeCursor(nx, ny, true);
				if (onFrame) await onFrame();
				await sleep(16);
			}
			// Blockly updates its snap preview on animation frames, so hover before releasing.
			for (const d of [1, 0]) {
				await sleep(70);
				await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2 + d, y: y2, button: 'left', buttons: 1 });
			}
			await sleep(70);
			await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 0 });
			await placeCursor(x2, y2, false);
			cx = x2;
			cy = y2;
		},
		async clickText(text, opts) {
			const r = await api.rect(api.byText(text, opts?.tags));
			if (!r) throw new Error('not found: ' + text);
			await api.click(r.x + (opts?.dx ?? 0), r.y + (opts?.dy ?? 0), opts);
			return r;
		},
		async type(text, delay = 45, onFrame) {
			for (const ch of text) {
				await send('Input.insertText', { text: ch });
				if (onFrame) await onFrame();
				await sleep(delay);
			}
		},
		async key(key, code = key, keyCode = 0, modifiers = 0) {
			await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
			await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
		},
		async shot(file) {
			const res = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
			writeFileSync(file, Buffer.from(res.result.data, 'base64'));
		},
		async newPage(url = 'about:blank') {
			const r = await send('Target.createTarget', { url, newWindow: true });
			const targetId = r.result.targetId;
			let t;
			for (let i = 0; i < 50 && !t; i++) {
				t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.id === targetId);
				if (!t) await sleep(100);
			}
			return attach(t.webSocketDebuggerUrl, { width, height, port, block, patch, close: () => send('Target.closeTarget', { targetId }) });
		},
		close() {
			ws.close();
			close();
		},
	};
	return api;
}
