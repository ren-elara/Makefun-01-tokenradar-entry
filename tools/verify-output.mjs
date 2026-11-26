// Independent contract checks; the sealed competition scorer remains server-only.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = resolve(process.argv[2] || './out');
const input = process.argv[3];
if (!input) throw new Error('Usage: node tools/verify-output.mjs <output-dir> <snapshot.json>');
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const rows = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')).rows;
assert.ok(rows.length >= 100 && rows.length <= 4000);
assert.ok(lstatSync(join(out, 'board.json')).size <= 8 * 1024 * 1024);
const valid = new Set(snapshot.protocols.map((p) => p.slug)), seen = new Set();
const ranks = rows.slice().sort((a, b) => a.rank - b.rank);
for (const [i, row] of ranks.entries()) {
  assert.ok(valid.has(row.slug) && !seen.has(row.slug));
  seen.add(row.slug);
  assert.ok(typeof row.name === 'string' && row.name.trim());
  assert.equal(row.rank, i + 1);
  assert.ok(Number.isSafeInteger(row.implied_value_usd) && row.implied_value_usd > 0 && row.implied_value_usd <= 1e14);
  if (i) assert.ok(row.implied_value_usd <= ranks[i - 1].implied_value_usd);
  assert.ok(Array.isArray(row.farm_steps) && row.farm_steps.length >= 3 && row.farm_steps.length <= 12);
  for (const step of row.farm_steps) assert.ok(typeof step === 'string' && step.trim().length >= 20 && step.trim().length <= 600);
}
assert.ok(new Set(rows.map((r) => r.implied_value_usd)).size > 1);
for (const slug of snapshot.watchlist) assert.ok(seen.has(slug));
const files = [];
function walk(dir, prefix = '') {
  for (const name of readdirSync(dir).sort()) {
    assert.match(name, /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/);
    const path = join(dir, name), stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) walk(path, prefix + name + '/');
    else { assert.ok(stat.isFile()); files.push({ path, name: prefix + name, bytes: stat.size }); }
  }
}
walk(join(out, 'dashboard'));
assert.ok(files.length <= 400 && files.reduce((a, f) => a + f.bytes, 0) <= 4194304);
assert.ok(files.some((f) => f.name === 'index.html') && files.some((f) => f.name.endsWith('.css')) && files.some((f) => f.name.endsWith('.js')));
for (const f of files) {
  const s = readFileSync(f.path, 'utf8');
  // This entry uses no remote URLs anywhere, a stricter rule than the official attribute/import check.
  assert.ok(!/https?:\/\//i.test(s), `Remote URL in ${f.name}`);
}
const dashboardBytes = files.reduce((a, f) => a + f.bytes, 0);
const images = readdirSync(join(out, 'screenshots')).filter((n) => !n.startsWith('.'));
assert.ok(images.length >= 3 && images.length <= 4);
for (const name of images) {
  const b = readFileSync(join(out, 'screenshots', name));
  assert.ok(b.length <= 524288);
  assert.ok(extname(name) === '.jpg' && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217);
  let at = 2, width = 0, height = 0;
  while (at < b.length - 4) {
    if (b[at++] !== 255) continue;
    const marker = b[at++];
    if (marker === 216 || marker === 217 || marker === 0) continue;
    const size = b.readUInt16BE(at);
    if ([192, 193, 194].includes(marker)) { height = b.readUInt16BE(at + 3); width = b.readUInt16BE(at + 5); break; }
    at += size;
  }
  assert.ok(Math.max(width, height) <= 1440 && Math.min(width, height) >= 800, name + ' dimensions');
}
const dossier = readFileSync(join(out, 'dossier.json'));
assert.ok(dossier.length <= 1572864);
assert.ok(dossier.equals(Buffer.from(buildDossier(out, { text_max_bytes: 65536 }))), 'Dossier bytes differ from the official builder');
const dossierText = JSON.parse(dossier).text;
assert.ok(!/^\[Cut at 65536 bytes:/m.test(dossierText), 'Dashboard source was truncated in the dossier');
for (const f of files) assert.ok(dossierText.includes(readFileSync(f.path, 'utf8')), `Missing dossier source: ${f.name}`);
console.log(JSON.stringify({ checks: 7, rows: rows.length, watchlist: snapshot.watchlist.length, dashboardBytes, screenshots: images.length, dossierBytes: dossier.length, dossierSha256: createHash('sha256').update(dossier).digest('hex') }, null, 2));
