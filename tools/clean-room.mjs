// Run inside the documented Node 22 container, or pass local input/output paths.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const begin = performance.now();
const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] || '/input/snapshot.json');
const output = resolve(process.argv[3] || '/output');
for (const name of ['first', 'second']) {
  const out = join(output, name);
  process.stdout.write(execFileSync(process.execPath, [join(root, 'main.ts'), '--input', input, '--output', out], { encoding: 'utf8', timeout: 30000 }));
  process.stdout.write(execFileSync(process.execPath, [join(root, 'tools/verify-output.mjs'), out, input], { encoding: 'utf8', timeout: 30000 }));
}
function manifest(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap((f) => {
    const file = join(dir, f.name), name = prefix + f.name;
    return f.isDirectory() ? manifest(file, name + '/') : [[name, createHash('sha256').update(readFileSync(file)).digest('hex')]];
  });
}
const first = manifest(join(output, 'first')), second = manifest(join(output, 'second'));
assert.deepEqual(first, second);
const tests = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort().map(name => join(root, 'tests', name));
process.stdout.write(execFileSync(process.execPath, ['--test', ...tests], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ORBIT_INPUT: input } }));
console.log(JSON.stringify({ node: process.version, identicalFiles: first.length, deterministic: true, elapsedSeconds: (performance.now() - begin) / 1000, maxRssKiB: process.resourceUsage().maxRSS }));
