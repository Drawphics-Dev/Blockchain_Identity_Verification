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
> It is computed here on a transparent PROVISIONAL definition — `score = 1 −
> meanLoginLatency/budget` (budget 1500 ms), with mean MFA-verify latency reported alongside —
> and **must be confirmed with the client**. Two CES values are therefore reported: one
> **including** the provisional component and one **excluding** it (its 10% redistributed across
> the three defined components). The excluding value is the defensible headline until the client
> confirms a definition; adjust `AUTH_PERF_BUDGET_MS` / the formula in `metrics.ts` once they do.

## Layout

- `metrics.ts` — pure metric functions (no I/O): confusion matrix, TAR/FAR/FRR, attack
  resistance, continuous validation, audit integrity, auth performance, CES.
- `report.ts` — assembles the `MetricsReport` and serializes it to CSV + HTML.
- `run.ts` — reads the simulation report, computes, prints a console summary, writes outputs.

Metric definitions are ledger-agnostic, so the same evaluation reproduces against `FabricLedger`
once the Fabric network is up (ROADMAP Phases 4–5) with no changes here.
