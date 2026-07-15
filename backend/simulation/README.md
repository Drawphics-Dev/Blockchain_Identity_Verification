# Security scenarios & attack simulation — ROADMAP Phase 8

The five required scenarios, scripted as repeatable runs that drive the **real** backend over
HTTP and emit **labelled outcomes** (ground truth + the decision the Zero Trust engine actually
made) for the Phase 9 metrics engine (`../evaluation/`).

| # | Scenario | Expected behaviour | Feeds metric |
|---|---|---|---|
| 1 | Genuine user login | ALLOW, reaches sensitive data | TAR, FRR |
| 2 | Invalid credential login | DENY at auth (401) | FAR, Attack resistance |
| 3 | Credential stealing & imitation | STEP_UP then blocked | FAR, Attack resistance |
| 4 | Log tampering trial | Integrity verifier flags mismatch | Audit integrity |
| 5 | Abnormal behaviour / continuous verification | Mid-session TERMINATE | Continuous validation |

## Run it

```bash
npm run dev        # terminal 1 — backend must be running
npm run db:seed    # once — needs the synthetic student population
npm run sim        # terminal 2 — full run
npm run sim -- --quick   # smaller counts, fast smoke run
```

Output is written to `simulation/results/simulation-latest.json` (plus a timestamped archive),
which `../evaluation/` reads to compute TAR/FAR/FRR, attack resistance, continuous-validation,
audit integrity and the CES.

Counts are configurable via env vars: `SIM_GENUINE`, `SIM_INVALID`, `SIM_THEFT`, `SIM_TAMPER`,
`SIM_ABNORMAL`. Scenario 5 waits on real background-monitor ticks, so it is deliberately slow —
keep `SIM_ABNORMAL` small.

## Layout

- `harness.ts` — HTTP client, simulated devices, MFA helpers, account reset/preparation.
- `scenarios/s1..s5-*.ts` — one file per scenario, each returning labelled outcomes.
- `run.ts` — orchestrator: runs all five in order, assembles and writes the report.
- `types.ts` — the labelled-outcome contract shared with `../evaluation/`.

Runs use dedicated synthetic students (never the hero demo account) and reset them first, so a
run is deterministic and re-runnable. Harness-generated `RiskEvent`s are tagged `simulated` so
the live `/metrics` endpoint can exclude them.

> **Ledger note:** this runs against the active `LedgerService` (MockLedger on Windows). The
> labelled outcomes and metric definitions are ledger-agnostic, so the identical run reproduces
> against `FabricLedger` once the network is up (ROADMAP Phases 4–5) with no scenario changes.
