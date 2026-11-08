// The BitBrick tutorial: one storyboard, narrated in English or Cantonese (VIDEO_LANG=en | yue).
// Each scene has its narration (with [[cue]] markers the screen actions wait for) and the actions that happen on screen.
import { L, key, card, titleCard } from './lib/record.mjs';

export const lesson = {
	async prepare(c) {
		await c.overlay(titleCard(
			L('BITBRICK 教學', 'BITBRICK TUTORIAL'),
			L('設計你自己嘅積木零件', 'Design your own building parts'),
			L('喺瀏覽器入面設計，匯出 STL，3D 打印', 'Design in the browser, export an STL, print it in 3D'),
		));
		await c.sleep(800);
	},
	scenes: [
		{
			id: 'intro',
			text: L(
				'大家好！歡迎使用 BitBrick。呢條片會教你喺瀏覽器入面設計插銷同軸心嘅積木零件，再匯出嚟做 3D 打印。我哋開始啦！',
				'Welcome to BitBrick! In this tutorial you will learn how to design pin and axle building parts right in your browser, and export them for 3D printing. Let us get started.',
			),
			async run(c) {
				await c.end(0.2);
				await c.hideOverlay();
			},
		},
		{
			id: 'signin',
			text: L(
				'首先要登入。[[user]]輸入你嘅用戶名稱或者電郵，[[pass]]再輸入密碼，或者用 Google 掣登入。[[go]]每個人都有自己嘅帳戶，咁你嘅設計就可以安全咁儲起。',
				'First, sign in. [[user]]Type your username or e-mail, [[pass]]then your password, or use the Google button. [[go]]Everyone has an account, so your designs are always saved safely.',
			),
			async run(c) {
				await c.at('user');
				await c.click('input[name=login]');
				await c.b.type('demo', 110);
				await c.at('pass');
				await c.click('#password');
				await c.b.type(c.password, 70);
				await c.at('go');
				await c.point('a[href*="google"]', 0, 0, 20);
				await c.sleep(700);
				await c.click('button[type=submit]');
				await c.waitFor('.sidebar');
				await c.sleep(1200);
				await c.end(0.2);
			},
		},
		{
			id: 'layout',
			text: L(
				'呢度就係設計器。[[menu]]最頂有項目掣：New、Open、Save 同 Save as。[[tools]]左邊係工具。[[view]]中間係 3D 畫面，你嘅零件會喺度出現。[[axes]]右下角嘅座標軸話你知方向：X 係向右，Y 係遠離你，Z 就係向上。',
				'This is the designer. [[menu]]Along the top are the project buttons: New, Open, Save and Save as. [[tools]]On the left are the tools. [[view]]In the middle is the 3D view, where your part appears. [[axes]]The axes in the corner show the directions: X to the right, Y away from you, and Z is up.',
			),
			async run(c) {
				await c.at('menu');
				await c.highlight('.menu', 12);
				await c.at('tools');
				await c.highlight('.sidebar', 6);
				await c.at('view');
				await c.highlight('.stage', 6);
				await c.at('axes');
				const s = await c.stage();
				await c.highlightBox(s.x + s.w / 2 - 200, s.y + s.h / 2 - 190, 170, 170, 8);
				await c.end(0.1);
				await c.unhighlight();
			},
		},
		{
			id: 'catalog',
			text: L(
				'我哋嚟擺一件零件。[[catalog]]打開目錄，每張卡都有零件嘅真實 3D 圖。[[click]]撳一下 Beam 5，再將滑鼠移到畫面上面，會有一件半透明嘅複本跟住滑鼠郁。[[ws]]撳 W 同 S 可以將佢升高或者降低。[[place]]最後撳一下左鍵，就擺低佢。',
				'Let us place a part. [[catalog]]Open the catalog. Each card shows a real 3D picture of the part. [[click]]Click Beam 5, and move the mouse over the view. A transparent copy follows the mouse. [[ws]]Press W and S to move it up and down. [[place]]Then click to place it.',
			),
			async run(c) {
				await c.at('catalog');
				await c.highlight('#section-catalog', 8);
				await c.point(c.text('.card-main', 'Beam 5'), 0, 0, 26);
				await c.at('click');
				await c.unhighlight();
				await c.click(c.text('.card-main', 'Beam 5'));
				await c.sleep(500);
				const s = await c.stage();
				await c.b.move(s.x + s.w * 0.45, s.y + s.h * 0.55, 30);
				await c.b.move(s.x + s.w * 0.5, s.y + s.h * 0.5, 14);
				await c.at('ws');
				await c.press('w', 2, 650);
				await c.press('s', 2, 650);
				await c.at('place');
				if (process.env.DEBUG) await c.b.evaluate(`(() => { window.__ev = []; const el = document.querySelector('.stage canvas'); for (const t of ['pointerdown','pointerup','pointermove','click','mousedown','mouseup']) document.addEventListener(t, (e) => { if (t !== 'pointermove' || window.__ev.length < 40) window.__ev.push(t + ':' + e.target.tagName + '.' + (e.target.className || '') + ':' + e.clientX + ',' + e.clientY + ':b' + e.buttons); }, true); })()`);
				await c.b.click(s.x + s.w * 0.5, s.y + s.h * 0.5);
				await c.settle();
				if (process.env.DEBUG) console.log('events:', await c.b.evaluate(`JSON.stringify(window.__ev.slice(-12))`));
				if (process.env.DEBUG) console.log('after click:', await c.b.evaluate(`JSON.stringify({ placing: !!document.querySelector('.placing'), toast: document.querySelector('.toast')?.textContent, status: document.querySelector('.statusbar')?.textContent })`));
				await c.end(0.1);
			},
		},
		{
			id: 'orbit',
			text: L(
				'[[drag]]用滑鼠拖動，就可以轉動畫面。[[zoom]]用滾輪放大同縮小。[[fit]]撳 Fit view 就可以將成件零件拉返到中間。',
				'[[drag]]Drag with the mouse to turn the view. [[zoom]]Use the wheel to zoom in and out. [[fit]]And Fit view brings the whole part back to the middle.',
			),
			async run(c) {
				const s = await c.stage();
				const x = s.x + s.w * 0.5;
				const y = s.y + s.h * 0.55;
				await c.at('drag');
				await c.b.drag(x - 120, y, x + 160, y - 60, { steps: 40 });
				await c.sleep(300);
				await c.b.drag(x + 160, y - 60, x - 60, y + 20, { steps: 30 });
				await c.at('zoom');
				await c.wheel(x, y, -500);
				await c.sleep(500);
				await c.wheel(x, y, 700);
				await c.at('fit');
				await c.click('.tool[aria-label="Fit view"]');
				await c.end(0.1);
			},
		},
		{
			id: 'turn',
			text: L(
				'有啲零件有方向。[[ball]]揀 Ball Joint，再將佢移到畫面上面。[[x]]撳 X，就會沿住 X 軸擺放。[[again]]再撳一次 X，方向就會反轉。[[yz]]撳 Y 同 Z，就會沿住另外兩條軸擺放。[[place]]最後撳左鍵擺低。',
				'Some parts have a direction. [[ball]]Pick the Ball Joint and move it over the view. [[x]]Press X to point it along X. [[again]]Press X again to reverse it. [[yz]]Y and Z point it along the other two axes. [[place]]Click to place it.',
			),
			async run(c) {
				await c.at('ball');
				await c.click(c.text('.chip', 'Pins and axles'));
				await c.sleep(400);
				await c.click(c.text('.card-main', 'Ball Joint'));
				const s = await c.stage();
				await c.b.move(s.x + s.w * 0.3, s.y + s.h * 0.72, 30);
				await c.at('x');
				await c.press('x', 1, 900);
				await c.at('again');
				await c.press('x', 1, 900);
				await c.at('yz');
				await c.press('y', 1, 800);
				await c.press('z', 1, 800);
				await c.press('x', 1, 300);
				await c.at('place');
				await c.b.click(s.x + s.w * 0.3, s.y + s.h * 0.72);
				await c.settle();
				await c.end(0.1);
			},
		},
		{
			id: 'edit',
			text: L(
				'你亦都可以一粒一粒咁砌。[[move]]用方向鍵郁黃色嘅游標，W 同 S 就係上落。[[type]]撳 1 至 7 嘅數字揀積木種類：插銷孔、軸孔、插銷、軸心、實心、球頭，同齒輪。[[dir]]X、Y、Z 可以設定孔嘅方向。[[hr]]H 會變成半塊，R 就切換圓角。[[del]]Delete 就可以刪走積木。',
				'You can also build brick by brick. [[move]]Use the arrow keys to move the yellow cursor, and W and S to go up and down. [[type]]Press a number from 1 to 7 to choose the brick type: pin hole, axle hole, pin, axle, solid, ball joint, or gear. [[dir]]X, Y and Z set the direction of the hole. [[hr]]H makes a half block, and R switches rounded edges. [[del]]Delete removes the brick.',
			),
			async run(c) {
				await c.at('move');
				await c.highlight('#section-edit', 8);
				// leave the parts placed so far and build in the free space behind them
				await c.press('ArrowLeft', 1, 250);
				await c.press('ArrowUp', 4, 250);
				await c.at('type');
				await c.press('1', 1, 700);
				await c.press('ArrowRight', 1, 400);
				await c.press('2', 1, 700);
				await c.press('ArrowRight', 1, 400);
				await c.press('3', 1, 700);
				await c.press('ArrowRight', 1, 400);
				await c.press('4', 1, 700);
				await c.at('dir');
				await c.press('x', 1, 600);
				await c.press('y', 1, 600);
				await c.press('z', 1, 600);
				await c.at('hr');
				await c.press('h', 1, 700);
				await c.press('h', 1, 400);
				await c.press('r', 1, 700);
				await c.at('del');
				await c.press('Delete', 1, 500);
				await c.unhighlight();
				await c.end(0.1);
			},
		},
		{
			id: 'measure',
			text: L(
				'每部打印機都唔同，所以每粒積木都有自己嘅尺寸。[[select]]將游標移到一粒積木上面。[[panel]]尺寸面板只會顯示適用嘅數值，例如插銷孔直徑。[[change]]改一個數值，再撳 Apply。[[all]]撳 Apply to all，就會套用到所有同類嘅積木。',
				'Printers are different, so every brick has its own measurements. [[select]]Move the cursor onto a brick. [[panel]]The Measurements panel shows only the values that apply to it, like the pin hole diameter. [[change]]Change a value and press Apply. [[all]]Apply to all copies it to every brick of the same type.',
			),
			async run(c) {
				await c.at('select');
				const blocks = await c.blocks();
				const pin = blocks.find((b) => b.type === 'pinHole');
				await c.goCell([pin.pos[0], 0 - pin.pos[2], pin.pos[1]], 200);
				await c.at('panel');
				await c.point('#section-measurements .card-head', 0, 0, 16);
				await c.highlight('#section-measurements', 8);
				await c.at('change');
				await c.click('#m-pinHoleDiameter');
				await c.b.evaluate(`${c.q('#m-pinHoleDiameter')}.select()`);
				await c.b.type('5.3', 220);
				await c.sleep(400);
				await c.click(c.text('#section-measurements .btn.primary', 'Apply'));
				await c.settle();
				await c.at('all');
				await c.click(c.text('#section-measurements .btn', 'Apply to all'));
				await c.settle();
				await c.unhighlight();
				await c.end(0.1);
			},
		},
		{
			id: 'gears',
			text: L(
				'BitBrick 仲有齒輪。[[chip]]打開 Gears 類別，揀一個齒輪。[[place]]擺一個 16 齒嘅齒輪，再喺隔三格嘅地方擺一個 32 齒嘅。[[mesh]]兩個齒輪嘅齒會啱啱好咬合，因為中心距離等於齒數總和嘅一半。[[teeth]]你可以喺尺寸面板改齒數。8、24 同 40 齒嘅齒輪可以互相咬合，16、32 同 48 齒都一樣。',
				'BitBrick also has gears. [[chip]]Open the Gears category and pick a gear. [[place]]Place a 16 tooth gear, then a 32 tooth gear three cells away. [[mesh]]The teeth fit together, because the distance between the centres is half the sum of the teeth. [[teeth]]You can change the number of teeth in the Measurements panel. Gears with 8, 24 and 40 teeth mesh with each other, and so do 16, 32 and 48.',
			),
			async run(c) {
				await c.at('chip');
				await c.click(c.text('.chip', 'Gears'));
				await c.sleep(500);
				await c.at('place');
				// a free spot to the right of everything so far
				await c.goCell([6, 2, 0], 160);
				await c.click(c.text('.card-main', 'Gear 16 teeth'));
				await c.sleep(500);
				await c.press('Enter', 1, 500);
				await c.settle();
				await c.press('ArrowRight', 3, 250);
				await c.click(c.text('.card-main', 'Gear 32 teeth'));
				await c.sleep(500);
				await c.press('Enter', 1, 500);
				await c.settle();
				await c.click('.tool[aria-label="Fit view"]');
				await c.at('mesh');
				const s = await c.stage();
				await c.b.drag(s.x + s.w * 0.5, s.y + s.h * 0.45, s.x + s.w * 0.56, s.y + s.h * 0.78, { steps: 36 }); // drag down: look from higher up
				await c.at('teeth');
				await c.highlight('#section-measurements', 8);
				await c.end(0.1);
				await c.unhighlight();
			},
		},
		{
			id: 'styles',
			text: L(
				'[[style]]顯示樣式可以轉變零件嘅外觀：輪廓、實心、線框、X 光，或者逼真模式，會用光線追蹤嚟畫。[[colour]]你仲可以揀顏色。',
				'[[style]]The display style changes how the part looks: contour, solid, wireframe, X-ray, or realistic, which ray traces the picture. [[colour]]And you can pick a colour too.',
			),
			async run(c) {
				const setStyle = async (v) => {
					await c.b.evaluate(`(() => { const s = ${c.q('#section-part select')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(v)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
				};
				await c.at('style');
				await c.highlight('#section-part', 8);
				await c.point('#section-part select', 0, 0, 22);
				for (const v of ['solid', 'wireframe', 'xray', 'contour']) {
					await setStyle(v);
					await c.sleep(1100);
				}
				await c.at('colour');
				await c.point('.swatch', 0, 0, 20);
				const n = await c.b.evaluate(`document.querySelectorAll('.swatch').length`);
				const rects = await c.b.evaluate(`[...document.querySelectorAll('.swatch')].map((e) => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })`);
				for (const i of [Math.min(2, n - 1), Math.min(4, n - 1), 0]) {
					await c.b.click(rects[i][0], rects[i][1]);
					await c.sleep(900);
				}
				await c.unhighlight();
				await c.end(0.1);
			},
		},
		{
			id: 'save',
			text: L(
				'[[saveas]]要保存你嘅作品，撳 Save as，然後俾個名項目。[[name]]名會顯示喺右上角，撳一下就可以改名。[[open]]Open 會列出所有項目，喺度可以改名、分享或者刪除。',
				'[[saveas]]To keep your work, click Save as and give the project a name. [[name]]The name appears at the top right. Click it to rename. [[open]]Open lists all your projects, where you can rename, share or delete them.',
			),
			async run(c) {
				await c.at('saveas');
				await c.click(c.text('.menu-btn', 'Save as'));
				await c.waitFor('[role=dialog] input');
				await c.sleep(400);
				await c.b.type(L('我嘅第一件零件', 'My first part'), 120);
				await c.sleep(500);
				await c.click(c.text('[role=dialog] .btn.primary', 'Save'));
				for (let i = 0; i < 40 && (await c.has('[role=dialog]')); i++) await c.sleep(150);
				await c.sleep(600);
				await c.at('name');
				await c.highlight('.project', 10);
				await c.point('.project', 0, 0, 24);
				await c.at('open');
				await c.unhighlight();
				await c.click(c.text('.menu-btn', 'Open'));
				await c.waitFor('[role=dialog]');
				await c.sleep(1500);
				await c.end(0.1);
				await c.press('Escape', 1, 400);
			},
		},
		{
			id: 'export',
			text: L(
				'[[stl]]當你滿意零件之後，撳 Save STL。檔案會轉成 Z 向上、平放喺枱面，直接俾切片軟件用。[[share]]Share 會俾你一條連結，可以傳俾朋友。',
				'[[stl]]When you are happy with the part, press Save STL. The file is turned upright with Z up and resting on the table, ready for your slicer. [[share]]Share gives you a link to send to a friend.',
			),
			async run(c) {
				await c.at('stl');
				await c.b.evaluate(`${c.q('.sidebar')}.scrollTo({ top: 0, behavior: 'smooth' })`);
				await c.sleep(600);
				await c.highlight(c.text('.btn', 'Save STL'), 10);
				await c.point(c.text('.btn', 'Save STL'), 0, 0, 24);
				await c.sleep(600);
				await c.click(c.text('.btn', 'Save STL'));
				await c.at('share');
				await c.highlight(c.text('.btn', 'Share'), 10);
				await c.point(c.text('.btn', 'Share'), 0, 0, 22);
				await c.end(0.1);
				await c.unhighlight();
			},
		},
		{
			id: 'outro',
			text: L(
				'最後記住呢啲快捷鍵。方向鍵移動游標，W 同 S 係上落，X、Y、Z 轉方向，數字揀種類，H 係半塊，R 係圓角，Delete 刪除，Control S 儲存。就係咁多，祝你砌得開心！',
				'Here are the keys to remember. Arrow keys move the cursor. W and S go up and down. X, Y and Z turn. Numbers pick the type. H is half, R is rounded, Delete removes, and Control S saves. That is all. Happy building!',
			),
			async run(c) {
				const row = (keys, text) => `<div style="display:flex;align-items:center;justify-content:flex-start;gap:18px;margin:12px 0;text-align:left"><div style="min-width:430px;text-align:right">${keys}</div><div>${text}</div></div>`;
				await c.overlay(card(
					L('快捷鍵', 'Keys to remember'),
					[
						row(`${key('←')}${key('↑')}${key('↓')}${key('→')}`, L('移動游標', 'move the cursor')),
						row(`${key('W')}${key('S')}`, L('上 / 下', 'up / down')),
						row(`${key('X')}${key('Y')}${key('Z')}`, L('轉方向 (再撳一次反轉)', 'turn (again to reverse)')),
						row(`${key('1')}…${key('7')}`, L('揀積木種類', 'choose the brick type')),
						row(`${key('H')}${key('R')}${key('Del')}`, L('半塊 / 圓角 / 刪除', 'half / rounded / remove')),
						row(`${key('Ctrl')}${key('S')}`, L('儲存', 'save')),
					].join(''),
				));
				await c.end(-0.8);
			},
		},
	],
};
