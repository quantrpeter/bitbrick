#!/bin/zsh
# Run this on the Mac that can run OmniVoice (Apple Silicon, PyTorch 2.6+), as n/skills/video does.
#   video/omnivoice/run.sh [en|yue]        (no argument = both languages)
# Writes video/build/audio/<lang>/<scene>.wav and packs them into video/bitbrick-tutorial-audio.zip to copy to the Mac that
# makes the videos.  N_REPO = where the n project is (default ~/workspace/n); PYTHON = its Python (default n's .venv).
set -e
cd "$(dirname "$0")"
export N_REPO=${N_REPO:-$HOME/workspace/n}
PY=${PYTHON:-$N_REPO/skills/video/.venv/bin/python}
[ -x "$PY" ] || { echo "No Python at $PY. Set PYTHON=... to the Python with OmniVoice installed (n/skills/video/requirements.txt)."; exit 1; }
"$PY" tts.py "$@"
cd ..
zip -qr bitbrick-tutorial-audio.zip build/audio
echo "Done: $(pwd)/bitbrick-tutorial-audio.zip  (unzip it inside the video folder on the other Mac: unzip -o bitbrick-tutorial-audio.zip)"
