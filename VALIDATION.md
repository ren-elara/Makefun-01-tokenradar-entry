# ORBIT validation record

## Itemized farming plans — 2026-11-27

The upgrade targets concrete farming plans, the third criterion in the sealed
judge rubric. An audit of the existing board found 142 category-specific plans
and no fully reconciled stage budgets. The new plans cover **185 of 195** ranked
protocols with category-specific entry and exit recipes. All **195 plans** now
reconcile six stages' costs, gas transactions and minutes to their scenario
totals. The remaining ten require a documented reversible route before use.

Pilots use at most $100, with the remaining deposit allocated only after receipt
and withdrawal checks. Transaction budgets include approvals and revocations:
five for the default single-asset scenario, seven for a paired-asset DEX plan,
and one fewer when the pilot is the full deposit. Weekly reviews exclude the
exit date. These are editable scenario allowances, not observed on-chain fees.

- **34 unit tests passed, 0 failed**, including reconciliation across the ranked
  board, pilot boundaries, paired-asset approvals, fractional review horizons,
  category fallbacks and source-versus-built engine parity.
- Offline Chromium passed scenario edits and reloads, filters, numeric sorting,
  CSV exports and escaping, view transitions, mobile dialog semantics, keyboard
  navigation and dark mode. **Zero page errors and zero HTTP(S) requests**.
- All **12 source-versus-built visual comparisons** passed across board, detail
  and filtered views, desktop/mobile and light/dark themes. Layout metrics and
  computed colors match exactly. Repeated captures of the same native number
  inputs showed corner raster variation; comparisons allow at most two channel
  levels and 24 pixels per input, only within its corners.
- All three screenshots were recaptured from the actual built dashboard. Board
  and filtered views are **1440×1000**; the Curvance detail is **1440×1440**, with
  all six stages visible and checked before capture. The largest is **259,135
  bytes**, within the official limits.
- Two independent entrypoint runs passed all **seven output contract checks**:
  **195 ranked protocols, 40/40 watchlist coverage, 416 traded protocols**, and
  **758 protocols** in the complete universe. All **11 output files matched byte
  for byte**. Dashboard assets total **64,954 bytes**, with all source included
  in the official dossier. The pinned build's `--check` passed.
- The final dossier is **874,274 bytes**, SHA-256
  `0cf8bd351c8a872cdaa448216625d1cbe71936fb3fd6071d2fd819ae7427ae79`.
- All three exact live README badges returned **HTTP 200** with SVG content.
- Official offline preflight against the existing native OpenCode transcript
  archive returned **`ok: true`, no failed checks**. Authored coverage exceeds
  **50%**, above the required **30%**, with authored entrypoint lines.
- Gitleaks found **zero leaks** in Git history, the raw directory and the
  extracted existing transcript archive. The 19 exact false-positive
  fingerprints were refreshed after reviewing their new locations in the
  official kit CLI; they are public code expressions and environment-variable
  names. The kit remains scanned, and no detection rule is disabled.

Category, growth and tracking-age model experiments did not reliably improve
both grouped and newer-cohort diagnostics. The retained valuation model reports
**3.39×** grouped median factor error and **7.15×** on nine newer-tracking tokens.
These are local valuation diagnostics; the official AI judge runs server-side.
Local Node **22.23.5** execution used the external tsx loader and headless
Chromium flags described in the earlier records below.

## Scenario links and complete dossiers — 2026-11-27

Scenario URLs now retain all six edited farming assumptions, including zero
allocation and eligibility. Missing, blank, non-finite and out-of-range URL
values use the existing defaults. The mobile drawer isolates the skip link and
footer along with the other background controls, while preserving keyboard
wrapping, Escape dismissal and focus restoration.

Readable browser sources remain in `dashboard/`; `main.ts` ships the deterministic
`dashboard-built/` assets. The pinned development build and hash manifest keep
the complete dashboard inside the official dossier's 65,536-byte text limit.
The competition runtime needs no compiler or installed packages.

- **30 unit tests passed, 0 failed**, including source/build hashes, the complete
  browser export surface and source-versus-shipped engine parity for default and
  zero-allocation/eligibility scenarios.
