import fs from 'fs';
import { ROOT, SCRIPTS, checkScriptOrder, strings } from './harness.mjs';

let bad = 0;
const check = (ok, msg) => { if (!ok) { console.log('  FAIL: ' + msg); bad++; } };

// 1. Every script in index.html exists, in the order the harness expects.
const order = checkScriptOrder();
check(order.same, `index.html script order differs from harness:\n    html: ${order.inHtml.join(' ')}\n    want: ${order.expected.join(' ')}`);
console.log(`  ${order.inHtml.length} scripts in index.html`);
SCRIPTS.forEach(f => check(fs.existsSync(`${ROOT}/${f}`), `missing file ${f}`));

// 2. No duplicate top-level definitions — a redeclared function silently wins
//    and that is exactly how updateRoomLabel broke during the split.
const defs = new Map();
for (const f of SCRIPTS) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  for (const m of src.matchAll(/^(?:async )?(?:function|const|let|class) ([A-Za-z_$][\w$]*)/gm)) {
    const name = m[1];
    if (defs.has(name)) check(false, `${name} defined in both ${defs.get(name)} and ${f}`);
    else defs.set(name, f);
  }
}
console.log(`  ${defs.size} unique top-level definitions, no duplicates`);

// 3. Every t('key') in the source exists in the string table, and every string
//    in the table is referenced somewhere. Keys assembled at runtime — t('rarity.'
//    + tier.key), or stored as data like nameKey: 'room.inkomhal' — are found by
//    looking for the literal anywhere in the sources, not just inside a t() call.
const table = strings();
const keys = new Set(Object.keys(table.strings));
const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
const allSource = SCRIPTS.map(f => fs.readFileSync(`${ROOT}/${f}`, 'utf8')).join('\n') + html;

// Strip comments before looking for t() calls, or the examples in i18n.js's own
// documentation get read as real keys.
const codeOnly = SCRIPTS.map(f => fs.readFileSync(`${ROOT}/${f}`, 'utf8')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')).join('\n');

const prefixes = new Set();
const concrete = new Set();
for (const m of codeOnly.matchAll(/\bt\(\s*'([^']+)'\s*(\+)?/g)) {
  if (m[2]) prefixes.add(m[1]); else concrete.add(m[1]);
}
for (const m of html.matchAll(/data-i18n(?:-html|-placeholder|-alt)?="([^"]+)"/g)) concrete.add(m[1]);

concrete.forEach(k => check(keys.has(k), `t('${k}') has no entry in content/nl.json`));
[...prefixes].forEach(p => check([...keys].some(k => k.startsWith(p)),
  `t('${p}' + ...) matches no key in content/nl.json`));

// Referenced = named in a t() call, or its literal appears anywhere in source.
const unused = [...keys].filter(k =>
  !concrete.has(k) &&
  ![...prefixes].some(p => k.startsWith(p)) &&
  !allSource.includes(`'${k}'`) && !allSource.includes(`"${k}"`));
check(unused.length === 0, `unused strings in content/nl.json: ${unused.join(', ')}`);
console.log(`  ${keys.size} strings: ${concrete.size} named directly, ${prefixes.size} prefix group(s), ${unused.length} unused`);

// 4. Nothing player-facing left hardcoded: no Dutch sentence literals in src.
//
// One function is exempt. I18n.showLoadFailure() is what runs when the string
// table itself could not be read, so its message cannot come from the table —
// it is the only copy that has to live in the code.
const DUTCH = /'[^']*\b(?:de|het|een|je|niet|zijn|voor|met|van|naar|objecten|zaal)\b [^']*'/;
const EXEMPT = ['showLoadFailure'];

for (const f of SCRIPTS) {
  const src = fs.readFileSync(`${ROOT}/${f}`, 'utf8');
  const lines = src.split('\n');
  let exemptUntil = -1;

  lines.forEach((line, i) => {
    if (EXEMPT.some(name => line.includes(name + '('))) {
      // Exempt to the end of that function, found by its closing brace at the
      // same indentation.
      const indent = line.search(/\S/);
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].search(/\S/) === indent && /^\s*\}/.test(lines[j])) { exemptUntil = j; break; }
      }
    }
    if (i <= exemptUntil) return;
    if (/^\s*\/\//.test(line) || /console\.(warn|error|log)/.test(line)) return;
    if (DUTCH.test(line)) check(false, `${f}:${i + 1} looks like hardcoded Dutch: ${line.trim().slice(0, 70)}`);
  });
}

// 5. Nothing went missing. Removing a one-line helper during the split took
//    difficultyFor() with it — the regex wanted a closing brace on its own line
//    and swallowed everything up to the next one. The scene threw once a frame
//    and the canvas rendered black. This is the cheap way to catch that class of
//    mistake: name what has to exist, and check it does.
const MUST_EXIST = [
  // api + state
  'DMG', 'MuseumAPI', 'installExhibits', 'isExhibitTile', 'tileValueFor',
  'GameState', 'uiIsBlocking', 'FALLBACK_EXHIBITS', 'demoExhibit',
  // strings
  'I18n', 't',
  // art
  'PALETTE', 'pixelPainter', 'makeTexture', 'makeFloorTexture', 'makeWallTexture',
  'drawPedestal', 'drawCaseGlare', 'makeExhibitTextures', 'makePlayerTexture',
  'makeMarlotTexture', 'makeDoorTexture', 'makeWarnTexture', 'makeMarkerTextures',
  'registerCategory', 'registerArt', 'classifyTypes', 'stemsOf', 'drawUnknownExhibit',
  'drawVessel', 'drawFurniture', 'drawTile', 'drawTextile', 'drawDevice',
  'drawSkull', 'drawMask', 'drawAstrolabe',
  // rooms
  'ROOMS', 'DOOR_BASE', 'isDoorTile', 'doorKeyFor', 'compileRoom', 'roomIndexByKey', 'roomName',
  // marlot + scene
  'PHASE', 'RAMP_MS', 'difficultyFor', 'Marlot', 'MuseumScene',
  // ui
  'showToast', 'updateProgressCounter', 'updateRoomLabel', 'updateDangerMeter',
  'initDangerControls', 'openDialogue', 'closeDialogue', 'trimForDialogue',
  'togglePokedex', 'rarityHtml', 'factsHtml', 'creditHtml', 'formatDimensions',
  'showGameOver', 'buildEndGallery', 'galleryCard', 'categoryArtUrl', 'cropToContent',
  'downloadMuseumdex', 'saveFile',
  // util + boot
  'escapeHtml', 'cssEscape', 'formatTime', 'lerp', 'restartRun', 'startGame',
  'setLoadProgress', 'finishLoading', 'updateSourceNote'
];
const allDefs = new Set(defs.keys());
const absent = MUST_EXIST.filter(n => !allDefs.has(n));
check(absent.length === 0, `defined nowhere in src/: ${absent.join(', ')}`);
console.log(`  ${MUST_EXIST.length} expected definitions, ${absent.length} missing`);

console.log(bad ? `\n${bad} STRUCTURE CHECK(S) FAILED` : '\nall structure checks passed');
process.exit(bad ? 1 : 0);
