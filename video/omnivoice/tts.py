"""Narration for the BitBrick tutorial videos with OmniVoice, the same way as n/skills/video (robotarm/tts.py).

Cloned from the reference voices in n/skills/video/voices (en.wav, yue.wav), speed 0.95, seed 11, on the CPU like n's scripts.
Run this on a machine that can run OmniVoice (PyTorch 2.6 or newer, e.g. an Apple Silicon Mac):

    cd <bitbrick>/video/omnivoice
    <n>/skills/video/.venv/bin/python tts.py            # both languages
    <n>/skills/video/.venv/bin/python tts.py yue        # or one: en | yue

Reads scripts-<lang>.json (node video/export-scripts.mjs) and writes ../build/audio/<lang>/<scene>.wav. A clip is only made
again when its text changed. Then build the videos with:  VIDEO_TTS=none video/build.sh

N_REPO is where the n project is (default ~/workspace/n); it supplies the OmniVoice wrapper and the reference voices.
"""
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
N_REPO = Path(os.environ.get("N_REPO", Path.home() / "workspace/n"))
sys.path.insert(0, str(N_REPO / "pythonscript/textToSpeech"))
from tts import load_model, pick_dtype, synthesize  # noqa: E402

VOICES = N_REPO / "skills/video/voices"
REF = {
    "en": (VOICES / "en.wav", "Hi everyone! Are you ready? Today we are going to make something really fun together."),
    "yue": (VOICES / "yue.wav", "大家好！準備好未呀？今日我哋一齊整一啲好好玩嘅嘢。"),
}
SEED = int(os.environ.get("TTS_SEED", "11"))
DEVICE = os.environ.get("OMNIVOICE_DEVICE", "cpu")


def trim(w: np.ndarray, sr: int = 24000) -> np.ndarray:
    idx = np.where(np.abs(w) > 0.01)[0]
    if not len(idx):
        return w
    return w[max(0, idx[0] - int(0.05 * sr)) : idx[-1] + int(0.15 * sr)]


langs = sys.argv[1:] or ["en", "yue"]
model = load_model("k2-fsa/OmniVoice", DEVICE, pick_dtype(DEVICE))
for lang in langs:
    ref, ref_text = REF[lang]
    out = HERE.parent / "build" / "audio" / lang
    out.mkdir(parents=True, exist_ok=True)
    for scene in json.load(open(HERE / f"scripts-{lang}.json")):
        text = re.sub(r"\[\[.*?\]\]", "", scene["text"])
        stamp = out / f"{scene['id']}.txt"
        wav = out / f"{scene['id']}.wav"
        key = f"omnivoice|{text}"
        if wav.exists() and stamp.exists() and stamp.read_text() == key:
            continue
        torch.manual_seed(SEED)
        w = trim(synthesize(model, text, language=lang, ref_audio=str(ref), ref_text=ref_text, speed=0.95))
        sf.write(wav, w, 24000)
        stamp.write_text(key)
        print(lang, scene["id"], f"{len(w) / 24000:.2f}s", file=sys.stderr, flush=True)
