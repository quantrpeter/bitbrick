// node assemble.mjs <takeDir> <audioDir> <out.mp4>
// Frames from the screencast timeline, narration clips at their scene marks, and a
// synthesized "pop" at every time the page played one (the screencast has no audio).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [take, audioDir, out] = process.argv.slice(2);
const tl = JSON.parse(readFileSync(`${take}/timeline.json`, 'utf8'));
const frames = tl.frames.filter((f) => f.t >= tl.startT - 0.05 && f.t <= tl.endT);
const first = tl.frames.filter((f) => f.t < tl.startT).at(-1) ?? frames[0];
if (first !== frames[0]) frames.unshift({ ...first, t: tl.startT });

let list = '';
for (let i = 0; i < frames.length; i++) {
	const next = i + 1 < frames.length ? frames[i + 1].t : tl.endT;
	const d = Math.max(0.001, next - Math.max(frames[i].t, tl.startT));
	list += `file '${resolve(frames[i].file)}'\nduration ${d.toFixed(4)}\n`;
}
list += `file '${resolve(frames.at(-1).file)}'\n`;
writeFileSync(`${take}/frames.txt`, list);

const total = tl.endT - tl.startT;

const SR = 48000;
const pcm = new Float32Array(Math.ceil(total * SR) + SR);
const popLen = Math.round(0.07 * SR);
const pops = (tl.pops || []).filter((t) => t >= tl.startT && t <= tl.endT);
for (const t of pops) {
	const at = Math.round((t - tl.startT) * SR);
	let phase = 0;
	for (let i = 0; i < popLen && at + i < pcm.length; i++) {
		const k = i / popLen;
		phase += (2 * Math.PI * (900 - 650 * k)) / SR;
		pcm[at + i] += Math.sin(phase) * Math.exp(-k * 6) * Math.min(1, i / 48) * 0.6;
	}
}
const wav = Buffer.alloc(44 + pcm.length * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + pcm.length * 2, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(pcm.length * 2, 40);
for (let i = 0; i < pcm.length; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
writeFileSync(`${take}/pops.wav`, wav);

const inputs = [];
const filters = [];
tl.marks.forEach((m, i) => {
	inputs.push('-i', `${audioDir}/${m.id}.wav`);
	const ms = Math.round((m.t - tl.startT) * 1000 + 250);
	filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[a${i}]`);
});
const popIn = tl.marks.length + 1;
inputs.push('-i', `${take}/pops.wav`);
filters.push(`${tl.marks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${tl.marks.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[nar]`);
filters.push(`[${popIn}:a]volume=0.35[pop]`);
filters.push(`[nar][pop]amix=inputs=2:normalize=0:duration=first,apad,atrim=0:${total.toFixed(2)},afade=t=out:st=${(total - 1).toFixed(2)}:d=1[aout]`);
filters.push(`[0:v]fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[vout]`);

execFileSync(
	'ffmpeg',
	['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${take}/frames.txt`, ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', '-t', total.toFixed(2), out],
	{ stdio: 'inherit' },
);
console.log('wrote', out, total.toFixed(1) + 's', pops.length, 'pops');
