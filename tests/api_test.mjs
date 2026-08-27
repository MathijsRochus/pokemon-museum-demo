// The API client, the classifier, the rarity tiers and the request pool —
// everything that can be tested without a DOM or a canvas.
import { load, strings } from './harness.mjs';

const table = strings();
globalThis.Image = class { set crossOrigin(v){} set src(u){} };

const mod = await load({
  skip: ['src/scene.js', 'src/ui/hud.js', 'src/ui/dialogue.js', 'src/ui/dex.js',
         'src/ui/gallery.js', 'src/ui/export.js', 'src/boot.js',
         'src/art/characters.js', 'src/art/markers.js', 'src/marlot.js'],
  exports: ['DMG', 'I18n', 'classifyTypes', 'CATEGORIES', 'PROCEDURAL_ART', 'ROOMS',
            'EXHIBIT_SLOTS', 'isDoorTile', 'doorKeyFor', 'roomIndexByKey', 'roomName',
            'MuseumAPI', 'installExhibits', 'FALLBACK_EXHIBITS', 'demoExhibit', 'isExhibitTile']
});

// The string table, loaded the way the browser would.
mod.I18n.strings = table.strings;

let bad = 0;
const check = (ok, msg) => { if (!ok) { console.log('  FAIL: ' + msg); bad++; } };

// ---- classifier ----
const cases = [
  ['champagneglas','vessel'], ['kookpot','vessel'], ['fluitglas','vessel'],
  ['bijzettafel','furniture'], ['stapelstoel','furniture'], ['ledikant','furniture'],
  ['wandtegel','tile'], ['decortegel','tile'], ['haardsteen','tile'],
  ['tafellaken','textile'], ['interieurweefsel','textile'], ['gordijnstof','textile'],
  ['productverpakking','device'], ['espresso-apparaat','device'], ['theeketel','device'],
  ['schoteltje','vessel'], ['mokkaschoteltje','vessel'], ['kannetje','vessel'],
  ['bordje','vessel'], ['kopje','vessel'], ['eierdopje','vessel'],
  ['kandelaar','device'],
  ['metaal',null], ['stop',null], ['fragment',null], ['onderdeel (associatie)',null],
  ['staal (monster)',null], ['beeldhouwwerk',null], ['beeldje',null],
  ['zetel/maquette','furniture'], ['vaas/productverpakking','vessel'],
];
cases.forEach(([type, want]) => {
  const got = mod.classifyTypes([type]);
  check(got === want, `classify("${type}") = ${got}, wanted ${want}`);
});
// Invariants the suffix matching must never break.
[['kandelaar','vessel'], ['ledikant','textile'], ['metaal','textile']].forEach(([type, forbidden]) => {
  check(mod.classifyTypes([type]) !== forbidden, `${type} must never classify as ${forbidden}`);
});
console.log(`  classifier: ${cases.length + 3} assertions`);

// ---- category registry ----
check(mod.CATEGORIES.map(c => c.key).join(',') === 'textile,tile,furniture,vessel,device',
  `category order is ${mod.CATEGORIES.map(c => c.key).join(',')} — narrowest must come first`);
mod.CATEGORIES.forEach(c => {
  check(typeof mod.PROCEDURAL_ART[c.key] === 'function', `no drawing registered for ${c.key}`);
  check(c.keywords.length > 0, `${c.key} has no keywords`);
});
['skull','vase','mask','astrolabe'].forEach(n =>
  check(typeof mod.PROCEDURAL_ART[n] === 'function', `no drawing for demo piece ${n}`));
console.log(`  registry: ${mod.CATEGORIES.length} categories, ${Object.keys(mod.PROCEDURAL_ART).length} drawings`);

// ---- rarity ----
mod.DMG.typeCounts = new Map([['vaas', 657], ['pique-fleurs', 8], ['unicumtype', 1], ['stapeldoos', 39]]);
[[1,'unicum'],[5,'zeer'],[6,'zeldzaam'],[20,'zeldzaam'],[21,'ongewoon'],[80,'ongewoon'],[81,'gewoon'],[770,'gewoon']]
  .forEach(([n, key]) => {
    const tier = mod.DMG.TIERS.find(t => n <= t.max);
    check(tier.key === key, `count ${n} -> ${tier.key}, wanted ${key}`);
  });
// Rarest of the two wins: stapeldoos (39) over vaas (657). 39 falls in
// ongewoon under the retuned thresholds [1, 5, 20, 80].
const r = mod.DMG.rarityFor(['stapeldoos', 'vaas']);
check(r && r.count === 39 && r.key === 'ongewoon', `rarest-type-wins failed: ${JSON.stringify(r)}`);
check(r.label === table.strings['rarity.ongewoon'], `rarity label not translated: ${r.label}`);

