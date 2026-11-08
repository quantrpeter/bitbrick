// Narration clips for the lesson with the macOS voices (`say`): build/audio/<lang>/<scene>.wav, 24 kHz mono.
// A clip is only made again when its text changed. Cantonese uses Sinji (zh_HK), English uses Samantha.
//   VIDEO_LANG=en|yue node video/narrate.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { LANG, spoken } from './lib/record.mjs';
import { lesson } from './lesson.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const VOICE = LANG === 'en' ? { name: process.env.VIDEO_VOICE || 'Samantha', rate: 168 } : { name: process.env.VIDEO_VOICE || 'Sinji', rate: 160 };
const out = `${ROOT}video/build/audio/${LANG}`;
mkdirSync(out, { recursive: true });

for (const s of lesson.scenes) {
	const text = spoken(s.text).replace(/\s+/g, ' ').trim();
	const wav = `${out}/${s.id}.wav`;
	const stamp = `${out}/${s.id}.txt`;
	const key = `${VOICE.name}|${VOICE.rate}|${text}`;
	if (existsSync(wav) && existsSync(stamp) && readFileSync(stamp, 'utf8') === key) continue;
	const aiff = `${out}/${s.id}.aiff`;
	execFileSync('say', ['-v', VOICE.name, '-r', String(VOICE.rate), '-o', aiff, text]);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ac', '1', '-ar', '24000', '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', wav]);
	rmSync(aiff);
	writeFileSync(stamp, key);
	const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString().trim();
	console.log(`${LANG} ${s.id} ${Number(d).toFixed(1)}s`);
}
