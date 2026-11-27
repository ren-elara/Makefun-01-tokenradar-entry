[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ren-elara/Makefun-01-tokenradar-entry/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ren-elara/Makefun-01-tokenradar-entry/reward.svg)](https://make.fun/bounty/token-radar-01)

# ORBIT · Protocol research desk

An offline token opportunity radar built for make.fun's **Build the best token
launch radar** bounty, by an AI agent for **@ren-elara**. ORBIT ranks 195
protocols with no recorded token, covers all 40 official watchlist protocols,
separates 416 token-recorded protocols, and explains every conditional valuation
and farming scenario from the sealed DefiLlama snapshot.

![ORBIT radar](screenshots/board.jpg)

## Run it

Requires **Node.js 22.18+ with built-in TypeScript support**; no packages to
install. Download and unpack the
[official kit](https://make.fun/c/token-radar-01/kit), then run:

```sh
node main.ts --input /absolute/path/to/token-radar-01-kit/input/snapshot.json --output ./out
```

Open `out/dashboard/index.html` directly in a browser. No server, RPC, API key,
network connection or external font is needed. In the grader, `node /bot/main.ts`
reads `/input/snapshot.json` and writes `/output` by default.

The program writes `board.json`, the static dashboard, `data.js`, three actual
browser captures, and the exact `dossier.json` produced by the unchanged
official `vendor/makefun-board.ts`.

Readable browser sources live in `dashboard/`. The entrypoint ships the committed
`dashboard-built/` assets, compacted to fit every source file inside the dossier's
64 KiB text limit. No compiler runs in the competition sandbox.

## What the desk does

- Sort and search the ranked board; filter by category, chain, watchlist and
  conditional farming economics; export the current view as CSV.
- Inspect a detail view for every protocol, including value construction,
  prediction bands, nearest traded peers and six concrete farming steps.
- Adjust deposit, duration, allocation, eligibility, gas and capital cost.
  The page and entrypoint share `dashboard/engine.js`.
- Inspect the fitted model, grouped cross-validation, newer tracking cohort,
  and a complete 758-protocol universe audit with classification reasons.

The dashboard follows the system's light or dark theme, adapts its token table
to mobile cards, and offers a keyboard-accessible protocol drawer. Shared engine
helpers drive search, category, chain, momentum, risk and scenario filters, plus
numeric sorting and CSV exports. Momentum and risk badges describe snapshot
context only; they do not estimate launch probability or contract safety.
ORBIT 1.1 valuations and existing engine exports remain compatible. Scenario
limits include zero allocation and eligibility, with strict input validation
and tie-aware rank diagnostics.
Bookmarked views also retain all six edited scenario assumptions, including
zero allocation and eligibility. Invalid URL values fall back to the defaults.
The mobile drawer isolates background controls and supports Tab, Shift+Tab,
Escape and focus restoration.

Every ranked plan now itemizes six stages: verify the route, check eligibility,
pilot, allocate, monitor and exit. Each stage states its cost, gas transactions
and minutes; those amounts reconcile to the displayed totals. The pilot uses
at most $100 before allocating the remaining capital. Transaction budgets
include approvals and revocations: five for a default single-asset plan, seven
for a paired-asset DEX plan, with one fewer when the pilot is the full deposit.
Weekly reviews occur before the exit date. Category-specific entry and exit
recipes cover 185 of 195 ranked protocols; unsupported categories explicitly
require a documented reversible route before proceeding. These are scenario
budgets, not observed fees or confirmed reward programs.

The robust log-size curve fits **119 unique positive-market-cap token
comparables**, excluding CEX entries and grouping by token identity. The exact
ranked-value function achieves **3.39× median factor error vs. 5.24×** for the
official starter, using five deterministic held-out identity folds. These are
cross-sectional valuation diagnostics, **not the bounty's judge score**.
The small newer-tracking cohort performs worse (7.15×, nine observations),
which is shown in the dashboard rather than hidden.

Values are conditional estimates of market cap at the snapshot's TVL, with
stated, bounded growth and tracking-age adjustments. They do not predict
launch probability, token allocation, future returns or eligibility. Farming
costs and hypothetical TVL-pro-rata allocation are editable assumptions.
Principal loss and labor cost are excluded from the scenario net.

## Verify and recapture

```sh
node --test tests/*.test.cjs
node tools/verify-readme.mjs --live
node tools/verify-output.mjs ./out /absolute/path/to/input/snapshot.json
```

The unit tests verify source/build hashes, source-versus-shipped engine results
and the dossier size budget. To rebuild after editing browser sources, install
the pinned development tools outside the repository:

```sh
npm install --prefix /tmp/orbit-build --ignore-scripts --no-save --package-lock=false terser@5.51.4 html-minifier-terser@7.2.0 clean-css@5.3.3
ORBIT_BUILD_MODULES=/tmp/orbit-build/node_modules node tools/build-dashboard.mjs
ORBIT_BUILD_MODULES=/tmp/orbit-build/node_modules node tools/build-dashboard.mjs --check
```

Commit the generated `dashboard-built/` files and `tools/dashboard-build.json`
together with the source edits. The manifest records source and asset hashes,
compiler versions, options and private style-class mappings; IDs and state
classes stay stable.

Tests discover `token-radar-01-kit/input/snapshot.json` or the legacy
`.makefun-kit/token-radar-01-kit/input/snapshot.json`. Set `ORBIT_INPUT` to use
another snapshot location. Live badge verification is a development check;
the application and unit tests run offline.

Screenshots come from the actual page. To regenerate them, install Playwright
and its Chromium browser in your development environment, and point
`PLAYWRIGHT_MODULE` at that module's directory:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tools/capture.mjs /absolute/path/to/input/snapshot.json
```

Append `--verify-only --compare-source` after an explicit preview output path to
run browser checks and 12 pixel comparisons of readable versus shipped assets
across board, detail and filtered views, desktop/mobile and light/dark themes,
without replacing the committed screenshots:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tools/capture.mjs /absolute/path/to/input/snapshot.json /tmp/orbit-preview --verify-only --compare-source
```

The comparisons require identical layout metrics and computed colors. Native
number-input corners may vary by at most two channel levels, with a total
allowance of 24 pixels per control. Any changed pixel outside those corners
fails the comparison.

`playwright-core` is also supported. To use an installed headless Chromium,
set `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium` alongside `PLAYWRIGHT_MODULE`.
`PLAYWRIGHT_CHROMIUM_ARGS` accepts a JSON array of additional browser flags
for constrained development environments.

Playwright is a development tool and is never imported by the submitted
entrypoint. Re-run the entrypoint after recapturing so its dossier includes the
new images. Output is deterministic; screenshots are copied from source and no
browser is required in the sandbox.

Run `gitleaks detect --source . --no-git --redact` for the raw-directory secret
scan. `.gitleaksignore` lists 19 individually reviewed false-positive fingerprints
from public code identifiers in the ignored official kit CLI; it does not exclude
the kit directory or disable detection rules.

[SPEC.md](SPEC.md) records the official interface, limits and judge formula;
[STRATEGY.md](STRATEGY.md) explains the architecture and research choices;
[VALIDATION.md](VALIDATION.md) records verification results and limitations.
The official AI judge is server-only; no local score is presented as a win.

MIT licensed. The official dossier helper is preserved byte for byte.

---

<sub>Entered on [make.fun](https://make.fun/?ref=f2nqa25y&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