- Two independent entrypoint runs passed all **seven output contract checks**:
  **195 ranked protocols, 40/40 watchlist coverage, 416 traded protocols** and
  **758 protocols** in the complete universe. All **11 output files matched byte
  for byte**. The dashboard is **64,588 bytes**, with every source file included
  in full in the official dossier. `build-dashboard.mjs --check` passed.
- The dossier is **778,088 bytes**, SHA-256
  `ace4aa96092a768c9841e2057666239a3ef236759b7d927b8c03ba8407e5192b`.
- Actual offline Chromium checks passed for scenario reloads, invalid URL
  fallbacks, zero values, filtering, numeric sorting, CSV contents and escaping,
  view transitions, mobile dialog semantics, keyboard navigation and dark mode.
  **Zero page errors and zero HTTP(S) requests** were recorded.
- All **12 source-versus-built visual comparisons** passed across board, detail
  and filtered views, desktop/mobile and light/dark themes. Layout metrics and
  computed colors match exactly. Native-control raster rounding is limited to
  two channel levels on at most 0.01% of pixels per comparison. The three
  committed screenshots were preserved.
- The live README check verified all three exact repository-specific badge
  URLs: **HTTP 200** with SVG content.
- Official offline worktree preflight returned **`ok: true`, no failed checks**
  against the existing native OpenCode transcript archive. `thinking_reproduces`
  passed at **47.6% (1,588/3,335 counted lines)**, above the **30%** requirement.
  `thinking_revised` passed with five contributing messages for
  `dashboard/app.js` and two for `main.ts`; recording, timestamp, pricing and
  run-record checks also passed for all nine parsed sessions.
- Gitleaks reported **zero findings** in Git history, the raw directory and the
  extracted existing transcript archive. `.gitleaksignore` identifies 19 exact
  false-positive fingerprints in the unmodified, ignored official kit CLI;
  detection rules and scanning of the kit directory remain enabled.

Local execution used Alpine ARM64 Node **22.23.5**, the external **tsx** loader
and software/headless Chromium flags described below. Official grading remains
server-side. Earlier release and intake records below retain their original
dates and findings.

## ORBIT 1.1 upgrade — 2026-11-26

The upgrade adds sortable scenario net, correct traded-cap sorting and CSV
exports, spreadsheet formula escaping, Uncategorized filtering, correct focus
layout across views, shared scenario limits and defaults, explicit zero-allocation
handling, strict optional-field/date/watchlist validation, and average ranks for
Spearman ties. The sealed input's negative market-cap sentinels remain accepted;
only positive caps qualify as model anchors. The ranking and valuation formula
remain the same as the original release.

- `node --test tests/*.test.cjs`: **8 passed, 0 failed**, including the badge
  contract, malformed context, zero allocation, scenario limits and rank ties.
- `node tools/verify-readme.mjs --live`: all three exact live badge URLs for
  `token-radar-01` and `ren-elara/Makefun-01-tokenradar-entry` returned **HTTP 200**
  and SVG content. Each badge links to the canonical bounty URL at the top of
  the root README. The normal unit tests make no network requests.
- Actual headless Chromium browser checks pass: numeric cap/net sorting,
  traded-to-watchlist rank restoration, market-cap CSV contents, escaped formula
  text, zero allocation, rejected blank inputs, Uncategorized selection, expanded
  detail/view transitions, search, scenario updates and mobile fit. **Zero page
  errors and zero HTTP(S) requests**. All three screenshots were recaptured from
  the page at **1440×1000**, each under **197 KB**.
- Two independent entrypoint runs passed all **seven output contract checks**:
  **195 ranked protocols, 40/40 watchlist coverage, 416 token-recorded protocols**.
  All **11 output files match byte for byte**. Dashboard source is **63,947 bytes**;
  the verifier checks that every source file appears in full in the official
  dossier, without a truncation marker.
- The unchanged official helper retains SHA-256
  `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`.
- Gitleaks with `--redact` reported **zero findings** in Git history, the staged
  changes and the exact exported release tree. A separate raw-directory scan found 17
  matches, all inside the ignored downloaded `token-radar-01-kit/cli/makefun.mjs`;
  that third-party CLI is not included in the release or commit.

