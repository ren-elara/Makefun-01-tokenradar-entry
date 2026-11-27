// Development only: Playwright captures the actual offline dashboard; it is not a runtime dependency.
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const O = require('../dashboard/engine.js');
const root = resolve(import.meta.dirname, '..');
const input = resolve(process.argv[2] || root + '/token-radar-01-kit/input/snapshot.json');
const output = resolve(process.argv[3] || root + '/out-preview');
const playwrightPath = process.env.PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright module directory.');
const { chromium } = require(playwrightPath);
mkdirSync(output, { recursive: true });
cpSync(resolve(process.env.ORBIT_DASHBOARD_DIR || root + '/dashboard-built'), output + '/dashboard', { recursive: true });
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const data = O.derive(snapshot);
writeFileSync(output + '/data.js', 'window.ORBIT_DATA=' + JSON.stringify({ ...data, model: { ...data.model, residuals: undefined } }) + ';\n');
mkdirSync(root + '/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', ...JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]')] });
try {
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
context.setDefaultTimeout(15000);
const page = await context.newPage();
const errors = [], network = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/^https?:/, (route) => { network.push(route.request().url()); return route.abort(); });
const base = pathToFileURL(output + '/dashboard/index.html').href;
let visualComparisons = 0;
let rasterRoundingPixels = 0;
if (process.argv.includes('--compare-source')) {
  cpSync(root + '/dashboard', output + '/readable', { recursive: true });
  const readable = pathToFileURL(output + '/readable/index.html').href;
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const query of ['', '?protocol=curvance', '?quick=worth&category=Yield']) {
        const images = [];
        const layouts = [];
        for (const url of [base, readable]) {
          await page.goto(url + query); await page.waitForFunction(() => window.ORBIT_READY === true);
          images.push(await page.screenshot({ animations: 'disabled', caret: 'hide' }));
          layouts.push(await page.locator('[id],#detail-panel *').evaluateAll(elements => elements.map(element => {
            const box = element.getBoundingClientRect(), style = getComputedStyle(element);
            return { tag: element.tagName, id: element.id, x: box.x, y: box.y, width: box.width, height: box.height, font: style.font, display: style.display, color: style.color, background: style.backgroundColor, border: style.border };
          })));
        }
        assert.deepEqual(layouts[0], layouts[1], `Compiled layout differs: ${colorScheme}, ${width}px, ${query || 'board'}`);
        if (!images[0].equals(images[1])) {
          const difference = await page.evaluate(async encoded => {
            const controls = [...document.querySelectorAll('input[type="number"]')].map(element => element.getBoundingClientRect());
            const pixels = await Promise.all(encoded.map(async value => {
              const image = new Image(); image.src = 'data:image/png;base64,' + value; await image.decode();
              const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
              const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
              return context.getImageData(0, 0, image.width, image.height);
            }));
            let count = 0, maxDelta = 0, outsideControlCorners = 0;
            for (let i = 0; i < pixels[0].data.length; i += 4) {
              if ([0, 1, 2, 3].some(channel => pixels[0].data[i + channel] !== pixels[1].data[i + channel])) {
                count++; maxDelta = Math.max(maxDelta, ...[0, 1, 2, 3].map(channel => Math.abs(pixels[0].data[i + channel] - pixels[1].data[i + channel])));
                const x = (i / 4) % pixels[0].width + 0.5, y = Math.floor(i / 4 / pixels[0].width) + 0.5;
                const corner = controls.some(box => x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1 &&
                  Math.min(Math.abs(x - box.left), Math.abs(x - box.right)) <= 8 && Math.min(Math.abs(y - box.top), Math.abs(y - box.bottom)) <= 8);
                if (!corner) outsideControlCorners++;
              }
            }
            return { count, maxDelta, outsideControlCorners, controls: controls.length, total: pixels[0].width * pixels[0].height };
          }, images.map(image => image.toString('base64')));
          // Repainting the same native input can change corner antialiasing by two levels.
          const equivalent = difference.maxDelta <= 2 && difference.outsideControlCorners === 0 && difference.count <= 24 * difference.controls;
          if (!equivalent) {
            writeFileSync(output + '/mismatch-built.png', images[0]); writeFileSync(output + '/mismatch-readable.png', images[1]);
          }
          assert.ok(equivalent, `Compiled page differs visually: ${colorScheme}, ${width}px, ${query || 'board'}: ${JSON.stringify(difference)}`);
          rasterRoundingPixels += difference.count;
        }
        visualComparisons++;
      }
      console.log('visual', colorScheme, width, { visualComparisons, rasterRoundingPixels });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
