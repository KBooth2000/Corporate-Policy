// Cross-platform wrapper: runs the Gradle wrapper in this folder (gradlew.bat on Windows, ./gradlew elsewhere).
//   node android/run-gradle.mjs assembleRelease bundleRelease
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const win = process.platform === 'win32';
const r = spawnSync(win ? 'gradlew.bat' : './gradlew', process.argv.slice(2), { cwd: dir, stdio: 'inherit', shell: win });
process.exit(r.status ?? 1);
