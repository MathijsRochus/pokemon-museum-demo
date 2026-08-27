// Shared test harness: loads the game's src files the way index.html does —
// concatenated in script order, one shared scope — and hands back the globals.
// Replaces the old trick of slicing game.js by string offsets.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// The repo root, found relative to this file rather than hardcoded.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Kept in the same order as the <script> tags; a mismatch here would hide a
// real ordering bug in the page.
export const SCRIPTS = [
  'src/util.js', 'src/i18n.js', 'src/api.js', 'src/state.js',
  'src/art/palette.js', 'src/art/core.js',
  'src/art/categories/index.js',
  'src/art/categories/textile.js', 'src/art/categories/tile.js',
  'src/art/categories/furniture.js', 'src/art/categories/vessel.js',
  'src/art/categories/device.js', 'src/art/categories/unknown.js',
  'src/art/categories/demo.js',
  'src/art/characters.js', 'src/art/markers.js',
  'src/rooms.js', 'src/marlot.js', 'src/scene.js',
  'src/ui/hud.js', 'src/ui/dialogue.js', 'src/ui/dex.js',
  'src/ui/gallery.js', 'src/ui/export.js',
  'src/boot.js'
];

// Verify the harness list matches index.html, so the two cannot drift.
export function checkScriptOrder() {
  const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
  // Local scripts only — the Phaser CDN tag is not ours to order. The ?v=
  // cache buster is stripped: it is a release marker, not part of the path.
  const inHtml = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(m => m[1].split('?')[0])
    .filter(src => !/^https?:/.test(src));
  const same = inHtml.length === SCRIPTS.length && inHtml.every((s, i) => s === SCRIPTS[i]);
  return { same, inHtml, expected: SCRIPTS };
}

// `skip` drops files that need a DOM the caller has not stubbed (boot.js runs
// init() on load, for instance).
export async function load({ skip = [], exports = [] } = {}) {
  const files = SCRIPTS.filter(f => !skip.includes(f));
  const code = files.map(f => `\n// ==== ${f} ====\n` + fs.readFileSync(`${ROOT}/${f}`, 'utf8')).join('\n');
  const names = exports.length ? exports : [];
  const src = code + (names.length ? `\nexport { ${names.join(', ')} };\n` : '');
  // Written next to this file so the import resolves, and named by content so
  // repeated runs reuse it rather than piling up.
  const name = `_bundle_${Math.abs(hash(files.join(',') + names.join(','))).toString(36)}.mjs`;
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), name);
  fs.writeFileSync(file, src);
  return import(file);
}

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

// The string table, for tests that assert on copy.
export function strings() {
  return JSON.parse(fs.readFileSync(`${ROOT}/content/nl.json`, 'utf8'));
}
