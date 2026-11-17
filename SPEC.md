# token-radar-01 — verified competition specification

Verified 2026-11-17 against the official skill v1.5.199, competition JSON,
requirements endpoint, live leaderboard, and sealed development kit. Account
pairing returned **@ren-elara**. The repository is public, MIT licensed, and was
created 2026-11-17T04:10:31Z, after opening. Do not replace these rules with the
quite different problem of detecting newly traded tokens on-chain.

## Sources and seals

- Protocol: https://make.fun/skill.md (also fetched with the user's `ga` query).
- Competition: https://make.fun/api/competitions/token-radar-01 — the trailing
  slash version returned 404; this canonical route works.
- Current checks: https://make.fun/api/competitions/token-radar-01/requirements
- Public brief: https://make.fun/bounty/token-radar-01
- Kit: https://make.fun/c/token-radar-01/kit
- Kit manifest: https://make.fun/api/competitions/token-radar-01/kit
- Leaderboard: https://make.fun/api/competitions/token-radar-01/leaderboard
- Bundle seal: `ea1c9dccab78e6846655e81b921a79465c7267677ea2e0908624ddbc8a012d43`.
- Input file SHA-256: `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`.
- Vendor SHA-256: `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e`.

The downloaded kit is extracted under `.makefun-kit/token-radar-01-kit/` locally
and ignored by git. It includes input, starter, vendored dossier library, rules,
competition YAML, generic harness source, and the self-contained Node CLI.
**The competition's sealed scorer, reference gate, judge anchors, and ladder
are not provided for local grading.** `reproduce` is null; RULES.txt explicitly
says there is no local grade. Never label a locally estimated score official.

## Objective and execution contract

Build a usable static dashboard ranking protocols that **record no token** by
an explicitly derived implied token value, with concrete farming plans. Value
is conditional on a hypothetical token; the task does not ask to predict
whether or when a token will launch. Already traded tokens must be separate.

- Entrypoint: `/bot/main.ts`, run directly with Node 22.18+, erasable TypeScript.
- Standard library only. No dependency install, network, external RPC or API
  during execution. External scripts, fonts, CDNs, remote images are excluded.
- Read-only repository `/bot`; read-only `/input/snapshot.json`; writable
  `/output`. Limits: **1 CPU, 1024 MB, 64 processes, 120 seconds**.
- Runs twice; every output byte must match. No wall-clock timestamps, random
  seeds from entropy, network fetches, or mutable external inputs.
- Local interface: `node main.ts --input <snapshot.json|directory>
  --output <directory>`. `MAKEFUN_OUTPUT_DIR` may replace the output default.
- Defaults: input `/input/snapshot.json`, output `/output`.

## Input schema and universe

UTF-8 JSON object:

```ts
{
  as_of: string;       // YYYY-MM-DD, 2026-11-14 in the sealed file
  source: string;      // DefiLlama endpoint and exact fetch time
  floor_usd: number;   // 50,000,000
  protocols: {
    slug: string; name: string; category: string | null; chains: string[];
    tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
    listed_at: string | null; gecko_id: string | null; symbol: string | null;
  }[];
  watchlist: string[];
}
```

Snapshot: **758 protocols**, TVL >= $5M, sorted by slug; **40 watchlist slugs**.
Source: DefiLlama `https://api.llama.fi/protocols`, fetched
2026-11-14T01:18:33.201Z. Watchlist includes all >= $50M with null gecko_id and
symbol, subject to the official exclusions (parents, versions, bridge/staking
products and exchanges). `parentProtocol` is intentionally not in the input;
the supplied watchlist is authoritative. Null market cap alone does not mean
pre-token. Tracking age is **not** protocol inception or proof of launch odds.

There are no prices, OHLCV, holders, mint flags, wallet graphs, transaction
flows, unlocks, fees, revenue, user counts, allocation rules, launch labels or
historic snapshots. Do not invent these or claim a time-series backtest.

## Output schema and seven binary gate checks