Local verification used Alpine ARM64 Node **22.23.5**, whose build reports
`process.features.typescript === false` and rejects native type stripping.
Entrypoint and dossier verification therefore used a temporary **tsx** loader
outside the repository. Unit tests run directly with Node. These are local
checks, not a new Docker isolation result or an official judge score.
The system Chromium needed software/headless flags in this PRoot environment;
the capture tool now accepts an executable path and JSON array of extra flags.
No transcript bundle was created and `makefun.mjs bundle` was not run.

## Original release — 2026-11-17

Measured 2026-11-17 against the sealed 2026-11-14 snapshot. These results are
local engineering and conditional-valuation diagnostics. The official
competition scorer and pairwise AI judge run only on make.fun's server.

## Model comparisons

Run `node tools/research.cjs /absolute/path/to/input/snapshot.json`.
All comparisons use the same 119 positive-cap, non-CEX token identity groups
and five deterministic identity folds. One largest-TVL row represents a token
identity; no identity appears in both train and test. Growth and tracking-age
adjustments are included in the exact ORBIT ranking function's diagnostics.

| Model | Median factor error ↓ | Mean absolute log error ↓ | Within 3× ↑ | Spearman ↑ |
|---|---:|---:|---:|---:|
| Official starter | 5.24× | 1.769 | 35% | 0.41 |
| Fitted median cap/TVL | 5.17× | 1.777 | 34% | 0.39 |
| Ordinary log-size regression | 3.50× | 1.583 | 45% | 0.33 |
| Robust log-size curve | 3.50× | 1.575 | 45% | 0.35 |
| **ORBIT exact ranked value** | **3.39×** | **1.577** | **45%** | **0.34** |

Median factor error is `exp(median(abs(log(predicted/observed))))`. ORBIT lowers
this diagnostic by about 35% versus the starter; its rank correlation is lower
than the starter's. This is a model comparison rather than a statistically
independent assessment after model selection; the diagnostic folds informed
the architecture. No claim of future launch prediction follows.

The final full-data value function is:

```text
base = exp(16.537126447618107 + 0.4927638956296776 * ln(TVL / 100000000))
growth = 1 + 0.15 * clamp(change_7d or 0, -50, 100) / 100
seasoning = 0.85 + 0.15 * min(tracking_days or 365, 730) / 730
value = clamp(round(base * growth * seasoning), 1, 100000000000000)
```

The robust regression uses Huber reweighting and a small ridge penalty; the
growth and seasoning terms are explicitly stated heuristics, not fitted
launch probabilities. Cross-fitted residual P10/P90 multipliers are about
0.070× and 9.35×: the uncertainty is large and remains visible.

An additional tracking-date holdout excludes all nine tokens tracked since
2026-01-01 from fitting. Median factor error is **7.15×**, 33% within 3×,
Spearman **−0.18**. This small cohort is a warning about generalization. It is
not an out-of-time backtest because all values come from one snapshot and
tracking date is not launch date. No historical launch labels are supplied.

The blueprint considered richer category effects; the final model retains the
auditable robust size curve rather than claiming an unimplemented ensemble.
Category controls classify the universe, select displayed peers and tailor
farm plans; they do not secretly multiply valuations.

## Output and browser checks

- 758 universe rows partition into **195 ranked**, **416 token recorded**,
  **147 set aside**. Ranked protocols cover **40/40 watchlist**; 137 ranked
  protocols have TVL below the official $50M floor.
- Four native Node tests pass: complete partition and gate invariants;
  growth/age/scenario response; malformed/duplicate/watchlist input failures;
  missing context/zero TVL/determinism.
- `tools/verify-output.mjs` independently checks all seven documented output
  contracts. It is not the sealed official scorer. Slugs, sorted unique
  integer ranks, value bounds and every farm step pass.
- Chromium renders the actual generated files with HTTP(S) requests blocked:
  all 195 board rows, 40 watchlist rows and 758 audit rows are available.
  Search, sort, filters, protocol selection, scenario edits, model view, CSV
  download and a 390×844 mobile viewport pass. Zero JS errors and zero network
  requests were observed.
- Three actual screenshots: board, Firelight detail with the six-step plan,
  and Yield plus positive-conditional-net filter (15 results). Each JPEG is
  **1440×1000**, under 202KB, below the 512KiB cap.
- Dashboard source **61,854 bytes** before dossier headings; generated dossier
  **800,759 bytes**, independently byte-equal to the official builder.
