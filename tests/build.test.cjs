'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const engine = require('../dashboard/engine.js');
const root = resolve(__dirname, '..');
const manifest = require('../tools/dashboard-build.json');
const hash = value => createHash('sha256').update(value).digest('hex');

test('committed browser assets match every readable source and fit the dossier', () => {
  const files = Object.keys(manifest.files);
  assert.equal(manifest.compiler, 'terser@5.51.4');
  assert.deepEqual(readdirSync(resolve(root, 'dashboard')).sort(), files);
  assert.deepEqual(readdirSync(resolve(root, 'dashboard-built')).sort(), files);
  let bytes = 0;
  for (const name of files) {
    const source = readFileSync(resolve(root, 'dashboard', name));
    const built = readFileSync(resolve(root, 'dashboard-built', name));
    assert.equal(hash(source), manifest.files[name].source, `Rebuild after editing dashboard/${name}`);
    assert.equal(hash(built), manifest.files[name].built, `Generated asset differs: ${name}`);
    bytes += built.length;
  }
  assert.ok(bytes < 65000, `${bytes} dashboard bytes leave no room for dossier headings`);
});

test('the shipped engine reproduces source valuations, plans and browser exports', () => {
  const input = process.env.ORBIT_INPUT || [
    'token-radar-01-kit/input/snapshot.json',
    '.makefun-kit/token-radar-01-kit/input/snapshot.json',
  ].map(path => resolve(root, path)).find(existsSync);
  assert.ok(input, 'Unpack the official kit or set ORBIT_INPUT.');
  const snapshot = JSON.parse(readFileSync(input, 'utf8'));
  const context = vm.createContext({});
  vm.runInContext(readFileSync(resolve(root, 'dashboard-built/engine.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.ORBIT).sort(), Object.keys(engine).sort());
  for (const settings of [undefined, { deposit: 1000, allocation: 0, eligibility: 0 }]) {
    assert.deepEqual(JSON.parse(JSON.stringify(context.ORBIT.derive(snapshot, settings))), JSON.parse(JSON.stringify(engine.derive(snapshot, settings))));
  }
});
