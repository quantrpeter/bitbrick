#!/bin/zsh
# usage: video/build.sh [en|yue|both]      (default: both)
# Needs the app on http://localhost:8000 (php artisan serve) with the designer bundle built (cd designer && npm run build),
# Google Chrome, ffmpeg and the macOS `say` voices (Samantha for English, Sinji for Cantonese).
# Writes video/bitbrick-tutorial-english.mp4 and video/bitbrick-tutorial-cantonese.mp4.
set -e
cd "$(dirname "$0")"
which=${1:-both}
[ "$which" = both ] && langs=(en yue) || langs=($which)

for lang in $langs; do
	name=$([ "$lang" = en ] && echo english || echo cantonese)
	export VIDEO_LANG=$lang
	node narrate.mjs
	node record.mjs > build/rec-$lang.log 2>&1 || { echo "recording failed, see video/build/rec-$lang.log"; tail -20 build/rec-$lang.log; exit 1; }
	node lib/assemble.mjs build/take/$lang build/audio/$lang build/final-$lang.mp4
	errs=$(ffmpeg -v error -i build/final-$lang.mp4 -f null - 2>&1 | wc -l | tr -d ' ')
	[ "$errs" = 0 ] || { echo "decode errors in $lang: $errs"; exit 1; }
	cp build/final-$lang.mp4 bitbrick-tutorial-$name.mp4
	echo "done: bitbrick-tutorial-$name.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 bitbrick-tutorial-$name.mp4)s)"
done