for (const [name, query] of process.argv.includes('--verify-only') ? [] : [['board', ''], ['detail', '?protocol=curvance'], ['filtered', '?quick=worth&category=Yield']]) {
  await page.setViewportSize({ width: 1440, height: name === 'detail' ? 1440 : 1000 });
  await page.goto(base + query);
  await page.waitForFunction(() => window.ORBIT_READY === true);
  if (name === 'detail') {
    await page.locator('#detail-panel').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#detail-panel ol li').last().evaluate(element => {
      const box = element.getBoundingClientRect(), panel = element.closest('aside').getBoundingClientRect();
      return box.top >= panel.top && box.bottom <= Math.min(innerHeight, panel.bottom);
    }), 'The detail screenshot must show the complete six-stage plan');
  }
  await page.screenshot({ path: root + '/screenshots/' + name + '.jpg', type: 'jpeg', quality: 88 });
  console.log(name, await page.locator('#result-count').textContent(), await page.locator('#detail-panel h2').textContent());
}
// Verify filters, sorting, details, live scenarios, and export on the actual page.
await page.goto(base);
await page.waitForFunction(() => window.ORBIT_READY === true);
if (await page.locator('#protocol-rows tr').count() !== data.rows.length) throw new Error('Rendered board row count mismatch');
const firstPlan = data.rows[0].farm;
const assertRenderedPlan = async plan => {
  const stages = await page.locator('#detail-panel ol li').allTextContents();
  assert.equal(stages.length, plan.stages.length);
  for (const [index, stage] of plan.stages.entries()) {
    assert.ok(stages[index].includes(stage.title), stage.title);
    assert.ok(stages[index].includes(stage.action), stage.title + ' action');
    assert.ok(stages[index].includes(stage.budget), stage.title + ' engine budget');
  }
};
await assertRenderedPlan(firstPlan);
assert.ok((await page.locator('#detail-panel').textContent()).includes(firstPlan.transactions + ' gas tx + execution + capital'));
await page.locator('#search').fill('steakhouse');
if (await page.locator('#protocol-rows tr').count() !== 1) throw new Error('Search failed');
await page.locator('#reset-filters').click();
await page.locator('[data-quick="watch"]').click();
if (await page.locator('#protocol-rows tr').count() !== snapshot.watchlist.length) throw new Error('Watchlist filter failed');
await page.locator('#reset-filters').click();
await page.locator('[data-sort="implied_value_usd"]').click();
await page.locator('#protocol-rows tr').first().click();
const selected = await page.locator('#detail-panel h2').textContent();
await page.locator('[data-setting="deposit"]').fill('1000');
await page.locator('[data-setting="deposit"]').dispatchEvent('change');
if (!(await page.locator('#scenario-notice').textContent()).includes('$1,000')) throw new Error('Scenario update failed');
const selectedRow = data.rows.find(row => row.name === selected);
const editedPlan = O.plan(selectedRow, selectedRow.implied_value_usd, [selectedRow.band_low_usd, selectedRow.band_high_usd], selectedRow.age_days, { ...data.settings, deposit: 1000 });
await assertRenderedPlan(editedPlan);
assert.equal(new URL(page.url()).searchParams.get('deposit'), '1000');
await page.reload(); await page.waitForFunction(() => window.ORBIT_READY === true);
assert.equal(await page.locator('#detail-panel h2').textContent(), selected);
assert.equal(await page.locator('[data-setting="deposit"]').inputValue(), '1000');
assert.ok((await page.locator('#scenario-notice').textContent()).includes('$1,000'));
const download = page.waitForEvent('download'); await page.locator('#csv-export').click(); await download;
// Regressions for status transitions, numeric sorts, CSV data and detail focus.
const slugs = () => page.locator('#protocol-rows tr').evaluateAll(rows => rows.map(row => row.dataset.slug));
const csv = async () => {
  const pending = page.waitForEvent('download');
  await page.locator('#csv-export').click();
  const file = await pending;
  return readFileSync(await file.path(), 'utf8');
};
await page.locator('[data-status="Traded"]').click();
assert.equal(await page.locator('#value-label').textContent(), 'Recorded cap');
await page.locator('[data-sort="implied_value_usd"]').click();
const traded = data.universe.filter(p => p.status === 'Traded').sort((a, b) => (b.mcap_usd || 0) - (a.mcap_usd || 0) || a.slug.localeCompare(b.slug, 'en'));
assert.deepEqual(await slugs(), traded.map(p => p.slug));
const tradedCsv = await csv();
assert.ok(tradedCsv.includes('mcap_usd'));
assert.ok(tradedCsv.includes(String(traded[0].mcap_usd)));
assert.equal(tradedCsv.split('\r\n').length, traded.length + 1);
await page.locator('[data-quick="watch"]').click();
assert.deepEqual(await slugs(), data.rows.filter(p => p.watchlist).map(p => p.slug));
await page.locator('[data-sort="net"]').click();
const watch = data.rows.filter(p => p.watchlist).map(p => ({...p, net: O.plan(p, p.implied_value_usd, [p.band_low_usd, p.band_high_usd], p.age_days, {...data.settings, deposit: 1000}).net}));
assert.deepEqual(await slugs(), watch.sort((a, b) => b.net - a.net || a.slug.localeCompare(b.slug, 'en')).map(p => p.slug));
await page.locator('[data-setting="allocation"]').fill('0');
await page.locator('[data-setting="allocation"]').dispatchEvent('change');
assert.ok((await page.locator('#detail-panel').textContent()).includes('Unavailable'));
assert.equal(new URL(page.url()).searchParams.get('allocation'), '0');
await page.locator('[data-setting="gas"]').fill('');
await page.locator('[data-setting="gas"]').dispatchEvent('change');
assert.equal(await page.locator('[data-setting="gas"]').evaluate(input => input.validity.valueMissing), true);
assert.ok((await page.locator('#scenario-notice').textContent()).includes('$1/tx'));
await page.goto(base);
await page.waitForFunction(() => window.ORBIT_READY === true);
await page.locator('#expand-detail').click();
assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-detail')), true);
await page.locator('[data-view="model"]').first().click();
if (!(await page.locator('#model-view').isVisible())) throw new Error('Model view failed');
assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-detail')), false);
await page.locator('[data-view="board"]').click();
assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-detail')), true);
await page.locator('[data-status="Traded"]').click();
await page.locator('#protocol-rows tr').first().click();
assert.equal(await page.locator('body').evaluate(body => body.classList.contains('focus-detail')), false);
await page.locator('[data-view="universe"]').click();
if (await page.locator('#universe-rows tr').count() !== snapshot.protocols.length) throw new Error('Universe audit incomplete');
await page.goto(base);
await page.waitForFunction(() => window.ORBIT_READY === true);
const altered = await page.evaluate(() => {
  const p = window.ORBIT_DATA.rows[0]; p.name = '=CMD()'; p.category = null;
  document.querySelector('#category-filter').add(new Option('Uncategorized', 'Uncategorized'));
  return p.slug;
});
await page.locator('#category-filter').selectOption('Uncategorized');
assert.ok((await slugs()).includes(altered));
await page.locator('#search').fill(altered);
assert.ok((await csv()).includes('"\'=CMD()"'));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base); await page.waitForFunction(() => window.ORBIT_READY === true);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
if (overflow) throw new Error('Mobile viewport overflows');
const firstRow = page.locator('#protocol-rows tr').first();
await firstRow.focus(); await page.keyboard.press('Enter');
assert.equal(await page.locator('#detail-panel').getAttribute('role'), 'dialog');
assert.equal(await page.locator('#detail-panel').getAttribute('aria-modal'), 'true');
assert.equal(await page.locator('.skip-link').evaluate(element => element.inert), true);
assert.equal(await page.locator('footer').evaluate(element => element.inert), true);
await page.locator('#expand-detail').focus(); await page.keyboard.press('Shift+Tab');
assert.equal(await page.evaluate(() => document.activeElement.dataset.setting), 'opportunity');
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(() => document.activeElement.id), 'expand-detail');
await page.keyboard.press('Escape');
assert.equal(await firstRow.evaluate(element => element === document.activeElement), true);
assert.equal(await page.locator('#detail-panel').getAttribute('aria-modal'), null);
assert.equal(await page.locator('footer').evaluate(element => element.inert), false);
await page.goto(base + '?protocol=firelight&deposit=-1&days=invalid&gas=&allocation=0&eligibility=0&opportunity=101');
await page.waitForFunction(() => window.ORBIT_READY === true);
for (const [key, value] of Object.entries({ ...data.settings, allocation: 0, eligibility: 0 })) {
  assert.equal(Number(await page.locator('[data-setting="' + key + '"]').inputValue()), value, key);
}
assert.equal(await page.evaluate(() => document.activeElement.id), 'detail-panel');
await page.emulateMedia({ colorScheme: 'dark' });
await page.keyboard.press('Escape');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
const interactionAudit = { statusTabs: 0, filterCases: 0, detailDrawers: 0, views: 0 };
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
  await page.goto(base); await page.waitForFunction(() => window.ORBIT_READY === true);
  await page.locator('#close-detail').evaluate(button => button.click());
  assert.equal(await page.locator('#match-indicator').textContent(), 'board.json ↔ page · 195 shared engine ranks & values');
  for (const status of ['Ranked', 'Traded', 'Set aside']) {
    await page.locator(`[data-status="${status}"]`).click();
    const source = status === 'Ranked' ? data.rows : data.universe.filter(row => row.status === status);
    const expected = filters => O.sortRows(O.filterRows(source, { ...filters, asOf: data.as_of }), {
      key: status === 'Traded' ? 'mcap_usd' : 'rank', direction: status === 'Traded' ? -1 : 1, status,
    }).map(row => row.slug);
    assert.ok(source.length > 0);
    assert.deepEqual(await slugs(), expected({}));
    interactionAudit.statusTabs++;
    for (const key of ['momentum', 'risk', 'category', 'chain']) {
      const options = await page.locator(`#${key}-filter option`).evaluateAll(options => options.map(option => option.value).filter(Boolean));
      for (const value of options) {
        await page.locator(`#${key}-filter`).selectOption(value);
        const matches = expected({ [key]: value });
        assert.deepEqual(await slugs(), matches, `${width}px ${status} ${key}=${value}`);
        assert.equal(await page.locator('#empty-state').isVisible(), matches.length === 0);
        interactionAudit.filterCases++;
      }
      await page.locator(`#${key}-filter`).selectOption('');
      console.log('filter audit', width, status, key, options.length);
    }
  }
  await page.locator('[data-status="Ranked"]').click();
  for (const quick of ['watch', 'worth', 'pilot']) {
    await page.locator(`[data-quick="${quick}"]`).click();
    const matches = O.filterRows(data.rows, { quick }).map(row => row.slug);
    assert.deepEqual(await slugs(), matches);
    assert.equal(await page.locator('#empty-state').isVisible(), matches.length === 0);
    await page.locator('#reset-filters').click();
    interactionAudit.filterCases++;
  }
  await page.goto(base + '?quick=pilot&gas=0&opportunity=0');
  await page.waitForFunction(() => window.ORBIT_READY === true);
  const pilotRows = data.rows.map(row => ({ ...row, farm: O.plan(row, row.implied_value_usd,
    [row.band_low_usd, row.band_high_usd], row.age_days, { ...data.settings, gas: 0, opportunity: 0 }) }));
  const pilotSlugs = O.filterRows(pilotRows, { quick: 'pilot' }).map(row => row.slug);
  assert.ok(pilotSlugs.length > 0);
  assert.deepEqual(await slugs(), pilotSlugs);
  interactionAudit.filterCases++;
  await page.goto(base); await page.waitForFunction(() => window.ORBIT_READY === true);
  for (const view of ['model', 'universe', 'board']) {
    await page.locator(`[data-view="${view}"]`).first().click();
    assert.ok(await page.locator(`#${view}-view`).isVisible());
    assert.ok((await page.locator(`#${view}-view`).textContent()).trim());
    interactionAudit.views++;
  }
  // Exercise the same row event used by both tables, then inspect every drawer.
  for (let start = 0; start < data.universe.length; start += 20) {
    const result = await page.evaluate(({ start, end }) => {
      const data = window.ORBIT_DATA, engine = window.ORBIT;
      const ranked = new Map(data.rows.map(row => [row.slug, row]));
      const triggers = [...document.querySelectorAll('#universe-rows tr')];
      const failures = [];
      for (let index = start; index < end; index++) {
        const row = data.universe[index];
        triggers[index].click();
        const panel = document.querySelector('#detail-panel');
        if (panel.querySelector('h2')?.textContent !== row.name) failures.push(row.slug);
        const candidate = ranked.get(row.slug);
        if (candidate) {
          const farm = engine.plan(candidate, candidate.implied_value_usd, [candidate.band_low_usd, candidate.band_high_usd], candidate.age_days, data.settings);
          const stages = [...panel.querySelectorAll('ol li')];
          if (stages.length !== 6 || stages.some((element, stage) => !element.textContent.includes(farm.stages[stage].budget))) failures.push(row.slug + ':plan');
        } else if (!panel.textContent.includes(row.reason)) failures.push(row.slug + ':reason');
      }
      if (!document.querySelector('#detail-panel').checkVisibility()) failures.push('drawer hidden');
      return failures;
    }, { start, end: Math.min(start + 20, data.universe.length) });
    assert.deepEqual(result, [], `${width}px detail batch ${start}`);
    interactionAudit.detailDrawers += Math.min(20, data.universe.length - start);
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  console.log('interaction audit', width, interactionAudit);
}
if (errors.length || network.length) throw new Error(JSON.stringify({ errors, network }));
console.log(JSON.stringify({ offline: true, rows: data.rows.length, watchlist: snapshot.watchlist.length, universe: snapshot.protocols.length, scenario: true, scenarioLinks: true, sorting: true, selected, csv: true, transitions: true, zeroAllocation: true, formulaEscaping: true, uncategorized: true, focus: true, mobile: true, modalKeyboard: true, darkMode: true, visualComparisons, rasterRoundingPixels, interactionAudit, errors, network }));
} finally {
  await browser.close();
}