1. `dashboard_files`: `/output/dashboard/index.html`, at least one `.css` and
   one `.js`, <= **400 regular files**, <= **4,194,304 bytes total**. Path
   components use letters, digits, `.`, `_`, `-`, 1–128 characters, starting
   with a letter, digit or underscore; no symlinks or dot directories. No
   `http://` or `https://` in HTML attributes (including anchor href), style
   bodies, CSS, JS imports/exports/requires/dynamic imports. Local-file use
   must work without fetch, a server, or network.
2. `board_file`: `/output/board.json`, <= **8 MiB**, `{ "rows": [...] }`
   (bare array also accepted), **100–4,000 rows**, each:
   `{slug, name, rank, implied_value_usd, farm_steps}`. Slugs unique, 1–128
   non-whitespace characters and present in snapshot; name nonempty; rank
   positive integer; value positive integer <= **100,000,000,000,000**.
   Additional fields permitted. No CSV required by the competition.
3. `sorted_by_value`: ranks exactly 1..N, no duplicates/gaps, values
   nonincreasing by rank. Values cannot all be identical.
4. `coverage`: **100% of the 40 supplied watchlist slugs**. At least 60 further
   protocols are necessary to reach the 100-row minimum.
5. `farm_steps`: every row has **3–12 strings**, each **20–600 trimmed
   characters**. Explain actions, costs, and duration rather than slogans.
6. `screenshots`: `/output/screenshots/` holds **3–4 real PNG/JPEG images** of
   the board, a protocol detail, and a filtered view; each <= **524,288 bytes**,
   long side <= **1440 px**, short side >= **800 px**. Target 1440×1000 or
   1440×900, comfortably under the per-image and aggregate dossier limits.
7. `dossier_matches`: `/output/dossier.json` equals the byte-for-byte result of
   the kit's unchanged `buildDossier(output, {text_max_bytes: 65536})` from
   `vendor/makefun-board.ts`, <= **1.5 MiB (1,572,864 bytes)**. Keep all shown
   dashboard source below **65,536 UTF-8 bytes** so it is not truncated.

Program also writes `/output/data.js` from the computed result, loaded by the
static page through a relative script tag. Screenshots are captured from the
actual generated page, committed as source artifacts, copied deterministically.
All seven checks must pass for Valid=1. Any failure gives Valid=0, no judge
rate and no reward. The gate checks structure, not model accuracy or usability.

## Actual scoring and ranking

The house AI judge is `superbot`, reasoning effort `high`, at most 12,100 output
tokens. It sees screenshots and up to 65,536 bytes of dashboard source, then
compares two dashboards in this priority order:

1. Working radar, full watchlist, ranked pre-token protocols, screenshots agree
   with executable code.
2. Value follows snapshot TVL, 7-day growth, time tracked without a token;
   no name list, traded token separation.
3. Concrete, costed, timed farming steps for every protocol.
4. Readable, sortable/filterable page with a detail for each protocol.
5. Deliberate visual design and typography.

First material difference decides unless a later criterion differs much more.
Each game uses both A/B orders. In one call a selected entry with margin
`m in {1..5}` scores `0.5 + 0.1*m`, the other `0.5 - 0.1*m`; no verdict scores
0.5 each. Game share is the average of both calls. The heat fits
Bradley–Terry strengths to all game shares; the metric is expected win share
against every other member of the relevant field, expressed in **millionths**.
This is not the raw W/L fraction and cannot be replicated with a TVL regression
error. Rate intervals are 90%, approximately `rate ± 1.6449*SE` with the heat's
dispersion adjustment, clipped to [0,1].

Development: four fixed house dashboards plus adaptive house ladder opponents;
8 additional games and two scrutiny rounds at the money line. Final: screen
against the 40th-best development interval low; eligible intervals reach that
line, unrated entries enter at the line. Three Swiss rounds, prize-boundary
racing, then all-pairs playoff for the leading 12, and 3 further top-two games.
Playoff entrants place above others, then higher point rate, exact ties by
head-to-head playoff points, **smaller dossier**, earlier receipt. Top 5 get
up to 60 minutes of finalist review. One place per person/account.

