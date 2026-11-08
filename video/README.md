# BitBrick tutorial videos

- `bitbrick-tutorial-english.mp4` (3:08) and `bitbrick-tutorial-cantonese.mp4` (3:58): 1080p, narrated, with captions.

They are recorded from the real app by a script, so they can be remade whenever the interface changes:

```sh
php artisan serve                  # the app on http://localhost:8000
cd designer && npm run build       # the bundle the video shows
video/build.sh                     # both languages (or: video/build.sh en | yue)
```

`build.sh` needs Google Chrome, ffmpeg and the macOS voices (Samantha for English, Sinji for Cantonese; `say -v '?'` lists
what is installed). It signs in with a throwaway `demo` account that it creates and deletes itself.

| File | What it is |
| --- | --- |
| `lesson.mjs` | The storyboard: every scene's narration in both languages and the on-screen actions. Edit the text or the steps here. |
| `narrate.mjs` | Makes the narration clips (only the ones whose text changed). |
| `record.mjs`, `lib/record.mjs` | Drives Chrome, shows the cards, highlights and captions, and records the screen. |
| `lib/assemble.mjs`, `lib/cdp.mjs` | Joins frames and narration into the MP4; the Chrome driver. Both come from the n project's `skills/video`. |
| `lib/demo-user.php` | Creates and removes the demo account. |

`VIDEO_LANG=en|yue ONLY=scene,scene SHOTS=1 node video/record.mjs` rehearses a few scenes and saves a picture after each into
`video/build/shots/`. The narration voice can be changed with `VIDEO_VOICE`.

To use the n project's neural voices (OmniVoice) instead of `say`, produce `build/audio/<lang>/<scene>.wav` with them. Nothing
else changes. OmniVoice needs PyTorch 2.6 or newer, which has no macOS Intel build, so it was not used here.
