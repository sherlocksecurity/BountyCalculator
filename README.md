# Eternal Bounty Calculator

[Open the calculator](https://sherlocksecurity.github.io/BountyCalculator/)

Choose **Eternal** or **Nugget**, select an asset tier or Nugget asset,
and enter a finalized **CVSS v3.1 score**. The result shows the base bounty,
applicable range, and calculation. This converts a finalized score to an
estimated reward; it does not calculate a CVSS score from vulnerability metrics
or approve an award.

## Base rates (USD)

Rates verified on **30 September 2026** against the Eternal program and the
program owner's approved Nugget ranges.

| Program / asset | Low: 0.1–3.9 | Medium: 4.0–6.9 | High: 7.0–8.9 | Critical: 9.0–10.0 |
| --- | --- | --- | --- | --- |
| Eternal · Tier 1 | $100–$300 | $300–$1,000 | $1,000–$2,000 | $2,000–$4,000 |
| Eternal · Tier 2 | $100–$200 | $200–$500 | $500–$1,000 | $1,000–$2,000 |
| Eternal · Tier 3 | $50–$100 | $100–$250 | $250–$500 | $500–$1,000 |
| Nugget · Nugget Web SDK | $100–$200 | $200–$300 | $300–$500 | $500–$1,000 |
| Nugget · Nugget Dashboard | $100–$200 | $200–$500 | $500–$1,000 | $1,000–$2,000 |

CVSS **0.0 (None)** returns **$0.00**. Every other score is interpolated within
its severity band:

```text
base = minimum reward
     + (score − minimum score) / (maximum score − minimum score)
     × (maximum reward − minimum reward)
```

For example, CVSS 9.5 produces $3,000 for Eternal Tier 1, $1,500 for the
Nugget Dashboard, and $750 for the Nugget Web SDK. Interpolation follows the
existing calculator's method and the Eternal policy's exact-score examples;
it is not a payout formula specified by FIRST.

Money uses exact integer/rational arithmetic and rounds **half up to USD cents**
only when producing each final amount. A manual multiplier is applied before
rounding and displayed separately. For example, SDK CVSS 5.5 is $251.72 base;
with 1.5× applied to its unrounded value, the adjusted amount is $377.59.

Scores must be between 0 and 10 with at most one decimal. Invalid input clears
the old result. Program changes require an explicit asset selection. Manual
multipliers reset to 1× whenever the program or asset changes. Rates are not
editable in the browser, and campaign bonuses are never applied automatically.

Final severity, eligibility and awards remain with the security team. Scope
references are informational; consult the current policy and exclusions.
Restricted testing targets and integration credentials are not included here.

Sources: [Eternal policy](https://hackerone.com/eternal),
[Nugget policy (invited access)](https://hackerone.com/eternal-private),
[FIRST CVSS v3.1 specification](https://www.first.org/cvss/v3.1/specification-document).

## Development and verification

The site is static HTML, CSS and native JavaScript modules. No build step,
runtime package, external font or third-party script is required. Serve the
repository over HTTP (opening `index.html` with `file://` will block modules):

```sh
npm ci
npm run check
npm run serve
```

Open `http://127.0.0.1:8765`. Node.js 18+ and Python 3 are needed for these
development commands; GitHub Actions verifies with Node.js 22.

The regression suite includes:

- All **4,545 combinations** of 101 valid scores, five reward tables and nine
  multipliers, checked against an independent Decimal.js numerical oracle.
- Independently transcribed policy fixtures, all severity endpoints, known
  examples, monotonic payouts, exact rounding and invalid inputs.
- DOM interactions covering program/asset switches, stale-result clearing,
  slider boundaries, multiplier resets and asynchronous clipboard behavior.

Policy data lives in `src/policy.mjs`, calculation logic in `src/calculator.mjs`,
and UI behavior in `src/app.mjs`. When changing rates, verify the source policy,
update the verification date in the data and page, update the independent
fixtures, and run the checks. For each release, change the shared `?v=` release
tag on the stylesheet, entry script and all module imports in `index.html`,
`src/app.mjs` and `src/calculator.mjs` so cached policy data cannot be mixed with
a newer interface. Never change the test fixtures solely to make a
failure pass.

GitHub Pages publishes the repository root from `main`. CI runs on pushes and
pull requests. A successful test run does not replace reviewing policy changes.
