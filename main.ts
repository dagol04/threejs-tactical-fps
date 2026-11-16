// Harbor Yard — "Make the best three.js tactical FPS" (threejs-fps-02) entry program.
//
// Node 22, standard library only. It takes the game in this directory's game/
// folder and the screenshots in screenshots/, copies them to /output (or
// $MAKEFUN_OUTPUT_DIR outside the grader's container), and writes
// /output/dossier.json — the summary the judge reads — using the vendored
// make.fun library in vendor/makefun-threejs.ts.
//
// Run it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// The game is plain static files: the browser loads it as ES modules with
// three.js from the import map in game/index.html. No build step, no network.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean output so a removed screenshot or game file can never
// linger in an entry from an earlier run.
mkdirSync(out, { recursive: true });
for (const sub of ['game', 'screenshots']) {
  const target = join(out, sub);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all (game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log(`Harbor Yard entry written to ${out}`);
