// Run inside the documented Node 22 Docker container with /bot and /input read-only.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const begin = performance.now();
const input = '/input/snapshot.json';
for (const name of ['first', 'second']) {
  const out = '/output/' + name;
  process.stdout.write(execFileSync(process.execPath, ['/bot/main.ts', '--output', out], { encoding: 'utf8', timeout: 30000 }));
  process.stdout.write(execFileSync(process.execPath, ['/bot/tools/verify-output.mjs', out, input], { encoding: 'utf8', timeout: 30000 }));
}
function manifest(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap((f) => {
    const file = join(dir, f.name), name = prefix + f.name;
    return f.isDirectory() ? manifest(file, name + '/') : [[name, createHash('sha256').update(readFileSync(file)).digest('hex')]];
  });
}
const first = manifest('/output/first'), second = manifest('/output/second');
assert.deepEqual(first, second);
process.stdout.write(execFileSync(process.execPath, ['--test', '/bot/tests/engine.test.cjs'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ORBIT_INPUT: input } }));
console.log(JSON.stringify({ node: process.version, identicalFiles: first.length, deterministic: true, elapsedSeconds: (performance.now() - begin) / 1000, maxRssKiB: process.resourceUsage().maxRSS }));