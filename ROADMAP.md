# Implementation Roadmap (CLIENT-APPROVED)

> **This is the authoritative build plan, approved by the client (2026-07-10).**
> Where it differs from [IMPLEMENTATION.md](IMPLEMENTATION.md), **this document wins.**
> Original brief: [REQUIREMENTS.md](REQUIREMENTS.md).
>
> Key differences from IMPLEMENTATION.md:
> - **Linear 9-phase, Fabric-first order** (Fabric network + chaincode BEFORE the
>   backend) — replaces IMPLEMENTATION.md's two-track "Windows-first / MockLedger" strategy.
> - **New metric: Composite Effectiveness Score (CES)** with a new
>   **Authentication Performance** component (§7).

**Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals**

## 1. Project Overview
A working research prototype: a university student portal secured by a Zero Trust access
model, with identity anchoring and an immutable audit trail on a permissioned Hyperledger
Fabric blockchain. Targets two objectives:
1. Develop a blockchain-enhanced identity verification model supporting continuous user
   verification and immutable audit trails for Zero Trust access control.
2. Evaluate it across access-control effectiveness, attack resistance, continuous
   validation, and log integrity.

Portal simulates login, course/unit registration, fee statement access, and exam results;
every request is continuously verified and every access decision is written to the ledger.

**Security challenges addressed:** credential compromise, data adulteration, lateral movement.

## 2. Reference Architecture
| Layer | Component | Responsibility |
|---|---|---|
| Presentation | React portal (browser) | Login, dashboard, course reg, fees, results; collects device + behaviour telemetry per request. |
| Application | Node.js + Express backend | PEP + PDP: authenticates, scores risk, enforces decisions. |
| Data (off-chain) | PostgreSQL | Students, courses, enrollments, fees, results, sessions, risk events, audit mirror. |
| Ledger (on-chain) | Hyperledger Fabric | Immutable identity anchors + audit records via IdentityContract + AuditContract. |

**Zero Trust request lifecycle (every request):**
1. PEP validates the JWT and session status.
2. PDP computes a risk score from live signals (device, IP, time, behaviour, resource sensitivity).
3. Decision: ALLOW, STEP_UP (MFA), DENY, or TERMINATE_SESSION.
4. Identity check + decision written to Fabric and mirrored to PostgreSQL.
5. Response returned.

## 3. Technology Stack
| Layer | Technology | Notes |
|---|---|---|
| Blockchain | Hyperledger Fabric 2.5 (test-network) | Permissioned; 2 orgs, 1 channel. |
| Smart contracts | Node.js chaincode (fabric-contract-api) | IdentityContract + AuditContract. |
| Ledger client | @hyperledger/fabric-gateway | Connects backend to ledger. |
| Backend | Node.js + Express + TypeScript | App logic + Zero Trust engine. |
| Database | PostgreSQL 16 (Prisma) | Off-chain relational data. |
| Frontend | React + Vite + TypeScript + Tailwind | Student portal UI. |
| Auth | JWT + TOTP MFA | Login tokens + step-up MFA. |
| Host | Ubuntu 22.04 (VM or WSL2) + Docker | Runs Fabric + app stack. |
| Metrics | Node script + optional Python charts | Computes + plots results. |

## 4. Zero Trust Model Design
NIST SP 800-207 style PDP/PEP split; transparent rule-based risk engine.

### 4.1 Risk signals per request
Credential validity, device fingerprint, IP/geovelocity, time of day, behaviour pattern,
session age, resource sensitivity.

### 4.2 Risk scoring and decision policy
| Risk score | Decision | Meaning |
|---|---|---|
| under 30 | ALLOW | Request proceeds. |
| 30–60 | STEP_UP | Require MFA / re-verify identity on-chain. |
| 60–85 | DENY | Block this request and log it. |
| 85+ | TERMINATE_SESSION | Revoke token, force logout, log on-chain. |
Weights live in a config file so their effect on the metrics can be shown.

### 4.3 Continuous verification
- Middleware runs the decision engine on every authenticated API call.
- Background behaviour monitor recomputes a rolling risk score and can terminate a session
  mid-way with no new user action.
- Anomaly detection time = first abnormal event → session termination.

## 5. On-Chain vs Off-Chain
Golden rule: never put raw credentials or PII on the ledger — store hashes and events.

| Data | Location |
|---|---|
| Raw password | Nowhere (bcrypt hash in PostgreSQL only) |
| Student PII, courses, fees, results | PostgreSQL |
| Identity anchor (hash + public key) | Fabric (IdentityContract) |
| Every access decision + verification event | Fabric (AuditContract) |
| Audit mirror for dashboards/queries | PostgreSQL |

**Tamper detection:** each audit event written on-chain + mirrored to PostgreSQL; the
tampering attack edits the PostgreSQL copy; the integrity verifier re-reads the on-chain
record and compares hashes — mismatch = tampering detected. Ledger cannot be altered, so
tampering is always caught.

