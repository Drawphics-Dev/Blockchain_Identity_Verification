# Metrics & evaluation — ROADMAP Phase 9

Reads the labelled report from `../simulation/results/simulation-latest.json` (Phase 8) and
computes the metric groups from the brief plus the approved **Composite Effectiveness Score
(CES)**, exporting JSON + CSV + a self-contained HTML chart.

## Run it

```bash
npm run sim        # produce a fresh labelled report (Phase 8)
npm run evaluate   # compute metrics from it
npm run evaluate -- path/to/simulation-XXXX.json   # or point at a specific archive
```

Outputs land in `evaluation/results/`:

- `metrics-latest.json` — full structured report (all metrics + CES components).
- `metrics-latest.csv` — flat `metric,value` rows for a report or spreadsheet.
- `metrics-latest.html` — self-contained chart (confusion matrix, metric bars, CES gauge);
  opens directly in a browser, no external assets.

## Metrics (ROADMAP §7)

- **Access-control effectiveness** — TAR, FRR, FAR from the confusion matrix, computed from the
  access-control scenarios (1–3) per the Phase 8 scenario→metric mapping.
- **Attack resistance** — blocked / total attack attempts × 100 (scenarios 2–3).
- **Continuous-validation effectiveness** — mean anomaly detection time, session termination
  rate (scenario 5).
- **Audit integrity** — detected / total tampering attempts × 100 (scenario 4).
- **CES** = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity +
  0.1·AuthenticationPerformance.
  - Access control is scalarized as **balanced accuracy** = (TAR + (1−FAR)) / 2 (the roadmap
    gives TAR/FAR/FRR separately and leaves the single-number rollup to Phase 9).
  - Any component with no data is dropped and the remaining weights renormalized, so a missing
    scenario lowers confidence rather than silently scoring 0.

> **OPEN ITEM — "Authentication Performance" (10%) is undefined in the brief (ROADMAP §7).**
> Table 1 assigns it a weight but, unlike the other three components, never gives a formula. It is
> computed here on an explicit PROVISIONAL definition that **must be confirmed with the client**
> (ROADMAP §7(e) records the full proposal):
>
> ```
> meanLoginLatency ≤ AUTH_PERF_TARGET_MS  (3 000 ms) → 1.0
> meanLoginLatency ≥ AUTH_PERF_CEILING_MS (10 000 ms) → 0.0
> between                                             → linear
> ```
>
> Both anchors come from published HCI response-time research (the 3 s web-response threshold and
> Nielsen's 10 s *limit of attention*) and were fixed **before** the evaluation ran — they have not
> been tuned to the result. Mean MFA-verify latency is reported alongside but not folded in.
>
> Two CES values are therefore reported: one **including** this component and one **excluding** it
> (its 10% redistributed across the three defined components). Adjust `AUTH_PERF_TARGET_MS` /
> `AUTH_PERF_CEILING_MS` in `metrics.ts` if — and only if — the client supplies different numbers.

## Layout

- `metrics.ts` — pure metric functions (no I/O): confusion matrix, TAR/FAR/FRR, attack
  resistance, continuous validation, audit integrity, auth performance, CES.
- `report.ts` — assembles the `MetricsReport` and serializes it to CSV + HTML.
- `run.ts` — reads the simulation report, computes, prints a console summary, writes outputs.

Metric definitions are ledger-agnostic, so the same evaluation reproduces against `FabricLedger`
once the Fabric network is up (ROADMAP Phases 4–5) with no changes here.
