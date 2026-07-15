# Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals

A research prototype: a university student portal secured by a Zero Trust access model, with
identity anchoring and an immutable audit trail on a permissioned Hyperledger Fabric blockchain.

**Security challenges addressed:** credential compromise, data adulteration, lateral movement.

> **Status: the Zero Trust engine is live and enforcing, and the evaluation pipeline is built.**
> Every login and every protected request is risk-scored (device, network, time, session age,
> request rate, resource sensitivity) and enforced — ALLOW / STEP_UP (TOTP MFA) / DENY /
> TERMINATE. A background monitor can also end a session with no new request. Every decision is
> written through a ledger abstraction and mirrored to PostgreSQL with a tamper-detection check
> that's been proven to actually catch tampering, not just typecheck.
> The full React portal (Phase 7) is done, and so are the **scripted attack scenarios (Phase 8),
> the metrics + CES engine (Phase 9), and the chaincode source (Phase 5)** — all built and tested
> on Windows against the mock ledger. What does **not** exist yet: the real running Hyperledger
> Fabric network (the engine still runs on an in-memory mock behind the same interface) and the
> connection to it. That final leg — standing up the network, deploying the chaincode, and wiring
> `FabricLedger` — is the deliberate "shift to Ubuntu" step, since Fabric needs Linux + Docker.
> See [Current status](#current-status) for the full breakdown.

## Documents

| Document | What it is |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | The original client brief, verbatim. |
| [ROADMAP.md](ROADMAP.md) | **The authoritative build plan (client-approved, 2026-07-10).** 9 phases, Fabric-first. |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Earlier internal plan. Superseded by ROADMAP.md wherever the two disagree. |

## Current status

| Phase | Status | What actually exists |
|---|---|---|
| 1 — Environment setup | ❌ Not started | Node 20+ and PostgreSQL are running. No Ubuntu/WSL2, Docker, or Fabric 2.5 binaries. **This blocks Phases 4–5.** |
| 2 — Scaffold + ledger interface | ✅ Done | `LedgerService` interface (8 methods), a working hash-chained `MockLedger`, and a `FabricLedger` stub behind the same interface. |
| 3 — PostgreSQL | ✅ Done | Schema extended with `RiskEvent`, `AuditMirror`, `Device`, `KnownNetwork` for the engine. Seed now produces **30 students** (1 hand-authored + 29 generated) — meets the Phase 8/9 population target early. |
| 4 — Fabric network | ❌ Not started | Blocked by Phase 1. |
| 5 — Chaincode | 🟡 Source done, not deployed | `backend/chaincode/` has `IdentityContract` + `AuditContract` (Node.js, `fabric-contract-api`), append-only + hash-chained, with `hashEvent.js` kept byte-identical to the backend's and a 26-check offline test suite (`npm test`). **Not deployed** — chaincode only runs on a live peer, which needs the Phase 4 network. |
| 6 — Backend + Zero Trust engine | ✅ **Done** | PDP risk engine, PEP middleware on every protected route, TOTP step-up MFA, an on-chain identity-anchor check at login (independent of the password — enables real revocation), a continuous background monitor, and the audit integrity verifier endpoint. All tested live, not just typechecked. |
| 7 — React portal | ✅ **Done** | Login **with MFA built into the sign-in flow itself** (two-step: password, then TOTP only if the engine flags the device/network — no jarring dialog after the fact), Dashboard, Course Registration, Fee Statement, Results, and the Admin/Research view (audit trail, Verify Integrity button, live metrics). Real per-request client telemetry (locale, timezone, screen, hardware concurrency) collected in the browser and folded into the device-fingerprint signal server-side. All tested live in a browser, not just typechecked. |
| 8 — Attack scenarios | ✅ **Done** | `backend/simulation/` scripts all five scenarios (genuine login, invalid credentials, credential theft, log tampering, abnormal behaviour), driving the **real backend over HTTP** and emitting labelled outcomes to a JSON report. Run with `npm run sim`. |
| 9 — Metrics & evaluation | ✅ **Done** | `backend/evaluation/` computes TAR/FAR/FRR, attack resistance %, continuous validation, audit integrity, and the **CES** from Phase 8's labelled report, exporting JSON + CSV + a self-contained HTML chart. Run with `npm run evaluate`. (The Admin view still computes the continuous-validation metrics live from real traffic.) One caveat: the CES "Authentication Performance" component is still undefined in the brief, so it's computed *provisionally* and CES is reported both with and without it. |

## Repository structure

Two top-level folders. (ROADMAP.md Phase 2 originally specified five — `chaincode`, `simulation`
and `evaluation` were nested under `backend/` at the client's request. See the deviation note in
[ROADMAP.md](ROADMAP.md).)

```
backend/
├── src/           Express + TypeScript: auth, portal API, Zero Trust engine, ledger client
├── prisma/        PostgreSQL schema, migrations, seed
├── chaincode/     Hyperledger Fabric smart contracts (IdentityContract, AuditContract) [source + tests; deploy on Ubuntu]
├── simulation/    The 5 scripted attack/usage scenarios  →  labelled report           [built · npm run sim]
└── evaluation/    Metrics engine: TAR/FAR/FRR, attack resistance, CES  →  JSON/CSV/HTML [built · npm run evaluate]
frontend/          React + Vite + TypeScript + Tailwind student portal. Talks to the API.
```

`chaincode/` sits inside `backend/` for convenience, but it is **not** backend code — it is
deployed to and executed by the Fabric peers, not the Express server, and keeps its own
`package.json`.

## What has been built

### The Zero Trust engine (`backend/src/zerotrust/`)

Every login and every request to `/api/courses`, `/api/enrollments`, `/api/fees`, `/api/results`
is scored by the **PDP** (`pdp.ts`) against six live signals — new device, new network, odd hour,
stale session, high request rate, sensitive resource — weighted and thresholded in
`config/policy.config.ts`. The **PEP** (`pep.middleware.ts`) enforces the result: `ALLOW` passes
through, `STEP_UP` blocks with `403` until a TOTP code is verified (`POST /api/auth/step-up`),
`DENY` blocks the request outright, `TERMINATE` revokes the session. A background monitor
(`continuousMonitor.ts`) re-scores active sessions on an interval and can terminate one with no
new request — the "no new user action" half of continuous verification.

**Identity anchoring** (`identity.ts`) is a second, independent gate on top of the password: login
verifies (and anchors, on first use) an identity on the ledger via `LedgerService.verifyIdentity`.
A revoked anchor blocks login even with the correct password — something bcrypt alone can never
provide.

Every decision — good or bad — is written through `LedgerService` and mirrored to PostgreSQL
(`RiskEvent`, `AuditMirror`). The tamper-detection check (`GET /api/admin/audit/verify/:eventId`)
recomputes the mirror's hash from its *current* data and compares it to the immutable on-chain
hash — proven to work by directly editing a database row and watching the check catch it.

### The Admin / Research view (`frontend/src/pages/Admin.tsx`)

Reachable via **Research View** in the nav, open to any signed-in student (there is no separate
admin role in the data model — this is a research-transparency view, not a locked-down console).
Shows the access-decision distribution, session/termination stats, mean anomaly detection time
computed from real data, the full audit trail (searchable by student, newest first), and a
**Verify Integrity** button per record.

### The portal (unchanged from before, still real)

Sign in → dashboard → register/drop courses → fees → results → sign out, all backed by
PostgreSQL. Enrolment is transactional: seat availability and the 24-credit cap are re-checked
*inside* the transaction. GPA, credit totals, and course status are derived on every read, never
stored, so they cannot drift.

### The ledger abstraction (`backend/src/ledger/`)

Still the key design decision: a single `LedgerService` interface (8 methods) the backend talks
to instead of Fabric directly. `FabricLedger` implements the same interface and currently throws
`"implement in ROADMAP Phases 4–5"` — when the real network exists, nothing above this interface
needs to change.

`MockLedger` is the stand-in until then, and it imitates the ledger's guarantees rather than
merely asserting them:

- **Durable.** Backed by dedicated PostgreSQL tables (`LedgerIdentity`, `LedgerAuditRecord`).
  An earlier version held the chain in a JS array, so **every process restart silently erased
  the entire audit trail and every identity anchor.** An "immutable audit trail" that does not
  survive a restart demonstrates nothing — this was a real bug, found and fixed.
- **Append-only.** There is no update or delete path for audit records anywhere in the class.
- **Hash-chained,** with appends serialised by a transaction-scoped Postgres advisory lock. This
  is not ceremonial: one dashboard load fires four API calls in parallel, each logging a
  decision, so without it two appends can read the same chain tail and both link to it — forking
  the chain and corrupting every verification after that point.

## Design decisions locked in

**On-chain vs off-chain — the golden rule: never put raw credentials or PII on the ledger.**

| Data | Location |
|---|---|
| Raw password | Nowhere (bcrypt hash in PostgreSQL only) |
| Student PII, courses, fees, results | PostgreSQL |
| Identity anchor (hash + public key) | Fabric — `IdentityContract` |
| Every access decision + verification event | Fabric — `AuditContract` |
| Audit mirror for dashboards/queries | PostgreSQL |

**Tamper detection:** each audit event is written on-chain *and* mirrored to PostgreSQL. The
tampering scenario edits the PostgreSQL copy; the integrity verifier re-reads the on-chain
record and compares hashes. A mismatch means tampering. The ledger cannot be altered, so
tampering is always caught. **This has been tested against a real tampered record, not assumed.**

**Zero Trust decision policy** (thresholds live in `backend/src/config/policy.config.ts`
so their effect on the metrics can be demonstrated):

| Risk score | Decision |
|---|---|
| under 30 | `ALLOW` |
| 30–59 | `STEP_UP` (MFA / re-verify identity on-chain) |
| 60–84 | `DENY` |
| 85+ | `TERMINATE` |

**The dependency chain** the whole project rests on: chaincode gives us an unforgeable ledger →
the backend uses it to make and record Zero Trust decisions → `simulation/` stress-tests those
decisions → `evaluation/` scores them. The backend, simulation and evaluation ends of that chain
are now real and tested (against the mock ledger); the chaincode is written and unit-tested but
not yet deployed. Only the live Fabric-network end (Phases 1 + 4 + wiring `FabricLedger`) remains.

## Verifying the engine yourself

Don't take the claims above on trust — the engine ships with an end-to-end test suite that
drives the **real running backend over HTTP** (no mocks, no internal shortcuts) and asserts
every property the roadmap claims. It exits non-zero if any check fails.

```bash
cd backend
npm run dev        # terminal 1
npm run test:e2e   # terminal 2  (~1 min: it waits for a real background-monitor tick)
```

27 checks, covering: an unrecognized device demands MFA · protected data is unreachable until
step-up is satisfied · a wrong code is rejected but retryable · **abandoning step-up does not
whitelist the device** · a correct code grants access · a proven device is remembered · **a
stolen password from a new device is still challenged** · invalid credentials are refused ·
every decision reaches the ledger, correctly hash-chained · **tampering with the off-chain copy
is detected** · **a revoked identity cannot log in even with the right password** · **a hijacked
session is terminated mid-flight by the background monitor, with no new request from the user**.

The bolded ones are properties that regressed or were missing at some point during development
and were caught here. That is what the suite is for.

### Running the evaluation pipeline (Phases 8–9)

With the backend running, generate labelled attack-vs-legitimate traffic and score it:

```bash
cd backend
npm run sim        # terminal 2 — runs the 5 scenarios, writes simulation/results/simulation-latest.json
                   #              add `-- --quick` for a fast smoke run
npm run evaluate   # computes TAR/FAR/FRR, attack resistance, CES → evaluation/results/ (JSON, CSV, HTML)
```

Open `backend/evaluation/results/metrics-latest.html` for the chart (confusion matrix, metric
bars, CES gauge). A healthy run reports TAR 1.0 · FAR 0 · FRR 0 · attack resistance 100% · audit
integrity 100% · session termination 100% · **CES 100/100** (excluding the still-undefined
Authentication Performance component). The chaincode has its own offline tests too:

```bash
cd backend/chaincode
npm install && npm test   # 26 checks: append-only, hash-chaining, tamper detection, identity semantics
```

## Running it

Prerequisites: **Node 20+** and a running **PostgreSQL 16+** with a database named `blockchain`.

**Backend** — first run:

```bash
cd backend
npm install
cp .env.example .env      # then set DATABASE_URL and JWT_SECRET
npm run db:migrate        # create the tables
npm run db:seed           # load the 30 students, courses, fees, results (prints the hero's TOTP secret)
npm run dev               # http://localhost:3000
```

**Interactive API docs: [http://localhost:3000/docs](http://localhost:3000/docs)** (Swagger UI —
log in, click *Authorize*, and call any endpoint from the browser).

Percent-encode reserved characters in the DB password (`@` → `%40`) or the URL will not parse.
Useful extras: `npm run db:studio` (browse the data), `npm run db:reset` (wipe + re-seed — this
also generates fresh TOTP secrets, invalidating any authenticator app entries from before).

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (or the next free port)
```

**Sign in** with `SU/CS/2023/0187` / `demo1234`. If the engine flags the login (new device/
network — likely on first use), it'll ask for a TOTP code: fetch the account's secret via
`GET /api/auth/mfa-secret` while signed in, and either scan it into an authenticator app or
compute a code with `otplib` directly. This convenience endpoint is prototype-only — see the
comment on it in `auth.routes.ts`.

## Built: chaincode, simulation, evaluation

All three directories now hold working code (chaincode is written and unit-tested; deployment
awaits the Ubuntu/Fabric step). Each has its own README with details.

- **`backend/chaincode/`** (Phase 5) — Node.js chaincode (`fabric-contract-api`). `IdentityContract`
  (`registerIdentity`, `verifyIdentity`, `revokeIdentity`, `getIdentity`) and `AuditContract`
  (`logAccessEvent`, `getAuditEvent`, `getAuditTrail`, `verifyEventIntegrity`; append-only,
  hash-chained). The signatures deliberately mirror `LedgerService` so `FabricLedger` stays a thin
  wrapper. `lib/hashEvent.js` is kept byte-identical to the backend's `src/ledger/hashEvent.ts`
  (the invariant tamper detection depends on), and `npm test` runs 26 offline checks covering
  append-only enforcement, hash-chaining, tamper detection and the identity semantics. **Not yet
  deployed** — chaincode only executes on a live Fabric peer.
- **`backend/simulation/`** (Phase 8) — the five required scenarios, each driving the real backend
  over HTTP and emitting labelled outcomes: genuine login (→ ALLOW), invalid credentials (→ DENY),
  credential theft & imitation (→ STEP_UP then blocked), log tampering (→ integrity verifier flags
  the mismatch), and abnormal behaviour (→ mid-session TERMINATE). `npm run sim` writes a labelled
  JSON report; scenario counts are configurable via env vars.
- **`backend/evaluation/`** (Phase 9) — computes TAR / FRR / FAR, attack resistance %, mean anomaly
  detection time, session termination rate, audit integrity %, and the client's **Composite
  Effectiveness Score**:
  `CES = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthenticationPerformance`.
  `npm run evaluate` reads Phase 8's report and outputs JSON + CSV + a self-contained HTML chart.
  Because "Authentication Performance" is undefined in the brief (see Open items), it is computed
  provisionally and CES is reported both including and excluding that 10% component.

## Open items

1. **The live blockchain is the only remaining leg — and it needs Linux.** All Windows-authorable
   work is done; what's left is the deliberate Ubuntu port: WSL2 + Docker + the Fabric 2.5
   test-network (Phases 1 + 4), deploying the already-written chaincode onto it, then filling in
   `FabricLedger.ts` against `@hyperledger/fabric-gateway` and setting `LEDGER=fabric`. Everything
   above the `LedgerService` interface — the engine, the audit trail, the simulation, the metrics —
   runs unchanged once that flip happens.
2. **"Authentication Performance" is still undefined.** It carries 10% of the CES weight but was
   never specified in the brief. Phase 9 computes it *provisionally* (`1 − meanLoginLatency/budget`,
   budget 1500 ms) and reports CES both with and without it, so nothing is overstated — but a
   concrete definition from the client is needed to finalize the single headline CES.
3. **No admin/role model.** The Admin/Research view is reachable by any signed-in student — there
   is no staff/researcher account type in the schema. Fine for a research demo; would need a real
   role system to restrict.
4. **Phase 8/9 results run against the mock ledger, not Fabric yet.** The scenarios and metrics are
   complete and produce real numbers, but on `MockLedger`. Because the metric definitions are
   ledger-agnostic, the identical `npm run sim` / `npm run evaluate` reproduce against the real
   blockchain once the Ubuntu port lands — no scenario or metric changes needed.

### Security note

An earlier commit put a **real PostgreSQL password in `backend/.env.example`**, which is tracked
by git. It has been replaced with a placeholder, but **it is still in the git history** — treat
that password as compromised and rotate it. Real secrets belong in `backend/.env`, which is
gitignored.

## Scope & ethics

Prototype scale: a 2-org Fabric test-network on a single host (once Phase 4 exists) — functional,
not production. Device and behaviour signals are derived server-side from request headers, not a
dedicated client-side fingerprinting library. The risk engine is rule-based (chosen for
reproducibility over a black box). **In scope:** credential theft, log tampering, abnormal
behaviour. **Out of scope:** network-layer attacks, DoS, insider chaincode compromise.
Synthetic data only — no real student data or third-party systems.