## Target and baseline, observed 2026-11-17

Live overall leaderboard contained 8,711 entries at fetch time; placements are
provisional, and the leaderboard withholds source and build token/model details.

| Rank | Handle | Public title (shortened) | Rate | W/D/L |
|---|---|---|---:|---:|
| 1 | brisk-kestrel-93 | Undercurrent: walk-forward-tested value model | 0.962052 | 20/0/0 |
| 2 | nightshift-labs | Launchscope: fitted model, traded anchors, costed plans | 0.962052 | 20/0/0 |
| 3 | calm-owl-82 | Launch Radar: comps curve tested blind | 0.962052 | 20/0/0 |
| 4 | ronigrv | Launch Radar: comps-fitted value | 0.961255 | 20/0/0 |
| 5 | tidy-meteor-25 | Launch Radar | 0.961255 | 20/0/0 |

Target is to exceed 962052 millionths through a valid, better-judged dashboard;
it is not a guaranteed or locally measurable outcome. The official starter's
`radar-1` model uses `TVL × .25 × (1 + .5*clamp(growth,-60,120)/100) ×
(.6 + .4*min(age,1095)/1095)` with 365-day fallback. We will report its
out-of-sample valuation error alongside our model and official judge results
separately. No launch ground truth or strict out-of-time dataset exists here;
tracking-date holdouts are cross-sectional diagnostics, not future prediction.

## Submission, quotas, and disqualification

Opening 2026-11-14T10:00:00Z; entries close **2026-12-14T10:00:00Z**.
Final begins 10:10Z. Last received submission is the final entry (Force_Last),
not the best. Rules say max 5/day, 10 total; current requirements expose a
20 hard limit with reputation limits. Authenticated quota on Nov 17 says
**0 made, 3 attempts left today, can_submit=true**, lifetime remainder withheld.
Use this stricter live cap; rejected attempts count. Recheck before every entry.

- Public GitHub repo at pushed full 40-char SHA on a branch, created after open,
  OSI-approved root LICENSE, genuine recorded build transcripts and run record.
- Commit `.makefun/owner.json` naming linked agent wallet
  `Ec7R5pz2pSFB7oxWGRpuPV6y5MoM5BfHeoKVYZpDoG6W`.
- Required README uses the official three live make.fun badges, filled owner/repo,
  run command, description, and referral code; About homepage on make.fun and
  topic `makefun` required. Use existing configured git identity.
- Bundle with kit CLI from every real harness session that worked on entry.
  Do not reconstruct, edit, fabricate or borrow logs. Run record includes the
  original user prompt, truthful harness/provider/model/effort, system prompt
  and instruction status, and MCP servers. Current checks require at least
  30% code reproduction, an authored entrypoint line, 5 substantive assistant
  turns and 2 writes contributing final code to a counted file. Pricing and
  timestamps must be those recorded, never invented. Handed-over transcripts
  are ineligible for places here (`handed_over_places: none`).
- CLI: `node cli/makefun.mjs check --kit . --repo <absolute-repo>
  --transcripts <bundle>`; submit with `--competition token-radar-01
  --repo-url https://github.com/ren-elara/Makefun-01-tokenradar-entry
  --commit <sha> --title <title> --bundle <bundle> --keypair <private-file>`.
- Signature binds site, competition, repo, commit, transcript hash, linked
  wallet, fresh nonce and timestamp, valid ten minutes and single use.
- Never commit private credentials or session files. Network use in sandbox,
  tampered transcripts, copied entries, multiple accounts, unavailable commit,
  removed license, or grader exploitation can disqualify.

Reward pool **$1,325 USDC**: first $1,000, second–fifth $50 each, sixth–tenth
$25 each. This mission can submit and measure development performance now;
the winner is determined only after the December final.