- Dossier SHA-256:
  `d34c9df3f1e989206d10115545fff45c9f3942e8a33c2217e2aa6f94444bb32a`.
- Official helper SHA-256 remains
  `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`.

## Node 22 clean-room check

Docker image `node:22-slim`, Node **22.23.5**, image digest
`sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee`.
No dependency installation, no network, read-only `/bot` and `/input`, writable
tmpfs `/output`, one CPU, 1024MiB and 64 processes:

```sh
docker run --rm --network none --cpus 1 --memory 1024m --pids-limit 64 \
  --read-only --mount type=bind,src=/absolute/path/to/export,dst=/bot,readonly \
  --mount type=bind,src=/absolute/path/to/kit/input,dst=/input,readonly \
  --tmpfs /output:rw,size=32m --workdir /bot \
  node:22-slim node /bot/tools/clean-room.mjs
```

The driver runs the program twice, verifies both outputs, compares every file
hash and runs the tests. **11 files match byte for byte**. The final check used
a clean `git archive` of release commit
`7c76c51cf5ba428aba608694b09a8431c66376ee` and finished in **2.30 seconds**;
driver maximum RSS was **55,680 KiB** (driver-only, not a claim of the children's
peak). All four tests passed and the entire container stayed within the
enforced 1024MiB budget.

## Submission preflight and blockers

Authenticated make.fun profile: **@ren-elara**. The repository is public,
created after competition opening, on main, MIT with SPDX line. README has all
three required live badges; `.makefun/owner.json` names the connected agent
wallet. Credentials and transcripts remain outside git.

Official `makefun check` on the release commit passes license, entrypoint, size, recorded
sessions, timestamps in competition window, pricing, assistant turns, code
reproduction, revision and run-record checks. The measured authorship share
was **81.1%** (1,251/1,542 counted lines), above the 30% floor; main.ts has 82
authored lines and takes final content from four writes. Overall preflight:
**12 passed, 1 failed, 6 skipped, 5 checked at submission**. A freshly
downloaded official CLI, verified against the published CLI SHA-256
`990fe1f6c429b1e2ed14c98372b067914ab058709994e8fe51d36c0ab5edbb0f`,
independently produced the same result.

**Not submission-ready:** `thinking_wellformed` rejects the original Cline
4.1.26 native log. A saved user resume message dated 09:11:34.829Z precedes
an assistant response dated 09:05:57.280Z, a 337-second reversal (60s allowed).
The logs are unchanged; omitting sessions, reordering them or inventing dates
would violate the transcript rules. No supported alternate native export was
found. Feedback receipt: `01a1e937-e923-73c9-a913-4f430d01fe37`.

**GitHub About is blocked by token permissions:** metadata PATCH and topics
PUT return HTTP 403, “Resource not accessible by integration.” The read API
shows a null homepage and no topics. A repository administrator must set
website `https://make.fun/bounty/token-radar-01` and topic `makefun` at
https://github.com/ren-elara/Makefun-01-tokenradar-entry before intake can pass.
Additional suggested topics: `ai-agents`, `bounties`, `trading`.

## Pushed release and official intake result

Release commit `7c76c51cf5ba428aba608694b09a8431c66376ee` was pushed to
`ren-elara/Makefun-01-tokenradar-entry`, branch `main`, and confirmed by GitHub's
commit API and `git ls-remote`. No credentials or session files were committed.

The signed submission under **@ren-elara** reached official intake on
2026-11-17T11:20:08Z. The server passed the account wallet, competition opening,
quota, form, signature, repository ownership, public visibility, MIT license,
creation date, pushed commit, and README checks. It then refused intake with
**HTTP 422 `repo_about`**, no submission ID. The response explicitly says this
branding refusal **does not consume an attempt**. The authenticated quota
remained **0 entries made, 3 attempts available today** after the refusal.

The original response and private transcript bundle are kept outside git in
`/tmp/makefun-submission/`. Repeating this exact request while About is unchanged
will fail at the same check. After an administrator updates About, preflight
still needs the upstream Cline timestamp issue resolved before a valid entry
can be expected; neither passing output checks nor pushing code clears it.

No accepted entry or official judge rate is claimed here. The provisional
leaderboard target observed during research was **0.962052**; an actual result
requires successful intake and grading. The December 14 final decides prizes.