// And one that lands in zeldzaam, to prove the band is reachable.
mod.DMG.typeCounts.set('zeldzaamtype', 16);
check(mod.DMG.rarityFor(['zeldzaamtype']).key === 'zeldzaam', 'count 16 should be zeldzaam');
check(mod.DMG.rarityFor(['onbekend-type']) === null, 'unknown type should have no rarity');
console.log('  rarity: 8 boundaries + rarest-wins + label lookup');

// ---- request pool ----
let peak = 0, live = 0;
const tasks = Array.from({length: 20}, (_, i) => async () => {
  live++; peak = Math.max(peak, live);
  await new Promise(r => setTimeout(r, 10));
  live--;
  if (i === 7) throw new Error('boom');
  return i;
});
const out = await mod.DMG.pool(tasks, 5);
check(peak === 5, `pool concurrency reached ${peak}, limit was 5`);
check(out.every((v, i) => v === (i === 7 ? null : i)), 'pool did not preserve order / null a rejection');
console.log('  pool: concurrency, order, rejection-to-null');

// ---- retry semantics ----
for (const [status, expected] of [[403,1],[404,1],[429,3],[500,3],[503,3]]) {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok:false, status, json: async()=>({}) }; };
  try { await mod.DMG.json('x'); } catch {}
  check(calls === expected, `HTTP ${status}: ${calls} attempts, wanted ${expected}`);
}
console.log('  retry: 4xx once, 429 and 5xx retried');

// ---- rooms ----
check(mod.EXHIBIT_SLOTS === 16, `EXHIBIT_SLOTS is ${mod.EXHIBIT_SLOTS}, wanted 16`);
mod.ROOMS.forEach(room => {
  check(room.grid.length === 10, `${room.key}: ${room.grid.length} rows`);
  room.rows.forEach((r, i) => check(r.length === 15, `${room.key} row ${i}: ${r.length} wide`));
  check(room.exhibitTiles.length === 4, `${room.key}: ${room.exhibitTiles.length} plinths`);
  check(!!table.strings[room.nameKey], `${room.key}: nameKey ${room.nameKey} not in the string table`);
  for (let y = 0; y < room.grid.length; y++) for (let x = 0; x < room.grid[y].length; x++) {
    const tv = room.grid[y][x];
    if (tv >= 2 && !mod.isDoorTile(tv)) {
      const below = room.grid[y + 1] ? room.grid[y + 1][x] : undefined;
      check(below === 0, `${room.key}: plinth at (${x},${y}) has no floor below`);
    }
    if (mod.isDoorTile(tv)) {
      const exit = room.exits[mod.doorKeyFor(tv)];
      check(!!exit, `${room.key}: undeclared doorway at (${x},${y})`);
      if (exit) {
        const target = mod.roomIndexByKey(exit.to);
        check(target >= 0, `${room.key}: doorway to unknown room ${exit.to}`);
        const [sx, sy] = exit.at;
        check(mod.ROOMS[target].grid[sy][sx] === 0, `${room.key} -> ${exit.to} lands on a non-floor tile`);
      }
    }
  }
});
const reach = new Set([0]); const q = [0];
while (q.length) { const i = q.shift();
  for (const k of Object.keys(mod.ROOMS[i].exits)) {
    const t = mod.roomIndexByKey(mod.ROOMS[i].exits[k].to);
    if (t >= 0 && !reach.has(t)) { reach.add(t); q.push(t); } } }
check(reach.size === mod.ROOMS.length, `only ${reach.size}/${mod.ROOMS.length} rooms reachable from the entrance`);
const tiles = mod.ROOMS.flatMap(r => r.exhibitTiles).sort((a,b)=>a-b);
check(tiles.every((v,i) => v === i+2), `exhibit tile values not contiguous from 2: ${tiles.join(',')}`);
console.log(`  rooms: ${mod.ROOMS.length} wings, ${mod.EXHIBIT_SLOTS} plinths, all reachable`);

// ---- demo exhibits resolve through the string table ----
const demo = mod.demoExhibit(mod.FALLBACK_EXHIBITS[0]);
check(demo.name === table.strings['demo.skull.name'], `demo name not from the table: ${demo.name}`);
check(!!demo.description && !!demo.art, 'demo exhibit missing description or art');
mod.installExhibits(Array.from({length: mod.EXHIBIT_SLOTS}, (_, i) => mod.demoExhibit(mod.FALLBACK_EXHIBITS[i % 4])));
check(Object.keys(mod.MuseumAPI).length === mod.EXHIBIT_SLOTS, 'installExhibits did not fill every slot');
check(tiles.every(t => mod.isExhibitTile(t)), 'a plinth tile is not recognised as an exhibit');
console.log('  exhibits: demo text from the table, all slots installed');

console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nall api/classifier/rarity/rooms checks passed');
process.exit(bad ? 1 : 0);
