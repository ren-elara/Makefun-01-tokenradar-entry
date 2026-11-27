import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDossier } from './vendor/makefun-board.ts';

const require = createRequire(import.meta.url);
const Orbit = require('./dashboard/engine.js');
const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string, fallback: string): string {
  const eq = process.argv.find((value) => value.startsWith(`--${name}=`));
  const at = process.argv.indexOf(`--${name}`);
  if (eq) return eq.slice(name.length + 3);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1]! : fallback;
}

function readSnapshot(): Record<string, unknown> {
  const input = arg('input', '/input');
  const path = input.endsWith('.json') ? input : join(input, 'snapshot.json');
  if (!existsSync(path)) throw new Error(`No snapshot at ${path}; pass --input <snapshot.json|directory>.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot root must be a JSON object.');
  return value as Record<string, unknown>;
}

const snapshot = readSnapshot();
const data = Orbit.derive(snapshot);
const out = resolve(arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output'));
mkdirSync(out, { recursive: true });
mkdirSync(join(out, 'dashboard'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'dashboard-built'), join(out, 'dashboard'), { recursive: true });
for (const name of ['board.jpg', 'detail.jpg', 'filtered.jpg']) {
  const source = join(here, 'screenshots', name);
  if (!existsSync(source)) throw new Error(`Missing authored screenshot ${source}.`);
  cpSync(source, join(out, 'screenshots', name));
}

const board = data.rows.map((p: any) => ({
  rank: p.rank,
  slug: p.slug,
  name: p.name,
  category: p.category,
  chains: p.chains,
  tvl_usd: p.tvl_usd,
  change_7d: p.change_7d,
  listed_at: p.listed_at,
  age_days: p.age_days,
  implied_value_usd: p.implied_value_usd,
  band_low_usd: p.band_low_usd,
  band_high_usd: p.band_high_usd,
  value_per_tvl: p.value_per_tvl,
  watchlist: p.watchlist,
  model: data.version,
  farm_steps: p.farm.steps,
  farm_scenario: {
    ...data.settings,
    verdict: p.farm.verdict,
    gross_usd: p.farm.gross,
    net_usd: p.farm.net,
    p10_net_usd: p.farm.netLow,
    cost_usd: p.farm.cost,
    gas_usd: p.farm.gasCost,
    execution_usd: p.farm.slippage,
    opportunity_usd: p.farm.capitalCost,
    stages: p.farm.stages,
  },
}));
if (board.length < 100 || board.length > 4000) throw new Error(`Board has ${board.length} rows; expected 100–4000.`);
const watch = new Set(data.rows.filter((p: any) => p.watchlist).map((p: any) => p.slug));
if (snapshot.watchlist.some((slug: string) => !watch.has(slug))) throw new Error('The ranked board misses a watchlist slug.');
for (let i = 0; i < board.length; i++) {
  const row = board[i];
  if (row.rank !== i + 1 || !Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 ||
      (i > 0 && row.implied_value_usd > board[i - 1].implied_value_usd) ||
      row.farm_steps.length < 3 || row.farm_steps.length > 12 ||
      row.farm_steps.some((step: string) => step.trim().length < 20 || step.trim().length > 600)) {
    throw new Error(`Invalid output row ${row.slug} at rank ${row.rank}.`);
  }
}

writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
const clientData = {
  version: data.version,
  as_of: data.as_of,
  source: data.source,
  floor_usd: data.floor_usd,
  settings: data.settings,
  model: { ...data.model, residuals: undefined },
  watchlist_size: data.watchlist_size,
  trained_size: data.trained_size,
  traded_size: data.traded_size,
  excluded_size: data.excluded_size,
  rows: data.rows,
  traded: data.traded,
  universe: data.universe,
};
writeFileSync(join(out, 'data.js'), `window.ORBIT_DATA=${JSON.stringify(clientData)};\n`);
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));
process.stdout.write(`ORBIT ${data.version}: ${board.length} protocols ranked; ${watch.size}/${snapshot.watchlist.length} watchlist covered; ${data.traded_size} traded protocols separated.\n`);
process.stdout.write(`Model: ${data.model.formula}; grouped CV ${data.model.cv.median_multiple}× median factor error vs ${data.model.starter_cv.median_multiple}× starter; ${data.model.recent.n} recent holdout rows.\n`);
process.stdout.write(`Wrote ${join(out, 'board.json')}, dashboard, 3 screenshots and dossier.json.\n`);
