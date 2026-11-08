// Writes the narration text of both languages to video/omnivoice/scripts-<lang>.json, for omnivoice/tts.py.
//   node video/export-scripts.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const lang = process.argv[2];
if (!lang) {
	for (const l of ['en', 'yue']) execFileSync(process.execPath, [new URL(import.meta.url).pathname, l], { stdio: 'inherit', env: { ...process.env, VIDEO_LANG: l } });
} else {
	const { lesson } = await import('./lesson.mjs');
	const { spoken } = await import('./lib/record.mjs');
	const scenes = lesson.scenes.map((s) => ({ id: s.id, text: spoken(s.text).replace(/\s+/g, ' ').trim() }));
	writeFileSync(new URL(`./omnivoice/scripts-${lang}.json`, import.meta.url), JSON.stringify(scenes, null, 1));
	console.log(`${lang}: ${scenes.length} scenes`);
}
