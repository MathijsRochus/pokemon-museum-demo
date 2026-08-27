// Runs every suite. `node tests/run.mjs` from the repo root.
//
// structure  — the folder layout, script order, no duplicate definitions, and
//              that every string key in the code resolves in content/nl.json.
//              This is the one to run after editing copy.
// api        — the collection client, the category classifier, the rarity
//              tiers, the request pool and the floor plan. No network.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = ['structure_test.mjs', 'api_test.mjs'];

let failed = 0;
for (const suite of suites) {
  console.log(`\n── ${suite} ${'─'.repeat(Math.max(0, 46 - suite.length))}`);
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(here, suite)], { stdio: 'inherit' });
    child.on('exit', resolve);
  });
  if (code !== 0) failed++;
}

console.log(failed
  ? `\n${failed} of ${suites.length} suite(s) FAILED`
  : `\nall ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
