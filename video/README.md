# BitBrick tutorial videos

Two tutorials from one storyboard (`lesson.mjs`): English and Cantonese, 1080p, narrated, with captions. The screen is recorded
from the real app by a script, so the videos can be remade whenever the interface changes. The narration is made with the n
project's OmniVoice voices (the same method as `n/skills/video`).

Output: `bitbrick-tutorial-english.mp4` and `bitbrick-tutorial-cantonese.mp4`, in this folder.

## How to make the videos

OmniVoice needs PyTorch 2.6 or newer, which has no Intel Mac build, so there are two steps on two machines
(or both on one Apple Silicon Mac that has this project, Chrome, ffmpeg, PHP and node).

**1. On the Mac that can run OmniVoice: make the narration** (needs the n project and its `.venv`)

```sh
video/omnivoice/run.sh            # both languages; or: video/omnivoice/run.sh yue
```

It writes `video/build/audio/<lang>/<scene>.wav` (cloned from n's `voices/en.wav` and `voices/yue.wav`, speed 0.95, seed 11) and
packs them into `video/bitbrick-tutorial-audio.zip`. If n is not in `~/workspace/n` set `N_REPO=...`; if OmniVoice is not in
n's `.venv` set `PYTHON=...`.

**2. On the Mac with the app: record and join the videos**

```sh
cd video && unzip -o bitbrick-tutorial-audio.zip          # puts the clips in video/build/audio/
php artisan serve                                          # in the project folder: the app on http://localhost:8000
(cd designer && npm run build)                             # the bundle the video shows
video/build.sh                                             # both videos; or: video/build.sh en | yue
```

`build.sh` checks that every scene has OmniVoice narration for the current text (it says which are missing), signs in with a
throwaway `demo` account that it creates and deletes itself, records, and writes the two MP4s into `video/`. Needs Google Chrome
and ffmpeg.

Changed the text in `lesson.mjs`? Run `node video/export-scripts.mjs`, then step 1 again (only changed scenes are remade).

## Quick preview with another voice

`VIDEO_TTS=edge video/build.sh` uses Microsoft's neural voices (needs `python3.12 -m venv video/.venv && video/.venv/bin/pip
install edge-tts` once; the narration text is sent to Microsoft's online service). `VIDEO_TTS=say` uses the robotic macOS
voices, offline. `VIDEO_VOICE=<name>` picks another voice. `VIDEO_TTS=none` uses whatever is in `build/audio` without checking.

## Files

| File | What it is |
| --- | --- |
| `lesson.mjs` | The storyboard: every scene's narration in both languages and the on-screen actions. Edit the text or the steps here. |
| `omnivoice/tts.py`, `omnivoice/run.sh` | Makes the narration with OmniVoice (run on the machine that can). `scripts-*.json` is the text it reads. |
| `export-scripts.mjs` | Writes `omnivoice/scripts-en.json` and `scripts-yue.json` from `lesson.mjs`. |
| `narrate.mjs` | Checks the OmniVoice clips are there (or makes preview clips with `edge` / `say`). |
| `record.mjs`, `lib/record.mjs` | Drives Chrome, shows the cards, highlights and captions, and records the screen. |
| `lib/assemble.mjs`, `lib/cdp.mjs` | Joins frames and narration into the MP4; the Chrome driver. Both come from the n project's `skills/video`. |
| `lib/demo-user.php` | Creates and removes the demo account. |

`VIDEO_LANG=en|yue ONLY=scene,scene SHOTS=1 node video/record.mjs` rehearses a few scenes and saves a picture after each into
`video/build/shots/`.
