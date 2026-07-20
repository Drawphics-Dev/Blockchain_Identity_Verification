# Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals

A research prototype: a university student portal secured by a Zero Trust access model, with
identity anchoring and an immutable audit trail on a permissioned Hyperledger Fabric blockchain.

**Security challenges addressed:** credential compromise, data adulteration, lateral movement.

> **Status: all nine roadmap phases are complete and running on a live Hyperledger Fabric 2.5
> network.** Every login and every protected request is risk-scored against all seven signals the
> roadmap specifies (device fingerprint, IP, geovelocity, time of day, behaviour rate + navigation
> sequence, session age, resource sensitivity) and enforced — ALLOW / STEP_UP (TOTP MFA) / DENY /
> TERMINATE. A background monitor can end a session with no new request. Every decision is written
> to the blockchain and mirrored to PostgreSQL, with tamper detection proven against real altered
> records. Six attack scenarios and the metrics + CES engine complete the evaluation.
>
> **One item needs the client:** ROADMAP §7 Table 1 gives "Authentication Performance" a 10% weight
> but never defines it. It is scored against published HCI thresholds and flagged provisional; CES
> is reported both with and without it. See [Current status](#current-status).

## Quick start

**Docker Desktop (running) and Node 20+ are the only prerequisites.** PostgreSQL is containerised
for you; nothing else to install.

```bash
git clone <this-repo> && cd Blockchain_Identity_Verification
./scripts/start.sh --mock       # everything except the blockchain — ready in about a minute
```

To run the real Hyperledger Fabric stack you also need `fabric-samples`
(**inside WSL2 on Windows** — see [Installing Fabric](#installing-fabric-for-the-blockchain-path)):

```bash
./scripts/start.sh --fabric     # ...plus the Fabric network + chaincode deployment
```

Portal at http://localhost:5173 — sign in as `SU/CS/2023/0187` / `demo1234`, or
`SU/IT/ADMIN/001` / `demo1234` for the Admin/Research view. `Ctrl-C` stops the servers;
`./scripts/stop.sh` stops the database.

Full setup, tests and troubleshooting: [Running it](#running-it).

## Documents

| Document | What it is |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | The original client brief, verbatim. |
| [ROADMAP.md](ROADMAP.md) | **The authoritative build plan (client-approved, 2026-07-10).** 9 phases, Fabric-first. |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Earlier internal plan. Superseded by ROADMAP.md wherever the two disagree. |

## Current status

| Phase | Status | What actually exists |
|---|---|---|
| 1 — Environment setup | ✅ Done | WSL2 + Docker + the Fabric 2.5 toolchain. PostgreSQL is now containerised (`docker-compose.yml`), so no local install is required. |
| 2 — Scaffold + ledger interface | ✅ Done | `LedgerService` interface (8 methods) with two implementations behind it: `FabricLedger` (live) and a hash-chained `MockLedger` for development without a blockchain. |
| 3 — PostgreSQL | ✅ Done | Schema extended with `RiskEvent`, `AuditMirror`, `Device`, `KnownNetwork` for the engine. Seed produces **30 students** (1 hand-authored + 29 generated) plus 1 administrator. |
| 4 — Fabric network | ✅ **Done** | 2 orgs (University IT, Registrar), 1 channel, orderer, CA-issued identities. `scripts/fabric-up.sh` starts the network, deploys the chaincode and copies the gateway credentials in one command. |
| 5 — Chaincode | ✅ **Done** | `backend/chaincode/` — `IdentityContract` + `AuditContract`, append-only and hash-chained, **deployed to both org peers and endorsed by both**. `hashEvent.js` is kept byte-identical to the backend's; 26-check offline suite (`npm test`) plus 22 live ledger checks (`npm run test:fabric`). |
| 6 — Backend + Zero Trust engine | ✅ **Done** | PDP risk engine implementing **all seven** ROADMAP §4.1 signals (incl. geovelocity and navigation-sequence), PEP middleware on every protected route, TOTP step-up MFA, an on-chain identity-anchor check at login (independent of the password — enables real revocation), a continuous background monitor, the audit integrity verifier, and an admin-only on-chain identity revocation endpoint. All tested live, not just typechecked. |
| 7 — React portal | ✅ **Done** | Login **with MFA built into the sign-in flow itself** (two-step: password, then TOTP only if the engine flags the device/network — no jarring dialog after the fact), Dashboard, Course Registration, Fee Statement, Results, and the Admin/Research view (audit trail, Verify Integrity button, live metrics). Real per-request client telemetry (locale, timezone, screen, hardware concurrency) collected in the browser and folded into the device-fingerprint signal server-side. All tested live in a browser, not just typechecked. |
| 8 — Attack scenarios | ✅ **Done** | `backend/simulation/` scripts **six** scenarios — the five the roadmap requires (genuine login, invalid credentials, credential theft, log tampering, abnormal behaviour) plus **lateral movement**, which §1 names as a security challenge but the original five never exercised. All drive the **real backend over HTTP** and emit labelled outcomes to a JSON report. Run with `npm run sim`. |
| 9 — Metrics & evaluation | ✅ **Done** | `backend/evaluation/` computes TAR/FAR/FRR, attack resistance %, continuous validation, audit integrity, and the **CES** from Phase 8's labelled report, exporting JSON + CSV + a self-contained HTML dashboard, with sample sizes reported alongside every rate (ROADMAP §8). Run with `npm run evaluate`. Deployment packaging is `scripts/start.sh`. One caveat: "Authentication Performance" is undefined in the brief, so it is scored against published HCI thresholds, flagged *provisional*, and CES is reported both with and without it. |

## Repository structure

Two top-level folders. (ROADMAP.md Phase 2 originally specified five — `chaincode`, `simulation`
and `evaluation` were nested under `backend/` at the client's request. See the deviation note in
[ROADMAP.md](ROADMAP.md).)

```
backend/
├── src/           Express + TypeScript: auth, portal API, Zero Trust engine, ledger client
├── prisma/        PostgreSQL schema, migrations, seed
├── chaincode/     Hyperledger Fabric smart contracts (IdentityContract, AuditContract) [deployed · npm test]
├── simulation/    The 6 scripted attack/usage scenarios  →  labelled report           [built · npm run sim]
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
reads the anchor with `LedgerService.getIdentity` (anchoring it on first use) and compares it to a
hash recomputed from the stored credential. Two failures are reported separately because they mean
different things — `identity_revoked` (an administrative act) and `identity_mismatch` (the stored
hash no longer agrees with the anchor, i.e. the database was tampered with). Either blocks login
even with the correct password, which bcrypt alone can never provide.

Every decision — good or bad — is written through `LedgerService` and mirrored to PostgreSQL
(`RiskEvent`, `AuditMirror`). The tamper-detection check (`GET /api/admin/audit/verify/:eventId`)
recomputes the mirror's hash from its *current* data and compares it to the immutable on-chain
hash — proven to work by directly editing a database row and watching the check catch it.

### The Admin / Research view (`frontend/src/pages/Admin.tsx`)

Reachable via **Research View** in the nav, and restricted to accounts with `role = ADMIN`
(`requireAdmin` on the server; `AdminRoute` mirrors it in the UI). Students and staff are disjoint
— neither is a super-user, and the audit trail names every student, so it is the one resource a
student must not be able to read about anyone else.
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
decisions → `evaluation/` scores them. **Every link is now live and measured**: the chaincode is
deployed to and endorsed by both peers, the backend runs against it (`LEDGER=fabric`), and the
published figures come from six scenarios driven over HTTP against that network — 22/22 ledger
checks, 37/37 end-to-end, 26/26 chaincode.

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

Everything below assumes a **fresh machine with nothing installed but Docker and Node**. There are
two paths: run without a blockchain in about a minute, or run the full Fabric stack.

### Prerequisites

| | Needed for | Notes |
|---|---|---|
| **Docker Desktop** | both paths | Must be *running*, not just installed. On Windows, use the WSL2 backend. |
| **Node.js 20+** | both paths | `node -v` must report v20 or newer. |
| **Git Bash** *(Windows only)* | both paths | The scripts are bash. Ships with Git for Windows. |
| **WSL2 + fabric-samples** | Fabric path only | See [Installing Fabric](#installing-fabric-for-the-blockchain-path) below. |

You do **not** need to install PostgreSQL — it runs in a container the scripts manage.

### Path A — run it now, no blockchain

```bash
git clone <this-repo>
cd Blockchain_Identity_Verification
./scripts/start.sh --mock
```

That is the whole setup. On first run it installs dependencies, generates `backend/.env` with a
random JWT secret, starts PostgreSQL in Docker, applies migrations, seeds 30 students + 1
administrator, and starts both servers.

The Zero Trust engine, the portal, the six attack scenarios and the metrics all work on this path.
The only difference is that the ledger is `MockLedger` (PostgreSQL-backed, still append-only and
hash-chained) rather than a real blockchain.

### Path B — the full Hyperledger Fabric stack

```bash
./scripts/start.sh --fabric
```

This additionally starts the 2-org Fabric network, deploys both chaincodes, and copies the gateway
credentials into place. It **reuses** a network that is already running; add `--recreate` to tear
one down and start a fresh chain (**this destroys the ledger — every identity anchor and audit
record**).

On Windows, if `fabric-samples` lives inside WSL, the script detects that and hands off to WSL
automatically. You do not need to do anything special.

### What you get either way

| | |
|---|---|
| **Portal** | http://localhost:5173 |
| **API + Swagger UI** | http://localhost:3000 · http://localhost:3000/docs |
| **PostgreSQL** | localhost:**55432** (containerised — see note below) |
| **Student login** | `SU/CS/2023/0187` / `demo1234` |
| **Admin login** | `SU/IT/ADMIN/001` / `demo1234` |

`Ctrl-C` stops the backend and frontend. `./scripts/stop.sh` stops PostgreSQL
(`--purge` also deletes its data; `--fabric` also tears down the network).

> **Why port 55432?** Machines that have run this project usually already have PostgreSQL on 5432.
> On Windows, Docker will happily publish onto the same port rather than refusing to bind, and the
> host then resolves `localhost:5432` to whichever bound first — so the stack silently connects to
> the wrong database. Publishing somewhere unoccupied keeps it self-contained. If `backend/.env`
> already points elsewhere, `start.sh` tells you instead of starting a container nobody uses.

### First sign-in: the QR code

A student's **first** login trips `newDevice` + `newIpAddress` (50 → `STEP_UP`), so the portal runs
MFA enrollment and shows a QR code — but only after you supply that student's **enrollment token**,
which `npm run db:seed` prints. A correct password deliberately is *not* enough to bind an
authenticator, or whoever signs in first (including a password thief) would own the second factor.

Scan it with any authenticator app, enter the 6-digit code, and that device is trusted from then on
— later logins from the same machine go straight through.

### Installing Fabric (for the blockchain path)

Only needed for Path B. Fabric's tooling is Linux — on Windows install it **inside WSL2**, not on
the Windows filesystem.

```bash
# in WSL2 (Ubuntu 22.04) or on Linux, from your home directory:
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.9 docker samples binary
```

That creates `~/fabric-samples`. The scripts look there by default; point elsewhere with:

```bash
FABRIC_SAMPLES=/path/to/fabric-samples ./scripts/start.sh --fabric
```

Verify it worked: `cd backend && npm run test:fabric` should report **22/22 passed** (stop the
backend first — see below).

### Running the tests

```bash
cd backend
npm run typecheck                        # all TypeScript, incl. simulation/evaluation/tests
npm test --prefix chaincode              # 26 smart-contract checks (offline, no network needed)
npm run test:e2e                         # 37 end-to-end checks — backend must be RUNNING
npm run test:fabric                      # 22 ledger checks — backend must be STOPPED (see below)
npm run sim && npm run evaluate          # the 6 scenarios, then the metrics + CES
```

Results land in `backend/evaluation/results/` — open **`metrics-latest.html`** for the dashboard.

> **`test:fabric` needs the backend stopped.** It writes to the ledger directly, so a running
> backend appends to the same chain from a different process. Both contend for the chain's single
> tail and one fails with `MVCC_READ_CONFLICT`. That is inherent to a hash-chained log, not a
> defect — and it is the same pressure behind the Merkle-anchoring recommendation. `test:e2e` and
> `npm run sim` are unaffected: they drive the backend over HTTP, so all writes go through one
> process.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Docker is installed but not running` | Start Docker Desktop and wait for it to report ready. |
| `Fabric test-network not found` | Install fabric-samples (above), or set `FABRIC_SAMPLES`. |
| `503 ledger_unavailable` | The Fabric peer is unreachable. `docker ps` should list `peer0.org1`, `peer0.org2`, `orderer`. Re-run `./scripts/fabric-up.sh`. |
| `identity_mismatch` on every login | The database was re-seeded while on Fabric — the on-chain anchors still commit to the old password hashes. See the warning below. |
| Login refused with `access_denied` | The engine blocked it on risk. The response lists which signals fired. |
| Port already in use | Something else holds 3000/5173/55432. Stop it, or change `PORT` in `backend/.env`. |

> ⚠️ **Never re-seed while running on Fabric.** `npm run db:seed` regenerates every password hash,
> but on-chain identity anchors commit to the *old* hashes and cannot be deleted — every student is
> then locked out permanently with `identity_mismatch`. `scripts/start.sh` refuses to do this
> silently, but do not run the seed by hand on a Fabric deployment. On `--mock` it is safe.

### Manual setup (if you prefer not to use the scripts)

```bash
cd backend
npm install
cp .env.example .env      # set DATABASE_URL and JWT_SECRET yourself
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:3000

cd ../frontend && npm install && npm run dev   # http://localhost:5173
```

This needs your own PostgreSQL 16+ with a database named `blockchain`. Percent-encode reserved
characters in the password (`@` → `%40`) or the URL will not parse. Useful extras:
`npm run db:studio` (browse the data), `npm run db:reset` (wipe + re-seed — mock only).

## Built: chaincode, simulation, evaluation

All three directories hold working code, and the chaincode is deployed to the live network. Each
has its own README with details.

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

1. **"Authentication Performance" needs a definition from the client — this is the only open
   blocker.** ROADMAP §7 Table 1 gives it 10% of the CES weight but, unlike the other three
   components, never states how to measure it. Phase 9 scores it against published HCI
   response-time thresholds — full marks at ≤ 3 s (common web-response threshold), zero at ≥ 10 s
   (Nielsen's *limit of attention*) — and flags it `provisional`, reporting CES both with and
   without it so nothing is overstated. **Measured login latency on the live blockchain is
   3 310 ms, which slightly exceeds the 3 000 ms target**, so this component scores 0.956 and the
   full-weighting CES is **99.6**, not 100. The threshold was set from the literature before the
   run and has deliberately not been moved to fit the result. This is the concrete number the
   client's definition should be set against.
2. **Geolocation is table-driven, not a live GeoIP service.** `zerotrust/geo.ts` resolves the RFC
   5737 documentation ranges the simulation drives; an IP it cannot place yields *no* signal rather
   than a guess. ROADMAP §8's ethics constraint rules out third-party lookups, and a fixed table
   keeps runs reproducible. Production swaps in MaxMind GeoLite2 behind the same `locate()` call.
3. **Identity revocation is permanent and deliberately manual.** `IdentityContract` has no
   un-revoke transaction, so `POST /api/admin/identity/:id/revoke` is an explicit administrative
   act and is *not* wired to the risk engine's TERMINATE decision — a false-positive risk score
   must never be able to lock a student out of their records irreversibly.
4. **Phase 8/9 results are measured against the live Fabric network.** The earlier provisional
   figures were produced on `MockLedger`; the full evaluation has since been re-run on the real
   blockchain, with no scenario or metric changes needed — the definitions are ledger-agnostic, so
   the identical `npm run sim` / `npm run evaluate` reproduce on either. Going live also produced
   two numbers a simulated ledger could not: **~2.1 s and ~8 KB per access decision**, permanently,
   on every peer. See [TECHNICAL_REPORT.md §9.2](TECHNICAL_REPORT.md#92-measured-cost-of-immutability).

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
