# ORBIT — a token opportunity research desk

## What wins this specific task

The sealed rubric puts a working and honest radar first, an explainable value
model second, and useful farm plans third. We will build a research desk where
every displayed number can be recomputed from the supplied snapshot and the
same pure model the entrypoint runs. The name ORBIT describes a consistent
valuation frame around protocols that are still unpriced. No launch classifier,
holder graph, or RPC layer is justified by ten input fields and an offline run.

Our quantitative target is better held-out estimation of observed token market
caps than the starter's arbitrary 0.25×TVL multiple, with useful uncertainty and
fully costed scenarios. These tests validate the conditional valuation model;
only the official judge measures the bounty score. No snapshot labels tell us
launch probability, future price, future return or farm eligibility. The
leaderboard's 0.962052 top rate is our provisional judge target, not a number
that can be asserted from regression or a screenshot inspection.

## Universe and classification

1. Parse and normalize the frozen snapshot with explicit validation. Use
   `as_of` for age, never the machine clock. Null growth is neutral with a
   visible missing-data flag; unknown age gets a stated 365-day fallback.
2. Any non-null token identifier/symbol or positive market cap is recorded
   token evidence. Put these in a separate traded reference view, even when
   cap is missing. No traded row enters the pre-token ranking.
3. Include every official watchlist slug. Outside it, exclude exchange,
   bridge, wrapped/staked derivative and versioned product categories/names.
   Explain each exclusion; preserve a full universe audit. Input lacks parent
   IDs, so disclose that parent independence cannot be verified. Never label
   absence from DefiLlama as proof no token exists.
4. Rank all qualifying protocols, including those below $50M. Ties break by
   slug deterministically. Keep launch value rank distinct from farming
   economics: a very large protocol can still be unattractive to a small user.

## Conditional valuation and evidence

Train on token-bearing protocols with positive finite TVL and market cap. Group
by CoinGecko ID (ticker fallback) before splitting, one economic token per
observation. Avoid letting several versions of a protocol leak into both train
and test or overweight a single token's cap. Remove obvious receipt assets
from the comparables where category evidence supports it; record counts and
selection rules.

Research candidate models before choosing: starter formula, fitted global
market-cap/TVL median, robust log market-cap size curve, size + shrunk sector
effects, and regularized multi-feature log regression. Fit with deterministic
Huber iterations to limit huge multiples, not by clipping reported truth. Use
log TVL, robust seven-day growth, tracking age, and category/family context.
Make growth/age adjustments explicit and capped where the data cannot identify
them reliably. Category effects shrink to the global size curve for small
samples. Missing categories use the global fit. Select via grouped deterministic
cross validation and a held-out newest-tracking-date split. The latter is an
age-cohort stress check, **not an out-of-time launch backtest**.

Report median multiplicative error `exp(median(abs(log(pred/actual))))`, mean
absolute log error, fraction within 3×, and rank correlation. Include family
count, cohort sizes and all model comparisons. Use cross-fitted log residual
quantiles for empirical prediction bands, and state they are cross-sectional
error ranges, not confidence that a token will launch or its future price.
Show nearest traded comparables, their observed values and model errors.

Model must not reward TVL with a constant proportion by default: sublinear
size is empirically plausible, extreme TVL can be economically unmonetized,
and governance claims differ between families. Family effects and uncertainty
must say what the snapshot cannot identify. No named protocol receives a
secret multiplier. Show the formula, sample size, fit, holdout results and
assumption sliders directly on the dashboard, computed by the real engine.

## Farm economics, not invented alpha

Generate a mechanism-specific plan from category, chains, TVL, growth and age,
with protocol name and local context inserted. No fabricated points, published
allocation, confirmed airdrop, fees, mint privileges, or URLs asserted from
the sealed input. Each row has 6–8 detailed steps: verify official venue and
eligibility, tiny exit test, size/deposit or honest usage, repeat only useful
activity, monitor risk, exit/revoke, verify any launch before proceeding.
RWA/curator/payment/chain rows receive different actions and an access-check
or observe verdict when the economic mechanism is uncertain.

User-controlled scenarios: deposit, horizon, annual capital opportunity cost,
allocation fraction and eligibility share. Scenario wallet allocation is
`conditional_value × hypothetical_airdrop_fraction × deposit/TVL ×
eligibility_share`, explicitly a TVL-pro-rata assumption, not a rule. Deduct
round-trip gas assumptions, fees/slippage allowance, capital cost and time.
Show conditional gross, net at median/low band, break-even launch/eligibility
probability, and time-adjusted net. Unknown launch odds remain unknown; do not
convert assumptions into a probability forecast. Give observe, small pilot,
or skip guidance that follows the selected scenario and capital constraints.

Thin TVL, sharply declining TVL, young/missing tracking date, absent category,
and no in-family comparables increase visible caution. Zero liquidity cannot
cause division by zero; missing identifiers cannot merge every token into
one family. Malformed snapshots get a clear nonzero exit before writing.
Large numeric outputs are capped at the gate's safe positive dollar bounds.

## Architecture and dashboard

Use only Node's standard library and plain browser JS/CSS/HTML. One pure,
dependency-free `dashboard/engine.js` implements classification, fitting,
validation, values, scenario economics and farm plans for both Node and
browser. `main.ts` reads input, calls the engine, validates board invariants,
writes board/data, copies dashboard/screenshots and calls the unchanged vendor.
The page loads relative scripts without fetch, so opening an HTML file works.
Do not ship mutable caches or installed packages to the grader.

Chosen design: a dark ink navigation rail, warm paper content, forest green
and orange accents, compact legible metrics and table typography. Board,
protocol detail, model lab and universe audit are real views. Search and
category/chain/status filters, sort, result counts and CSV export are functional.
Model evidence and farm assumptions stay visible near the ranking. Detail
explains the value build, prediction band, nearest peers and actionable plan;
sliders update the same model/economics and show when it is a scenario.

Keep all dashboard source within the dossier's 65,536 bytes; data is written
to `/output/data.js` outside it. Capture the generated page in Chromium for
board, detail, filtered view (optionally model lab), 1440px long side, >=800px
short side, targeting 150–250KB per image and total dossier <1.5MiB. No fake
mockups or screenshots from another entry. Audit screenshot/UI/data agreement.

## Validation and iteration

Before production code, analyze snapshot cohorts and candidate models and
record results in `VALIDATION.md`. Then test schema coverage, uniqueness,
sorted integer ranks, unknown/duplicate/malformed inputs, zero TVL, extreme
growth, category fallbacks, escaping and network-free browser rendering.
Use meaningful native Node tests for the model and generated gate contract.
Build twice and compare full output hashes. Clean-room run from git archive in
Node 22 without installed dependencies, under Docker network none and limits;
measure time and memory. Exercise browser sorting, filters, detail, economic
scenarios, CSV and offline reload. Rebuild dossier independently and compare.

Use genuine Cline session files found by the kit; run official bundle/check,
fix all actionable failures and keep the original logs. Commit under the
existing user identity, set the required README/About, push main, check the
live quota, sign/submit as @ren-elara, poll the gate/judge results, and use the
remaining live attempts only for evidence-backed improvements. Record official
results separately from the conditional-value diagnostics. Winning cannot be
confirmed until the December final has run.