// Narration clips for the lesson: build/audio/<lang>/<scene>.wav, 24 kHz mono.
//
//   VIDEO_LANG=en|yue node video/narrate.mjs
//
// Engines (VIDEO_TTS):
//   omnivoice (default)  the n project's OmniVoice voices. They cannot run on an Intel Mac, so this only CHECKS that the clips made
//                        by omnivoice/tts.py (on a machine that can run OmniVoice) are in build/audio and match the current text.
//   edge                 Microsoft's neural voices through edge-tts. The narration text is sent to Microsoft's online service.
//                        English: en-US-AvaNeural, Cantonese: zh-HK-HiuGaaiNeural (change with VIDEO_VOICE).
//   say                  the macOS voices (Samantha, Sinji). Offline, but they sound robotic.
//   none                 use whatever is in build/audio without checking.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { LANG, spoken } from './lib/record.mjs';
import { lesson } from './lesson.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ENGINE = process.env.VIDEO_TTS || 'omnivoice';
if (ENGINE === 'none') process.exit(0);


const VOICES = {
	edge: { en: { name: 'en-US-AvaNeural', rate: '-2%' }, yue: { name: 'zh-HK-HiuGaaiNeural', rate: '+8%' } },
	say: { en: { name: 'Samantha', rate: 168 }, yue: { name: 'Sinji', rate: 160 } },
};

if (ENGINE === 'omnivoice') {
	const missing = [];
	for (const s of lesson.scenes) {
		const text = spoken(s.text).replace(/\s+/g, ' ').trim();
		const wav = `${ROOT}video/build/audio/${LANG}/${s.id}.wav`;
		const stamp = `${ROOT}video/build/audio/${LANG}/${s.id}.txt`;
		if (!existsSync(wav) || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== `omnivoice|${text}`) missing.push(s.id);
	}
	if (missing.length) {
		console.error(`No OmniVoice narration for ${LANG} scenes: ${missing.join(', ')}.
Make it with omnivoice/tts.py on a machine that can run OmniVoice (see video/README.md), and put video/build/audio/${LANG}/ here.
(VIDEO_TTS=edge or VIDEO_TTS=say gives a quick preview voice instead.)`);
		process.exit(1);
	}
	console.log(`${LANG}: OmniVoice narration found for all ${lesson.scenes.length} scenes`);
	process.exit(0);
}

const voice = { ...VOICES[ENGINE][LANG], ...(process.env.VIDEO_VOICE ? { name: process.env.VIDEO_VOICE } : {}) };
const out = `${ROOT}video/build/audio/${LANG}`;
mkdirSync(out, { recursive: true });

const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';

for (const s of lesson.scenes) {
	const text = spoken(s.text).replace(/\s+/g, ' ').trim();
	const wav = `${out}/${s.id}.wav`;
	const stamp = `${out}/${s.id}.txt`;
	const key = `${ENGINE}|${voice.name}|${voice.rate}|${text}`;
	if (existsSync(wav) && existsSync(stamp) && readFileSync(stamp, 'utf8') === key) continue;

	const raw = `${out}/${s.id}.${ENGINE === 'edge' ? 'mp3' : 'aiff'}`;
	if (ENGINE === 'edge') {
		// the text goes through a file so quotes and dashes in it cannot be read as options
		writeFileSync(`${out}/${s.id}.in.txt`, text);
		let tries = 0;
		for (;;) {
			try {
				execFileSync(`${ROOT}video/.venv/bin/edge-tts`, ['--voice', voice.name, `--rate=${voice.rate}`, '--file', `${out}/${s.id}.in.txt`, '--write-media', raw], { stdio: ['ignore', 'ignore', 'pipe'] });
				break;
			} catch (e) {
				if (++tries >= 3) throw new Error(`edge-tts failed for ${s.id}: ${e.stderr?.toString().slice(0, 300)}`);
			}
		}
		rmSync(`${out}/${s.id}.in.txt`);
	} else {
		execFileSync('say', ['-v', voice.name, '-r', String(voice.rate), '-o', raw, text]);
	}
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-ac', '1', '-ar', '24000', '-af', TRIM, wav]);
	rmSync(raw);
	writeFileSync(stamp, key);
	const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString().trim();
	console.log(`${LANG} ${s.id} ${Number(d).toFixed(1)}s`);
}
