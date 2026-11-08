// node video/record.mjs   (VIDEO_LANG=en|yue; ONLY=scene,scene rehearses some scenes; SHOTS=1 saves a picture after each)
import { record } from './lib/record.mjs';
import { lesson } from './lesson.mjs';

await record(lesson);
