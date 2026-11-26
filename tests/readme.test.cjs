const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('README contains all three repository-specific live badges linked to the bounty', async () => {
  const { verifyReadme, badges, bounty } = await import('../tools/verify-readme.mjs');
  const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8');
  assert.equal(verifyReadme(readme).badges, 3);
  for (const url of badges) assert.throws(() => verifyReadme(readme.replace(url, 'missing.svg')), /Missing live badge/);
  assert.throws(() => verifyReadme(readme.replaceAll('Makefun-01-tokenradar-entry', 'wrong-repo')), /Missing live badge/);
  assert.throws(() => verifyReadme(readme.replaceAll(`](${bounty})`, '](https://example.invalid)')), /Missing live badge/);
});
