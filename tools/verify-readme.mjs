// Check the required live badges without contacting any submission endpoint.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const bounty = 'https://make.fun/bounty/token-radar-01';
export const badges = [
  'https://make.fun/badge/token-radar-01.svg',
  'https://make.fun/badge/token-radar-01/ren-elara/Makefun-01-tokenradar-entry/rank.svg',
  'https://make.fun/badge/token-radar-01/ren-elara/Makefun-01-tokenradar-entry/reward.svg',
];

export function verifyReadme(text) {
  const links = [...text.matchAll(/\[!\[[^\]]*\]\(([^)]+)\)\]\(([^)]+)\)/g)];
  for (const url of badges) {
    assert.ok(links.some((link) => link[1] === url && link[2] === bounty), `Missing live badge linked to the bounty: ${url}`);
  }
  assert.ok(text.trimStart().startsWith('[!['), 'Place the three live badges at the top of README.md.');
  return { badges: badges.length, repository: 'ren-elara/Makefun-01-tokenradar-entry' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyReadme(readFileSync(new URL('../README.md', import.meta.url), 'utf8'));
  if (process.argv.includes('--live')) {
    result.live = await Promise.all(badges.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, `${url} HTTP status`);
      assert.match(response.headers.get('content-type') || '', /image\/svg\+xml/);
      assert.match(await response.text(), /<svg\b/);
      return { url, status: response.status, svg: true };
    }));
  }
  console.log(JSON.stringify(result, null, 2));
}