## 6. Phased Implementation Plan (9 phases, run in order)
| Phase | Goal | Output |
|---|---|---|
| 1 — Environment setup | Install Node 20, PostgreSQL 16, Docker, Ubuntu 22.04 (VM/WSL2); pull Fabric 2.5 samples/binaries/images. | Verified toolchain. |
| 2 — Project scaffold + ledger interface | Repo structure (backend, frontend, chaincode, simulation, evaluation). Define single `LedgerService` interface (registerIdentity, verifyIdentity, logAccessEvent, getAuditTrail, verifyEventIntegrity) so backend never depends on Fabric internals. | Stable skeleton. |
| 3 — PostgreSQL database | Schema: Student, Course, Enrollment, FeeStatement, Result, Session, RiskEvent, AuditMirror. Seed 20–50 students, courses, fees, results. | Populated DB. |
| 4 — Hyperledger Fabric network | Fabric test-network: 2 orgs (University IT, Registrar), 1 channel, orderer, CA identities. One-command start script. | Running permissioned network. |
| 5 — Smart contracts (chaincode) | IdentityContract (registerIdentity, verifyIdentity, revokeIdentity, getIdentity). AuditContract (logAccessEvent, getAuditEvent, getAuditTrail, verifyEventIntegrity; append-only, hash-chained). | Two deployed contracts. |
| 6 — Backend + Zero Trust engine | Auth (bcrypt + JWT + TOTP MFA; verify identity anchor on-chain at login). PDP risk engine + PEP middleware on every protected route. Portal API (courses, enrollment, fees, results; fees/results sensitive). Audit integrity verifier endpoint. | Enforcing backend writing audit events to ledger. |
| 7 — React student portal | Login (+MFA), Dashboard (live trust/risk widget), Course Registration, Fee Statement, Results. Admin/Research view: audit-trail viewer, Verify Integrity button, live metrics. Per-request telemetry. | Demo-ready portal. |
| 8 — Security scenarios + attack simulation | 5 scripted scenarios emitting labelled outcomes (see below). | Repeatable scenario runs. |
| 9 — Metrics, evaluation, deployment | Compute all metric groups, export CSV/JSON + charts. Package for one-command start-up; prepare live showcase. | Final results + deployable system. |

**Scenarios (Phase 8):**
| # | Scenario | Expected behaviour | Feeds metric |
|---|---|---|---|
| 1 | Genuine user login | ALLOW | TAR, FRR |
| 2 | Invalid credential login | DENY at auth | FAR, Attack resistance |
| 3 | Credential stealing & imitation | STEP_UP then DENY | FAR, Attack resistance |
| 4 | Log tampering trial | Integrity verifier flags mismatch | Audit integrity |
| 5 | Abnormal behaviour / continuous verification | Mid-session TERMINATE_SESSION | Continuous validation |

## 7. Evaluation Metrics & Calculations
Confusion-matrix terms: TP = legit granted, FN = legit rejected, FP = unauthorized granted,
TN = unauthorized blocked.

**(a) Access-control effectiveness**
- TAR = TP / (TP + FN) — high
- FRR = FN / (TP + FN) = 1 − TAR — low (usability)
- FAR = FP / (FP + TN) — low (stronger security)

**(b) Attack resistance** = (Blocked Attacks / Total Attack Attempts) × 100

**(c) Continuous-validation effectiveness**
- Mean anomaly detection time = average(t_terminate − t_first_anomaly), seconds
- Session termination rate (%) = (Sessions terminated after detection / Total risky sessions) × 100

**(d) Audit (log) integrity** = (Detected Tampering Attempts / Total Tampering Attempts) × 100 (≈100% expected).

### Composite Effectiveness Score (CES) — NEW
| Component | Weight |
|---|---|
| Access Control Effectiveness | 40% |
| Continuous Validation Effectiveness | 30% |
| Audit Integrity | 20% |
| Authentication Performance | 10% |

**CES = 0.4·(Access Control Effectiveness) + 0.3·(Continuous Validation Effectiveness) + 0.2·(Audit Integrity) + 0.1·(Authentication Performance)**

Weighting prioritizes access control (identity verification is the primary goal); continuous
validation is second (fundamental to Zero Trust).

> **OPEN ITEM:** "Authentication Performance" is introduced here but not defined in the brief.
> Needs a concrete definition (e.g. login/token-issuance latency, MFA verification time)
> before Phase 9. Confirm with client.

### Illustrative results (to be filled with real runs)
TAR 0.98 · FAR 0.02 · FRR 0.02 · Attack resistance 97% · Mean detection 1.4s ·
Session termination 100% · Audit integrity 100%.

## 8. Scope, Risks & Academic Framing
- Prototype scale: 2-org test-network on one host — functional, not production.
- Simulated signals: device/behaviour simplified; future work = behavioural biometrics / ML.
- Rule-based engine chosen for reproducibility over a black box.
- Threat model — in scope: credential theft, log tampering, abnormal behaviour. Out of
  scope: network-layer, DoS, insider chaincode compromise.
- Dataset dependence: report request counts alongside TAR/FAR/FRR.
- Ethics: synthetic data only; no real student data or third-party systems.
