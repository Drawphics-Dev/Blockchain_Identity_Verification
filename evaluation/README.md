# Metrics & evaluation — ROADMAP Phase 9

Reads the labelled outputs from `simulation/` and computes the metric groups from the brief,
plus the approved **Composite Effectiveness Score (CES)**:

- Access-control effectiveness: TAR, FRR, FAR
- Attack resistance (%)
- Continuous-validation effectiveness: mean anomaly detection time, session termination rate
- Audit (log) integrity (%)
- **CES = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthenticationPerformance**

> OPEN ITEM: "Authentication Performance" (10%) is not defined in the brief — confirm its
> definition (likely login/token/MFA latency) with the client before finalising CES.

Outputs CSV/JSON + optional charts. Not yet implemented — built in Phase 9.
