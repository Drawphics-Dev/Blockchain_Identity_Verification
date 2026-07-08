# Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals
### Complete Step-by-Step Implementation Guide (Research Prototype)

> **Purpose of this document.** A single, self-contained build plan you (or a developer) can follow end-to-end to produce a working, demo-able prototype that satisfies both research objectives:
>
> 1. A **blockchain-enhanced identity verification model** with **continuous user verification** and **immutable audit trails** for Zero Trust access control in a university student portal.
> 2. An **evaluation harness** that measures the model against *access-control effectiveness (TAR/FAR/FRR)*, *attack resistance*, *continuous-validation effectiveness*, and *audit (log) integrity*.
>
> **Note on the diagrams:** the architecture diagram and conceptual framework images referenced in the brief were not readable in this environment. This plan is built from your written description; Section 2 restates the architecture I assumed so you can confirm it matches your diagram before building.

> **Build strategy (important — read first):** This prototype is built in **two tracks** so you can make fast progress on Windows before dealing with any blockchain/Linux tooling. See [§1.1](#11-development-strategy-windows-first-fabric-last). In short: build the **React portal + Node backend + PostgreSQL + Zero Trust engine** on Windows first, using a **`MockLedger`** that behaves like the blockchain; then, at the end, run the same code in **WSL2/Ubuntu**, stand up **Hyperledger Fabric**, and swap `MockLedger → FabricLedger` with almost no other code changes.

---

## Table of Contents
1. [Executive summary & recommendations](#1-executive-summary--recommendations)
2. [Reference architecture](#2-reference-architecture)
3. [Technology stack (and where I deviate from the proposal, and why)](#3-technology-stack)
4. [Zero Trust model design](#4-zero-trust-model-design)
5. [What goes on-chain vs off-chain](#5-what-goes-on-chain-vs-off-chain)
6. [Prerequisites & environment setup](#6-prerequisites--environment-setup)
7. [Repository / project layout](#7-repository--project-layout)
8. [Phase 1 — Hyperledger Fabric network](#8-phase-1--hyperledger-fabric-network)
9. [Phase 2 — Chaincode (smart contracts)](#9-phase-2--chaincode-smart-contracts)
10. [Phase 3 — PostgreSQL database](#10-phase-3--postgresql-database)
11. [Phase 4 — Node.js backend & Zero Trust policy engine](#11-phase-4--nodejs-backend--zero-trust-policy-engine)
12. [Phase 5 — React student portal](#12-phase-5--react-student-portal)
13. [Phase 6 — Security scenarios & attack simulation harness](#13-phase-6--security-scenarios--attack-simulation-harness)
14. [Phase 7 — Metrics, calculations & evaluation](#14-phase-7--metrics-calculations--evaluation)
15. [Phase 8 — Deployment & showcasing](#15-phase-8--deployment--showcasing)
16. [Demo script (what to click during the showcase)](#16-demo-script)
17. [Effort & time estimate (in hours)](#17-effort--time-estimate)
18. [Risks, limitations & academic framing](#18-risks-limitations--academic-framing)
19. [Deliverables checklist](#19-deliverables-checklist)

---

## 1. Executive summary & recommendations

Your proposal is sound. The core research contribution is the **combination of Zero Trust (continuous verification) + a permissioned blockchain (immutable audit trail)** applied to a student portal. The prototype has to *prove* two things visibly:

- **Continuous verification** — access is re-evaluated on *every* request using live risk signals, not just at login.
- **Immutable audit** — every identity check and access decision is written to the ledger and **cannot be silently altered**; any tampering attempt is detectable.

**Recommendations (fast + credible for a research demo):**

| Topic | Your proposal | My recommendation | Why |
|---|---|---|---|
| Blockchain | Hyperledger Fabric via Docker | **Keep Fabric**, but build on the official `fabric-samples` **test-network** (2 orgs, 1 channel, LevelDB) | It's the fastest, best-documented path to a *real* Fabric network. Keeps academic credibility (still Fabric) while saving days of network engineering. |
| Fabric State DB | (unspecified) | **LevelDB** for the demo (not CouchDB) | Fewer containers, faster startup. CouchDB only needed for rich queries — we do rich queries in PostgreSQL instead. |
| App logic | Node.js | **Node.js + Express + TypeScript** | Type-safety reduces bugs in the risk engine; still Node. |
| Fabric SDK | (unspecified) | **`@hyperledger/fabric-gateway`** (Fabric v2.5 Gateway API) | Modern, far simpler than the legacy `fabric-network` SDK. |
| DB | PostgreSQL | **Keep PostgreSQL** (with Prisma or `pg`) | Correct choice for off-chain relational data (students, courses, fees, results, sessions). |
| Frontend | React | **React + Vite + TypeScript + Tailwind** | Vite is far faster to develop/build than CRA. |
| Host | Virtual Ubuntu server | **Docker Compose on Ubuntu (or WSL2 on your Windows 11 machine)** | One `docker compose up` brings up the whole stack. You're already on Windows 11 — WSL2 Ubuntu works identically and avoids a separate VM. |
| Risk/behavior signals | "abnormal behavior" | **Rule-based risk engine + simple statistical baseline** (not ML) | For a prototype, transparent rules are *more* defensible than a black-box model and produce clean metrics. |

**Bottom line:** keep the whole proposed stack; the only meaningful change is *how* you stand up Fabric (use the test-network sample) and using LevelDB + a modern SDK to move faster.

---

## 1.1 Development strategy (Windows-first, Fabric-last)

You do **not** need Docker, Ubuntu, or Hyperledger Fabric to start. Build in two tracks:

### Track A — App layer, on Windows (do this first)
Everything except the blockchain runs natively on Windows with just **Node.js + PostgreSQL** installed:
- React student portal
- Node.js backend + Zero Trust risk engine (PDP/PEP)
- PostgreSQL database
- The 5 security scenarios + metrics harness

During Track A the backend talks to a **`MockLedger`** instead of Fabric.

### Track B — Blockchain layer, on WSL2/Ubuntu (do this last)
When Track A is fully working and demo-able, move to WSL2 (which *is* Ubuntu — this satisfies the proposal's "virtual Ubuntu server" requirement without a separate VM), stand up Hyperledger Fabric, deploy the chaincode, and switch the backend from `MockLedger` to `FabricLedger`.

### The abstraction that makes the switch trivial
All ledger access goes through **one interface with two implementations** — this is clean design, not a hack:

```
LedgerService  (interface: registerIdentity, verifyIdentity,
                logAccessEvent, getAuditTrail, verifyEventIntegrity)
├── MockLedger    ← Track A. Append-only records in memory / a dedicated
│                   Postgres table, with SHA-256 hashing + append-only
│                   enforcement in code. Mimics the ledger's guarantees.
└── FabricLedger  ← Track B. Real Hyperledger Fabric via fabric-gateway.
```

The backend depends only on the `LedgerService` interface, so swapping implementations is a **one-line config change** (`LEDGER=mock` → `LEDGER=fabric`). Nothing in the portal, risk engine, scenarios, or metrics changes.

**Does the mock invalidate the research?** No. During Track A you develop and demo the *behavior* (continuous verification, audit logging, tamper detection). The **final, reported results** are produced in Track B on real Fabric — the mock is a development stand-in, and you state that explicitly. The audit-integrity metric works in both: `MockLedger` enforces append-only + hash verification in code (so off-chain tampering is still detected); `FabricLedger` enforces it cryptographically on-chain.

### Revised phase order
```
TRACK A (Windows, Node + Postgres only):
  A1  Project scaffold + LedgerService interface + MockLedger
  A2  PostgreSQL schema + seed data
  A3  Backend: auth (JWT + MFA) + portal API
  A4  Zero Trust PDP/PEP + continuous verification
  A5  React portal (5 pages + admin/research view)
  A6  Security scenarios + attack/tamper simulation
  A7  Metrics engine + charts          ← fully working demo on Windows here

TRACK B (WSL2/Ubuntu, adds Docker + Fabric):
  B1  Install WSL2 + Docker + Fabric samples
  B2  Fabric test-network up
  B3  Deploy Identity + Audit chaincode
  B4  Implement FabricLedger, flip LEDGER=fabric
  B5  Re-run scenarios + metrics on real Fabric → final reported results
```

> The detailed phase sections below (§8–§14) still contain everything; this ordering just tells you **which to do on Windows now (A) and which to defer to Ubuntu later (B)**. Phases 3, 4, 5, 6, 7 = Track A. Phases 1, 2, and the `FabricLedger` half of Phase 4 = Track B.

---

## 2. Reference architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          STUDENT (Browser)                                  │
│   React SPA: Login · Dashboard · Course Reg · Fee Statement · Results       │
│   Collects device fingerprint + behavioral telemetry on every request       │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │ HTTPS (JWT + per-request risk context)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND  (Policy Enforcement Point, PEP)          │
│                                                                              │
│   ┌───────────────┐   ┌──────────────────────┐   ┌────────────────────────┐ │
│   │ Auth service  │   │ Zero Trust Policy     │   │ Fabric Gateway client   │ │
│   │ (login, MFA,  │──▶│ Decision Point (PDP): │──▶│ (submit/evaluate txns)  │ │
│   │  JWT issue)   │   │ risk scoring engine   │   │                         │ │
│   └───────────────┘   └──────────┬───────────┘   └───────────┬────────────┘ │
│                                   │                            │              │
│   ┌───────────────────────────────▼───────────┐               │              │
│   │ Portal API: courses, fees, results (CRUD)  │               │              │
│   └───────────────────────────────────────────┘               │              │
└───────────────┬───────────────────────────────────────────────┼────────────┘
                │                                                 │
      ┌─────────▼─────────┐                          ┌────────────▼───────────┐
      │   PostgreSQL      │                          │  HYPERLEDGER FABRIC     │
      │  (off-chain)      │                          │  (permissioned ledger)  │
      │  students, creds  │                          │  Chaincode:             │
      │  courses, fees,   │                          │   • IdentityContract    │
      │  results, sessions│                          │   • AuditContract       │
      │  risk_events      │                          │  Immutable audit trail  │
      └───────────────────┘                          └─────────────────────────┘
```

**Zero Trust request lifecycle (every single request):**

```
Request ─▶ [PEP: validate JWT/session]
        ─▶ [PDP: compute risk score from signals]
        ─▶ decision ∈ {ALLOW, STEP_UP (re-auth/MFA), DENY, TERMINATE_SESSION}
        ─▶ [Fabric: verifyIdentity() + logAccessEvent() written to ledger]
        ─▶ response to user
```

This is the "never trust, always verify" property: the PDP runs on **login *and* on every subsequent API call**, and every decision is anchored on-chain.

---

## 3. Technology stack

| Layer | Technology | Version (target) |
|---|---|---|
| Blockchain | Hyperledger Fabric (test-network) — *Track B* | 2.5.x LTS |
| Chaincode | Node.js chaincode (`fabric-contract-api`) — *Track B* | — |
| Ledger client | `LedgerService` interface → `MockLedger` (Track A) / `FabricLedger` via `@hyperledger/fabric-gateway` (Track B) | latest |
| Backend | Node.js + Express + TypeScript | Node 20 LTS |
| ORM / DB driver | Prisma (or `pg`) | latest |
| Database | PostgreSQL | 16 |
| Frontend | React + Vite + TypeScript + Tailwind CSS | React 18 |
| Auth | JWT (`jsonwebtoken`) + TOTP MFA (`otplib`) | — |
| Crypto | Node `crypto` (SHA-256 hashing, key signing) | — |
| Containerization | Docker + Docker Compose | latest |
| Host OS | Ubuntu 22.04 (VM or WSL2) | — |
| Metrics/plots | Node script + Python (`pandas`, `matplotlib`) *optional* | — |

---

## 4. Zero Trust model design

Zero Trust here = **NIST SP 800-207** style Policy Decision Point / Policy Enforcement Point split, adapted to a portal.

### 4.1 Risk signals collected per request
| Signal | Source | Example use |
|---|---|---|
| Credential validity | password/JWT | invalid → DENY |
| Device fingerprint | browser (user-agent, screen, timezone hash) | new device → higher risk |
| IP address / geovelocity | request | impossible travel → high risk |
| Time-of-day | request | 3am access when baseline is 9–5 → risk |
| Behavioral pattern | navigation speed, request rate, resource sequence | scripted/abnormal → risk |
| Session age / re-auth recency | session store | stale → STEP_UP |
| Privilege of resource | requested endpoint | results/fees = sensitive → stricter threshold |

### 4.2 Risk scoring (transparent, rule-based)
```
riskScore = Σ (weightᵢ × signalᵢ)      // 0–100

Decision policy:
  score <  30            → ALLOW
  30 ≤ score < 60        → STEP_UP  (require MFA / re-verify identity on-chain)
  60 ≤ score < 85        → DENY this request (log it)
  score ≥ 85             → TERMINATE_SESSION  (revoke JWT, force logout, log on-chain)
```
Weights live in a config file (`policy.config.ts`) so you can tune them and **show the effect on the metrics** — this is a strong point for the "evaluation" objective.

### 4.3 Continuous verification
- A middleware runs the PDP on **every** authenticated API call.
- A background "behavior monitor" recomputes a rolling risk score; if it crosses a threshold mid-session it **terminates the session** even without a new user action (this is your *"abnormal user behavior needing continuous verification"* scenario).
- **Anomaly detection time** is measured from the first anomalous event to the session-termination event.

---

## 5. What goes on-chain vs off-chain

**Golden rule: never put PII or raw credentials on the ledger.** Store *hashes and events*, not secrets.

| Data | Where | Notes |
|---|---|---|
| Raw password | Nowhere (only bcrypt hash in PostgreSQL) | — |
| Student PII (name, email, courses, fees, results) | **PostgreSQL** | mutable operational data |
| Identity anchor: `hash(studentID + credential + salt)`, public key | **Fabric** (IdentityContract) | used to verify without revealing the credential |
| Every access decision (who, what resource, decision, risk score, timestamp) | **Fabric** (AuditContract) | this is the immutable audit trail |
| Verification events (login success/fail, MFA, step-up) | **Fabric** (AuditContract) | — |
| Rich queries / dashboards / metrics rollups | **PostgreSQL** (mirror of events) | fast querying; ledger remains source of truth |

**Tamper detection mechanism (core of "audit integrity"):**
- Each audit event is written on-chain, producing an immutable record + transaction ID.
- A copy is also mirrored to PostgreSQL for fast querying.
- The **"log tampering" attack** modifies the PostgreSQL copy directly (SQL UPDATE).
- The **integrity verifier** re-reads the on-chain record and compares its hash to the PostgreSQL copy → mismatch = **tampering detected**. Because you cannot alter the ledger record, tampering is always caught → high audit-integrity score.

---

## 6. Prerequisites & environment setup

Split by track. **For Track A (build now) you only need §6.0.** Track B tooling (§6.1–6.3) is deferred until you're ready for Fabric.

### 6.0 Track A — Windows (only Node + PostgreSQL needed)
Install these two on Windows and you can build the entire app layer:
```powershell
# Node.js 20 LTS — download the Windows installer from https://nodejs.org  (or via winget):
winget install OpenJS.NodeJS.LTS

# PostgreSQL 16 — download from https://www.postgresql.org/download/windows/  (or via winget):
winget install PostgreSQL.PostgreSQL.16
```
Verify in a new terminal:
```powershell
node -v      # v20.x
psql --version
```
That's all you need to start scaffolding and running the portal, backend, Zero Trust engine, scenarios, and metrics with `MockLedger`.

---

### Track B — Ubuntu/WSL2 (defer until the app layer works)

> Do this on Ubuntu 22.04 (a VM, a cloud instance, or **WSL2 on your Windows 11 box**). WSL2 is recommended since you're already on Windows 11 — and WSL2 *is* Ubuntu, so it satisfies the proposal's "virtual Ubuntu server" requirement. Install WSL2 first with `wsl --install -d Ubuntu-22.04` in an elevated PowerShell.

### 6.1 Install base tooling
```bash
# System
sudo apt update && sudo apt install -y git curl build-essential jq

# Docker + Docker Compose (needed for Fabric containers)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out/in
docker --version && docker compose version

# Node.js 20 LTS (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm use 20
node -v   # v20.x

# Go (required to build some Fabric tools; optional if using prebuilt binaries)
sudo apt install -y golang-go
```

### 6.2 Pull Hyperledger Fabric samples + binaries + Docker images
```bash
mkdir -p ~/fabric && cd ~/fabric
# This script downloads fabric-samples, the peer/orderer binaries, and pulls Docker images
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh | bash -s -- --fabric-version 2.5.9 docker samples binary
export PATH=$PATH:~/fabric/fabric-samples/bin
```

### 6.3 PostgreSQL (run as a container — simplest)
```bash
docker run --name ziam-postgres -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=studentportal -p 5432:5432 -d postgres:16
```

---

## 7. Repository / project layout

```
Blockchain_Identity_Verification/
├── IMPLEMENTATION.md                 ← this file
├── docker-compose.yml                ← app stack (backend, frontend, postgres)
├── fabric/                           ← scripts to start test-network & deploy chaincode
│   ├── network-up.sh
│   └── deploy-chaincode.sh
├── chaincode/
│   ├── identity/                     ← IdentityContract (register/verify)
│   │   └── src/identityContract.ts
│   └── audit/                        ← AuditContract (append/read audit events)
│       └── src/auditContract.ts
├── backend/
│   ├── src/
│   │   ├── index.ts                  ← Express app bootstrap
│   │   ├── config/policy.config.ts   ← Zero Trust weights & thresholds
│   │   ├── auth/                      ← login, JWT, MFA (TOTP)
│   │   ├── zerotrust/
│   │   │   ├── pdp.ts                 ← risk scoring engine (Policy Decision Point)
│   │   │   ├── signals.ts            ← signal extractors
│   │   │   └── pep.middleware.ts      ← per-request enforcement
│   │   ├── ledger/
│   │   │   ├── LedgerService.ts       ← interface (both tracks depend on this)
│   │   │   ├── MockLedger.ts          ← Track A: in-code append-only + hashing
│   │   │   └── FabricLedger.ts        ← Track B: fabric-gateway client wrapper
│   │   ├── portal/                    ← courses, fees, results controllers
│   │   ├── audit/verifier.ts          ← on-chain vs off-chain integrity check
│   │   └── db/                        ← Prisma schema & client
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/ (Login, Dashboard, CourseRegistration, FeeStatement, Results)
│   │   ├── lib/telemetry.ts           ← device fingerprint + behavior capture
│   │   └── api/client.ts
│   └── package.json
├── simulation/
│   ├── scenarios.ts                   ← the 5 security scenarios
│   ├── attack-runner.ts               ← drives N legit + N attack requests
│   └── tamper-test.ts                 ← log tampering trial
└── evaluation/
    ├── metrics.ts                     ← TAR/FAR/FRR/AR/audit-integrity calc
    ├── results/                       ← generated CSV/JSON
    └── plots.py                       ← optional charts
```

---

> **Track note:** Phases 1–2 below are **Track B** (Fabric). If you're following the Windows-first strategy, **skip to Phase 3** now and come back here after the app layer works. Build against `MockLedger` in the meantime.

## 8. Phase 1 — Hyperledger Fabric network *(Track B)*

### Step 8.1 — Start the test network with a channel
```bash
cd ~/fabric/fabric-samples/test-network
./network.sh down            # clean any prior run
./network.sh up createChannel -c mychannel -ca
# -ca uses Certificate Authorities (realistic identities); creates 2 orgs + orderer
docker ps                    # you should see peer0.org1, peer0.org2, orderer, CAs
```
This gives you a **real permissioned network**: 2 organizations (model them as *"University IT"* and *"Registrar"*), one channel, an ordering service, and MSP identities issued by CAs.

### Step 8.2 — Wrap it in project scripts
Create `fabric/network-up.sh` that cd's into the sample test-network and runs the above, so your whole project starts with one command. (Keeps the academic story clean: "we deployed a 2-org permissioned Fabric network.")

---

## 9. Phase 2 — Chaincode (smart contracts) *(Track B)*

Two contracts. Written in TypeScript using `fabric-contract-api`. **Their function signatures deliberately mirror the `LedgerService` interface**, so `FabricLedger` is a thin wrapper that forwards calls to these — and dropping it in for `MockLedger` requires no changes elsewhere.

### 9.1 IdentityContract — key functions
```
registerIdentity(studentId, credentialHash, publicKey)
    → stores an immutable identity anchor keyed by studentId
verifyIdentity(studentId, credentialHash) : boolean
    → returns true iff the submitted hash matches the anchored hash
revokeIdentity(studentId)              → marks identity revoked (Zero Trust: instant revocation)
getIdentity(studentId)                 → read anchor (no secrets stored)
```

### 9.2 AuditContract — key functions
```
logAccessEvent(eventId, studentId, resource, decision, riskScore, timestamp, prevHash)
    → appends an immutable audit record; stores a SHA-256 digest of the payload
getAuditEvent(eventId)                 → read one event (used by integrity verifier)
getAuditTrail(studentId)               → range/history query for a student
verifyEventIntegrity(eventId, offchainHash) : boolean
    → compares on-chain digest to the supplied off-chain digest → tamper check
```
Each event stores `hash = SHA256(studentId|resource|decision|riskScore|timestamp)`. Because ledger state is append-only and cryptographically chained, an attacker cannot rewrite history — this is what makes tampering detectable.

### 9.3 Deploy the chaincode
```bash
cd ~/fabric/fabric-samples/test-network
./network.sh deployCC -ccn identity -ccp ../../<repo>/chaincode/identity -ccl typescript -c mychannel
./network.sh deployCC -ccn audit    -ccp ../../<repo>/chaincode/audit    -ccl typescript -c mychannel
```
Put both into `fabric/deploy-chaincode.sh`.

---

## 10. Phase 3 — PostgreSQL database

### 10.1 Schema (Prisma model sketch)
```
Student      { id, studentId (unique), fullName, email, passwordHash, publicKey, mfaSecret, createdAt }
Course       { id, code, title, credits, capacity }
Enrollment   { id, studentId → Student, courseId → Course, semester, status }
FeeStatement { id, studentId → Student, semester, amountDue, amountPaid, balance }
Result       { id, studentId → Student, courseId → Course, semester, grade, score }
Session      { id, studentId, jwtId, deviceFp, ipAddress, createdAt, lastRiskScore, status }
RiskEvent    { id, studentId, sessionId, resource, riskScore, decision, signals(json), createdAt }
AuditMirror  { id, eventId (unique), studentId, resource, decision, riskScore, onchainHash, offchainHash, timestamp }
```
`AuditMirror` is the fast-query copy of on-chain events; it is deliberately **tamperable** so the tamper attack has something to attack, while the ledger stays immutable.

### 10.2 Seed data
Seed ~20–50 students, a course catalogue, fee statements, and results so the demo looks like a real portal. Include at least one "legit" account you control for the demo.

---

## 11. Phase 4 — Node.js backend & Zero Trust policy engine

### Step 11.1 — Auth service
- `POST /auth/login` → verify bcrypt password → on success also call `verifyIdentity()` on-chain → issue JWT (short TTL, e.g. 15 min).
- `POST /auth/mfa/verify` → TOTP check (step-up path).
- Password failures increment a counter → feeds risk.

### Step 11.2 — Policy Decision Point (`pdp.ts`)
Implements Section 4.2. Input: request + signals. Output: `{ decision, riskScore, reasons[] }`.

### Step 11.3 — Policy Enforcement Point middleware (`pep.middleware.ts`)
Runs on **every** protected route:
```
1. validate JWT + session status
2. extract signals (device, ip, time, behavior, resource sensitivity)
3. score = PDP.evaluate(signals)
4. persist RiskEvent (PostgreSQL) + logAccessEvent() (Fabric)  ← audit trail
5. enforce:
      ALLOW           → next()
      STEP_UP         → 401 + require MFA
      DENY            → 403
      TERMINATE       → revoke session, 401, force logout
```

### Step 11.4 — Portal API
`GET /courses`, `POST /enroll`, `GET /fees`, `GET /results` — all behind the PEP. Mark `/fees` and `/results` as **sensitive** (stricter thresholds).

### Step 11.5 — Ledger service (`ledger/`)
The backend depends on the **`LedgerService` interface** only. Selected at startup by an env var:
```
LEDGER=mock    → MockLedger    (Track A — default while developing on Windows)
LEDGER=fabric  → FabricLedger  (Track B — connects via fabric-gateway using an
                                Org1 identity from the test-network crypto material)
```
`MockLedger` stores audit events in an append-only structure (in-memory or a dedicated `ledger_events` Postgres table) with a SHA-256 digest per event and no update/delete path — mimicking Fabric's immutability so the tamper-detection metric works identically. `FabricLedger` forwards the same calls to the chaincode via `submit()`/`evaluate()`. Used by auth, PEP, and the audit verifier — none of which know or care which implementation is active.

### Step 11.6 — Audit integrity verifier (`audit/verifier.ts`)
`GET /admin/audit/verify` → for each `AuditMirror` row, call `verifyEventIntegrity(eventId, row.offchainHash)` on-chain. Any `false` = tampering detected. Returns a report used by the metrics.

---

## 12. Phase 5 — React student portal

Pages (build them to look like a real university portal):

| Page | Content |
|---|---|
| **Login** | studentId + password, then MFA prompt when step-up is triggered |
| **Dashboard** | welcome, current semester, quick links, a live "Security / Trust status" widget showing current risk score (nice for the demo) |
| **Course Registration** | list courses, enroll/drop, capacity checks |
| **Fee Statement** | amount due/paid/balance, downloadable statement (sensitive resource) |
| **Results** | grades per course/semester (sensitive resource) |
| **(Admin/Research view)** | audit trail viewer + "Verify integrity" button + live metrics — for the showcase |

**Telemetry (`lib/telemetry.ts`):** on each request attach a header/body with `deviceFingerprint`, timing, and navigation context so the PDP has signals. Keep it simple (hash of user-agent + screen + timezone + a rolling nav counter).

---

## 13. Phase 6 — Security scenarios & attack simulation harness

Implement all five scenarios as **repeatable, scripted runs** (`simulation/`), each emitting labelled outcomes the metrics script consumes.

| # | Scenario | How to simulate | Expected model behavior | Feeds metric |
|---|---|---|---|---|
| 1 | **Genuine user login** | valid creds, known device, normal time | ALLOW | TAR, FRR |
| 2 | **Invalid credential login** | wrong password / unknown studentId | DENY at auth | FAR, Attack resistance |
| 3 | **Credential stealing & imitation** | replay a stolen valid password from a *new device + new IP + odd time* | risk crosses threshold → STEP_UP then DENY (credential alone insufficient) | FAR, Attack resistance |
| 4 | **Log tampering trial** | directly `UPDATE audit_mirror SET decision=...` in PostgreSQL | integrity verifier flags mismatch vs on-chain | Audit integrity |
| 5 | **Abnormal behavior / continuous verification** | authenticated session suddenly issues rapid, scripted, out-of-pattern requests | mid-session risk rises → TERMINATE_SESSION | Continuous validation (detection time, % sessions terminated) |

`attack-runner.ts` runs, say, 100 legitimate requests and 100 attack requests across scenarios 1–3, records each as `{expected, actual, granted}`; `tamper-test.ts` runs scenario 4 N times; a behavior driver runs scenario 5 N times and timestamps detection.

---

## 14. Phase 7 — Metrics, calculations & evaluation

All formulas below are implemented in `evaluation/metrics.ts`, reading the labelled outputs from `simulation/`.

### (a) Access-control effectiveness
Let:
- `TP` = legitimate requests correctly **granted**
- `FN` = legitimate requests wrongly **rejected**
- `FP` = unauthorized requests wrongly **granted**
- `TN` = unauthorized requests correctly **blocked**

```
True Accept Rate  (TAR) = TP / (TP + FN)          = LegitimateGranted / TotalLegitimateRequests
False Reject Rate (FRR) = FN / (TP + FN)          = LegitimateRejected / TotalLegitimateRequests   (= 1 − TAR)
False Accept Rate (FAR) = FP / (FP + TN)          = UnauthorizedGranted / TotalUnauthorizedRequests
```
*Goal: high TAR, low FAR (low FAR = stronger security), low FRR (usability).*

### (b) Attack resistance
```
Attack Resistance (%) = (Blocked Attacks / Total Attack Attempts) × 100
```

### (c) Continuous-validation effectiveness
```
Mean Anomaly Detection Time = average( t_terminate − t_first_anomaly )   [seconds]
Session Termination Rate (%) = (Sessions terminated after risk detection / Total risky sessions) × 100
```

### (d) Audit (log) integrity
```
Audit Integrity (%) = (Detected Tampering Attempts / Total Tampering Attempts) × 100
```
Because the ledger is immutable, every tamper of the off-chain mirror is detected → expected ≈ 100%. **That result is the point of the research** — demonstrate it empirically rather than asserting it.

### Output
`metrics.ts` writes `evaluation/results/metrics.json` + `metrics.csv` with a confusion matrix and all four metric groups. `plots.py` (optional) renders bar charts (TAR/FAR/FRR, attack resistance, detection time) for the report.

**Example results table (illustrative — fill with your real runs):**

| Metric | Value |
|---|---|
| TAR | 0.98 |
| FAR | 0.02 |
| FRR | 0.02 |
| Attack Resistance | 97% |
| Mean anomaly detection time | 1.4 s |
| Session termination rate | 100% |
| Audit integrity | 100% |

---

## 15. Phase 8 — Deployment & showcasing

### 15.0 Track A — run on Windows (no Docker/Fabric)
While developing, run the three app pieces directly:
```powershell
# 1. Ensure PostgreSQL is running (installed in §6.0)
# 2. Backend  (LEDGER=mock is the default)
cd backend  ; npm install ; npm run seed ; npm run dev      # http://localhost:3000
# 3. Frontend (separate terminal)
cd frontend ; npm install ; npm run dev                     # http://localhost:5173
```
This gives you the **complete working demo** — portal, Zero Trust engine, all 5 scenarios, all 4 metrics — with `MockLedger`. No containers needed.

### 15.1 Track B — full stack with real Fabric (WSL2/Ubuntu)
When ready, run inside WSL2. Services: `postgres`, `backend`, `frontend` via Docker Compose; Fabric runs from the test-network scripts (its own containers). Set `LEDGER=fabric`. Bring-up order:
```bash
# 1. Blockchain
./fabric/network-up.sh
./fabric/deploy-chaincode.sh
# 2. App stack  (backend configured with LEDGER=fabric)
docker compose up -d          # postgres + backend + frontend
# 3. Seed DB + register identities on-chain
docker compose exec backend npm run seed
# 4. Open the portal
#    Frontend:  http://localhost:5173
#    Backend:   http://localhost:3000
```

### 15.2 Health checks
- `GET /health` on backend confirms DB + Fabric gateway connectivity.
- A `make demo` / `npm run demo` target that runs the full simulation and prints the metrics table.

### 15.3 For the showcase
- Run everything on the Ubuntu VM/WSL2.
- Optional: expose the frontend via a reverse proxy (Caddy/Nginx) for a clean URL.
- Prepare the **Research/Admin view** so evaluators can watch audit events appear on-chain live and click "Verify integrity."

---

## 16. Demo script

Walk the audience through this order (≈10 minutes):

1. **Genuine login** → dashboard loads; trust widget shows low risk (Scenario 1). ✅ counts toward TAR.
2. **Invalid login** → blocked at auth (Scenario 2). ✅ FAR/attack resistance.
3. **Stolen-credential imitation** → correct password from a new device/IP → step-up demanded, then denied (Scenario 3). Shows credentials alone aren't enough.
4. **Continuous verification** → during a live session, trigger scripted abnormal behavior → session auto-terminates; show the detection time (Scenario 5).
5. **Audit trail** → open Research view, show the on-chain events for all the above.
6. **Log tampering** → run the SQL that edits the off-chain mirror → click **Verify integrity** → system flags the tampering because the ledger disagrees (Scenario 4).
7. **Metrics** → run `npm run demo`; show the metrics table + charts proving all four evaluation objectives.

---

## 17. Effort & time estimate

Assuming **one competent full-stack developer with some blockchain familiarity**. Ranges reflect "smooth" → "with the usual Fabric/tooling friction."

| Track | Phase | Work | Hours |
|---|---|---|---|
| A | 0 | Windows setup (Node + PostgreSQL only) | 1 – 2 |
| A | A1 | Scaffold + `LedgerService` interface + `MockLedger` | 4 – 7 |
| A | 3 | PostgreSQL schema, Prisma, seed data | 4 – 7 |
| A | 4 | Backend: auth + JWT + MFA, portal API | 10 – 14 |
| A | 4b | Zero Trust PDP/PEP risk engine + continuous verification | 12 – 18 |
| A | 5 | React portal: 5 pages + telemetry + admin/research view | 16 – 24 |
| A | 6 | Security scenarios + attack/tamper simulation harness | 10 – 14 |
| A | 7 | Metrics engine + charts + results | 6 – 10 |
| — | — | *Track A integration, debugging, demo dry-run* | 8 – 12 |
| **A subtotal** | | **Working demo on Windows (MockLedger)** | **~71 – 108** |
| B | 6.1 | WSL2 + Docker + Fabric setup | 4 – 8 |
| B | 1 | Fabric test-network up + scripted | 3 – 6 |
| B | 2 | Chaincode: Identity + Audit contracts, deploy, unit test | 10 – 16 |
| B | 4c | `FabricLedger` implementation + flip `LEDGER=fabric` | 4 – 8 |
| B | 8 | Dockerization, re-run metrics on Fabric, demo polish | 6 – 10 |
| **B subtotal** | | **Real Fabric + final reported results** | **~27 – 48** |
| **Total** | | | **~98 – 156 hours** |

**Practical read:**
- **Track A alone** gives you a **fully demo-able prototype on Windows** (~71–108 h ≈ 2–3 weeks) — every scenario and metric works against `MockLedger`. You can present this if the timeline is tight.
- **Track A + B** adds real Hyperledger Fabric and produces the **final reported results** for the thesis (~98–156 h total ≈ 3–4 weeks).
- The two-track split de-risks the schedule: you have a working, showable system early (end of Track A) instead of being blocked on Fabric setup up front.
- Biggest time risks: first-time Fabric setup (Track B) and the continuous-verification logic (Track A). Using the `fabric-samples` test-network + the `LedgerService` abstraction is what keeps both from ballooning.

*Note:* the `MockLedger` is a **development stand-in, not a substitute for Fabric** in the final results — Track B still runs everything on real Fabric. Keep Fabric; the mock just lets you build fast and de-risk before you touch it.

---

## 18. Risks, limitations & academic framing

Be upfront about these in the write-up (examiners respect it):

- **Prototype scale.** 2-org test-network on one host is a functional, not production, deployment. State this explicitly.
- **Simulated signals.** Device fingerprint and "behavior" are simplified. That's appropriate for a controlled evaluation and makes metrics reproducible; note it as a limitation and future work (real behavioral biometrics / ML risk scoring).
- **Rule-based risk engine.** Chosen for transparency/reproducibility over a black-box model. Frame this as a deliberate methodological choice.
- **Threat model.** Clearly scope which attacks are in-scope (credential theft, log tampering, abnormal behavior) vs out-of-scope (network-layer, DoS, insider chaincode compromise).
- **Metrics are dataset-dependent.** TAR/FAR/FRR depend on your simulated request mix — report the counts (N legit, N attack) alongside the rates.

**Ethics/authorization:** this is a self-contained research prototype with synthetic data on your own machine — no real student data, no third-party systems. Keep it that way.

---

## 19. Deliverables checklist

**Track A — Windows (`MockLedger`):**
- [ ] Project scaffold with `LedgerService` interface + `MockLedger` (append-only + hashing)
- [ ] PostgreSQL with schema + seed data
- [ ] Node.js backend with JWT auth, MFA, and Zero Trust PDP/PEP (continuous verification)
- [ ] React student portal: Login, Dashboard, Course Registration, Fee Statement, Results, + Research/Admin view
- [ ] All 5 security scenarios scripted and reproducible
- [ ] Metrics engine computing TAR, FAR, FRR, Attack Resistance, detection time, termination rate, Audit Integrity
- [ ] Working end-to-end demo on Windows with results (CSV/JSON) + charts

**Track B — WSL2/Ubuntu (real Fabric):**
- [ ] Running Hyperledger Fabric network (2 orgs, 1 channel) with two deployed chaincodes
- [ ] `FabricLedger` implementation; backend flipped to `LEDGER=fabric` writing immutable audit events on every access decision
- [ ] `docker compose up` + `network-up.sh` one-command deployment
- [ ] Scenarios + metrics re-run on real Fabric → **final reported results**

**Both:**
- [ ] Demo script + (optional) recorded walkthrough
- [ ] Limitations & threat-model section for the thesis

---

### Suggested build order (dependency-aware, two-track)

**Track A (Windows, `MockLedger`):**
`Windows setup (Node+Postgres) → Scaffold + LedgerService/MockLedger → Postgres schema+seed → Backend auth+API → PDP/PEP + continuous verification → React portal → Simulation harness → Metrics → Track A demo dry-run`

**Track B (WSL2/Ubuntu, real Fabric):**
`WSL2+Docker+Fabric setup → Fabric network up → Chaincode → FabricLedger + flip LEDGER=fabric → re-run scenarios+metrics → Dockerize/deploy → final demo`

> Start each phase only when the previous one is verifiable in isolation. In Track A, keep the `LedgerService` interface stable from day one so Track B slots in cleanly. In Track B, `invoke` chaincode from the CLI before wiring it into `FabricLedger` — keeps debugging localized, which is critical with Fabric.
