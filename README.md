# Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals

A university student portal secured by a **Zero Trust** access model, with identity anchoring and an
**immutable, hash-chained audit trail** on a permissioned **Hyperledger Fabric** blockchain.

The core idea in one sentence: **PostgreSQL holds the data, the blockchain holds the proof it was
not changed.** Every login and every request is re-evaluated for risk, and every security decision
is written to a ledger that cannot be secretly rewritten — so tampering is always detectable.

This README is a complete developer and user guide: what the system is, how it works end-to-end, and
how to run it from a clean machine. Deeper design detail lives in
[TECHNICAL_REPORT.md](TECHNICAL_REPORT.md); the build plan is in [ROADMAP.md](ROADMAP.md).

---

## Contents

- [Quick start](#quick-start)
- [What the system is](#what-the-system-is)
- [Security challenges addressed](#security-challenges-addressed)
- [How it works — the technical flow](#how-it-works--the-technical-flow)
  - [Architecture (four layers)](#architecture-four-layers)
  - [The Zero Trust request lifecycle](#the-zero-trust-request-lifecycle)
  - [Login: three gates](#login-three-gates)
  - [Risk signals and decisions](#risk-signals-and-decisions)
  - [The continuous background monitor](#the-continuous-background-monitor)
  - [On-chain vs off-chain, and tamper detection](#on-chain-vs-off-chain-and-tamper-detection)
  - [The ledger abstraction](#the-ledger-abstraction)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Running it (A–Z)](#running-it-az)
- [Docker configuration](#docker-configuration)
- [Component reference](#component-reference)
- [Notes & open items](#notes--open-items)
- [Security note](#security-note)
- [Scope & ethics](#scope--ethics)

---

## Quick start

**Docker Desktop (running) and Node 20+ are the only prerequisites.** PostgreSQL runs in a container
the scripts manage — nothing else to install.

```bash
git clone <this-repo> && cd Blockchain_Identity_Verification
./scripts/start.sh --mock       # everything except the blockchain — ready in about a minute
```

To run the real Hyperledger Fabric stack you also need `fabric-samples`
(**inside WSL2 on Windows** — see [Installing Fabric](#installing-fabric-for-the-blockchain-path)):

```bash
./scripts/start.sh --fabric     # ...plus the Fabric network + chaincode deployment
```

Portal at **http://localhost:5173** — sign in as `SU/CS/2023/0187` / `demo1234` (student) or
`SU/IT/ADMIN/001` / `demo1234` (admin / research view). `Ctrl-C` stops the servers;
`./scripts/stop.sh` stops the database.

Full setup, tests and troubleshooting: [Running it (A–Z)](#running-it-az).

---

## What the system is

A university student portal (login, course registration, fee statements, exam results) built on two
ideas that only work in combination:

- **Zero Trust** — *never trust, always verify*. A valid login token is never, by itself, enough.
  Every subsequent request is re-scored for risk against live signals; if a request looks risky
  mid-session, access is stepped-up (MFA), denied, or the session is terminated outright.
- **Blockchain-anchored identity + audit** — each student's identity is *anchored* on a permissioned
  Hyperledger Fabric ledger, and every access decision is written to an **append-only, hash-chained**
  audit trail. Because the ledger cannot be rewritten, tampering with the records is always
  detectable.

Neither pillar is sufficient alone. Zero Trust decides correctly but writes its decisions to storage
an attacker with database access could rewrite; the blockchain makes records permanent but decides
nothing. Anchoring identity on-chain is what lets the login gate catch a tampered credential, and
hash-chaining the audit trail is what makes the audit numbers themselves trustworthy.

---

## Security challenges addressed

The three threats named in the brief, and where each is caught:

| Threat | Defence |
|---|---|
| **Credential compromise** (stolen password) | A correct password from an unrecognised device raises `newDevice` → `STEP_UP`. The thief cannot reach data without a second factor they do not have. |
| **Data adulteration** (tampering with stored records) | The identity anchor catches a tampered password hash at login; the hash-chained audit trail catches an edited audit record. Both are compared against the blockchain, which cannot be altered to match. |
| **Lateral movement** (a foothold spreading) | Every query is scoped to the token's own student; admin surfaces require a disjoint role. A legitimate session that tries to reach another student's data, or the admin area, gets nothing — and a probing pattern raises the risk score. |

---

## How it works — the technical flow

### Architecture (four layers)

```
                         Student (browser)
                               │  HTTPS + X-Device-Telemetry
                               ▼
        ┌──────────────────────────────────────────────┐
        │   Express backend (Node.js / TypeScript)      │
        │   ┌────────────────────────────────────────┐  │
        │   │  Zero Trust engine                     │  │
        │   │   PEP — enforces on every request      │  │
        │   │   PDP — scores 8 risk signals          │  │
        │   │   Monitor — re-scores every 15s        │  │
        │   └────────────────────────────────────────┘  │
        │   Auth: bcrypt + JWT + TOTP MFA               │
        └──────────────────────────────────────────────┘
                    │                       ▲
      writes data   │                       │  reads back to verify
                    ▼                       │
        ┌───────────────────┐    ┌──────────────────────────────┐
        │   PostgreSQL      │    │   Hyperledger Fabric 2.5      │
        │   (off-chain)     │    │   (on-chain)                 │
        │  students, courses│    │  IdentityContract — anchors  │
        │  fees, results,   │    │  AuditContract — append-only,│
        │  sessions, mirror │    │  hash-chained audit trail    │
        └───────────────────┘    └──────────────────────────────┘
```

| Layer | Component | Responsibility |
|---|---|---|
| Presentation | React portal (browser) | Login, dashboard, courses, fees, results, admin view; collects device + behaviour telemetry per request |
| Application | Node.js + Express backend | Policy Enforcement Point (PEP) + Policy Decision Point (PDP): authenticates, scores risk, enforces decisions |
| Data (off-chain) | PostgreSQL 16 | Students, courses, fees, results, sessions, risk events, and a fast-query mirror of the audit trail |
| Ledger (on-chain) | Hyperledger Fabric 2.5 | Immutable identity anchors and audit records via `IdentityContract` + `AuditContract` |

### The Zero Trust request lifecycle

Every authenticated request to a protected route runs this loop:

1. **`requireAuth`** verifies the JWT signature, loads the session, and checks it is not revoked or
   expired.
2. **PEP** (`pep.middleware.ts`) builds the request's live signals and asks the **PDP** to score
   them.
3. **PDP** (`pdp.ts`, a pure function) returns `{ riskScore, decision, reasons }`.
4. The decision is **written to the ledger** and mirrored to PostgreSQL — *before* the response.
5. The PEP **enforces**: `ALLOW` → handler runs; `STEP_UP` → `403 step_up_required`; `DENY` →
   `403 access_denied`; `TERMINATE` → session revoked + `401 session_terminated`.

The PDP (decides) and PEP (enforces) are deliberately split, NIST SP 800-207 style — which is what
keeps the risk logic a testable pure function and the weights tunable in one config file.

### Login: three gates

Login (`auth/auth.routes.ts`) is not one check but three, in order:

1. **Password gate** — `bcrypt.compare`. A bad student id and a bad password return the *same* 401 in
   the *same* time (a dummy hash is compared for unknown ids), so timing never leaks which ids exist.
2. **Identity-anchor gate** (`zerotrust/identity.ts`) — the blockchain half. Login reads the anchor
   with `LedgerService.getIdentity` (anchoring on first use) and compares it to a hash recomputed
   from the stored credential. It catches two things bcrypt cannot:
   - `identity_revoked` — an identity revoked on the ledger, even against a still-correct password.
   - `identity_mismatch` — the stored password hash no longer matches what was anchored, i.e. the
     database was tampered with. The anchor is `sha256(studentId + ":" + passwordHash)` — never the
     raw credential.
3. **Risk gate** — the PDP scores the login. A new device forces `STEP_UP`; a physically impossible
   journey since the last session can reach `TERMINATE` and refuse the login outright (that refusal
   is itself written to the ledger).

A load-bearing rule: a device/network is marked "known" only **after** a successful step-up, never at
password time — otherwise anyone with the password could whitelist their machine by attempting a
login and walking away.

### Risk signals and decisions

The PDP sums the weight of every signal that fired (clamped 0–100). All seven signals the roadmap
(§4.1) specifies are implemented:

| Signal | Weight | Fires when |
|---|---|---|
| `impossibleTravel` | **35** | Reaching this location from the previous one would need > 900 km/h |
| `newDevice` | **30** | Device fingerprint ≠ the one recorded for this context |
| `newIpAddress` | 20 | Current IP ≠ the recorded one |
| `highRequestRate` | 20 | > 30 requests in a 10-second window |
| `abnormalNavigation` | 15 | > 8 *distinct* resources in a 60-second window |
| `staleSession` | 15 | Session past 85% of its lifetime |
| `oddHour` | 10 | Outside business hours (06:00–22:00) |
| `sensitiveResource` | 10 | Path is `/api/fees` or `/api/results` |

*Credential validity* — the remaining §4.1 row — is deliberately a hard pre-gate (the password + anchor
checks above), not a weighted signal: a wrong password is a refusal, not a risk factor to be
outweighed.

The score maps to a decision (thresholds in `config/policy.config.ts`, so their effect on the metrics
can be demonstrated):

| Risk score | Decision | Meaning |
|---|---|---|
| **< 30** | `ALLOW` | proceed |
| **30–59** | `STEP_UP` | require a TOTP code |
| **60–84** | `DENY` | block this request |
| **≥ 85** | `TERMINATE` | revoke the session |

`newDevice` is weighted at exactly 30 so an unrecognised device demands MFA *on its own*; a startup
assertion refuses to boot if it is ever tuned below the threshold. `impossibleTravel` is the only
signal above it (35) — a new device is *unusual*, but impossible travel is *physically false*.

### The continuous background monitor

The PEP only runs when a request arrives. The monitor (`continuousMonitor.ts`) provides the "no new
user action" half of continuous verification: every **15 seconds** it re-scores each active session's
recent risk history and can terminate one with no new request — revoking the session and writing a
`TERMINATE` decision to the ledger. This is what catches a **hijacked session**: an attacker replaying
a stolen token from another machine trips `newDevice` on every request, the rolling score climbs, and
the monitor kills the session, measuring `firstAnomalyAt → revokedAt` as the anomaly-detection time.

### On-chain vs off-chain, and tamper detection

Golden rule: **never put raw credentials or personal data on the ledger — only hashes and events.**

| Data | Location |
|---|---|
| Raw password | Nowhere (bcrypt hash in PostgreSQL only) |
| Student PII, courses, fees, results | PostgreSQL |
| Identity anchor (hash + public key) | Fabric — `IdentityContract` |
| Every access decision + verification event | Fabric — `AuditContract` |
| Audit mirror (for fast dashboard queries) | PostgreSQL |

**Tamper detection** (`GET /api/admin/audit/verify/:eventId`): each audit event is written on-chain
*and* mirrored to PostgreSQL. The integrity verifier recomputes the hash from the mirror's **current**
field values — not from its stored `hash` column, which an attacker could leave untouched while
editing `riskScore` or `decision` — and compares it to the immutable on-chain record. A mismatch means
tampering. Because the ledger cannot be altered, tampering is always caught. This is proven against a
real edited record, not assumed.

### The ledger abstraction

The single most important design decision: the backend talks only to an 8-method **`LedgerService`**
interface, never to Fabric directly.

```
LedgerService (8 methods)
├── registerIdentity · verifyIdentity · revokeIdentity · getIdentity      (identity)
└── logAccessEvent · getAuditEvent · getAuditTrail · verifyEventIntegrity (audit)
```

Two implementations sit behind it, selected at startup by `LEDGER=mock|fabric`:

- **`FabricLedger`** — the live Hyperledger Fabric network. The deployment target and the source of
  every reported result.
- **`MockLedger`** — a PostgreSQL-backed implementation for running without a blockchain. Not a
  throwaway: it is **durable** (survives restarts), **append-only**, and **hash-chained**, with
  appends serialised by a Postgres advisory lock so parallel requests cannot fork the chain. The
  engine behaves identically on either.

Keeping both is what makes the abstraction *provable* rather than merely claimed: the same engine, the
same six scenarios and the same metrics run unmodified on either, and the only figure that changes is
latency — which is precisely the cost-of-immutability finding in
[TECHNICAL_REPORT §9.2](TECHNICAL_REPORT.md#92-measured-cost-of-immutability).

---

## Technology stack

| Layer | Technology |
|---|---|
| Blockchain | Hyperledger Fabric 2.5 (test-network) — 2 orgs, 1 channel, both contracts deployed |
| Smart contracts | Node.js chaincode (`fabric-contract-api`) |
| Ledger client | `@hyperledger/fabric-gateway` |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (Prisma ORM) |
| Frontend | React + Vite + TypeScript + Tailwind |
| Auth | JWT + TOTP MFA (bcrypt password hashing) |
| Host | Windows 11 + WSL2 (Ubuntu 22.04) + Docker Desktop |

---

## Repository structure

Two top-level folders. (ROADMAP.md Phase 2 originally specified five — `chaincode`, `simulation` and
`evaluation` were nested under `backend/` at the client's request.)

```
docker-compose.yml                PostgreSQL 16 container (published on 55432, not 5432)
scripts/
├── start.sh                      ONE-COMMAND STARTUP — the whole stack (Phase 9 packaging)
├── stop.sh                       Tear down; --purge also deletes the database volume
├── fabric-up.sh                  Fabric network + chaincode deploy + credential copy (Phase 4)
├── fabric-down.sh                Tear down the network and remove stale credentials
└── lib.sh                        Shared helpers (prerequisite checks, health waiting)
backend/
├── src/
│   ├── app.ts                    Express assembly: middleware, health, route mounting
│   ├── index.ts                  Server entry point (starts the continuous monitor)
│   ├── auth/                     Login, logout, MFA, JWT, requireAuth / requireAdmin guards
│   ├── zerotrust/                Zero Trust engine: PDP, PEP, signals, geo, monitor, identity
│   ├── portal/                   Portal API: courses, enrollment, fees, results
│   ├── audit/                    Admin routes: audit trail, verify, metrics, identity revoke/verify
│   ├── ledger/                   LedgerService interface + FabricLedger + MockLedger + hashEvent
│   ├── docs/openapi.ts           The OpenAPI document served at /docs and /openapi.json
│   ├── config/                   env + policy.config (weights, thresholds — the tuning knobs)
│   └── db/                       Prisma client
├── prisma/                       schema.prisma, migrations, seed.ts (30 students + 1 admin)
├── chaincode/                    Fabric smart contracts (Phase 5) — own package.json
├── simulation/                   The 6 attack scenarios (Phase 8)
├── evaluation/                   Metrics + CES engine (Phase 9)
├── tests/e2e.ts                  End-to-end HTTP test of the whole engine (37 checks)
├── tests/fabric-check.ts         Ledger acceptance checks against the live network (22 checks)
├── tsconfig.json                 Build config — scopes the compiler to src/
└── tsconfig.tools.json           Typecheck-only config for simulation/, evaluation/, tests/, prisma/
frontend/
└── src/                          React portal (pages, components, context, api client)
```

`chaincode/` sits inside `backend/` for convenience but is **not** backend code — it is deployed to
and executed by the Fabric peers, not the Express server, and keeps its own `package.json`.

---

## Running it (A–Z)

Everything below assumes a **fresh machine with nothing installed but Docker and Node**. There are two
paths: run without a blockchain in about a minute, or run the full Fabric stack.

### Prerequisites

| | Needed for | Notes |
|---|---|---|
| **Docker Desktop** | both paths | Must be *running*, not just installed. On Windows, use the WSL2 backend. |
| **Node.js 20+** | both paths | `node -v` must report v20 or newer. |
| **Git Bash** *(Windows only)* | both paths | The scripts are bash. Ships with Git for Windows. |
| **WSL2 + fabric-samples** | Fabric path only | See [Installing Fabric](#installing-fabric-for-the-blockchain-path). |

You do **not** need to install PostgreSQL — it runs in a container the scripts manage.

### Path A — run it now, no blockchain

```bash
git clone <this-repo>
cd Blockchain_Identity_Verification
./scripts/start.sh --mock
```

That is the whole setup. On first run it installs dependencies, generates `backend/.env` with a random
JWT secret, starts PostgreSQL in Docker, applies migrations, seeds 30 students + 1 administrator, and
starts both servers.

The Zero Trust engine, the portal, the six attack scenarios and the metrics all work on this path. The
only difference is that the ledger is `MockLedger` (PostgreSQL-backed, still append-only and
hash-chained) rather than a real blockchain.

### Path B — the full Hyperledger Fabric stack

```bash
./scripts/start.sh --fabric
```

This additionally starts the 2-org Fabric network, deploys both chaincodes, and copies the gateway
credentials into place. It **reuses** a network that is already running; add `--recreate` to tear one
down and start a fresh chain (**this destroys the ledger — every identity anchor and audit record**).

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

`Ctrl-C` stops the backend and frontend. `./scripts/stop.sh` stops PostgreSQL (`--purge` also deletes
its data; `--fabric` also tears down the network).

> **Why port 55432?** Machines that have run this project usually already have PostgreSQL on 5432. On
> Windows, Docker will happily publish onto the same port rather than refusing to bind, and the host
> then resolves `localhost:5432` to whichever bound first — so the stack silently connects to the
> wrong database. Publishing somewhere unoccupied keeps it self-contained. If `backend/.env` already
> points elsewhere, `start.sh` tells you instead of starting a container nobody uses.

### First sign-in: the QR code

A student's **first** login trips `newDevice` + `newIpAddress` (50 → `STEP_UP`), so the portal runs
MFA enrollment and shows a QR code — but only after you supply that student's **enrollment token**,
which `npm run db:seed` prints. A correct password deliberately is *not* enough to bind an
authenticator, or whoever signs in first (including a password thief) would own the second factor.

Scan it with any authenticator app, enter the 6-digit code, and that device is trusted from then on —
later logins from the same machine go straight through. The demo accounts above may already be
enrolled from prior runs, in which case they sign in directly.

### Installing Fabric (for the blockchain path)

Only needed for Path B. Fabric's tooling is Linux — on Windows install it **inside WSL2**, not on the
Windows filesystem.

```bash
# in WSL2 (Ubuntu 22.04) or on Linux, from your home directory:
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 --ca-version 1.5.17 docker samples binary
```

That creates `~/fabric-samples`. The scripts look there by default; point elsewhere with:

```bash
FABRIC_SAMPLES=/path/to/fabric-samples ./scripts/start.sh --fabric
```

Verify it worked: `cd backend && npm run test:fabric` should report **22/22 passed** (stop the backend
first — see below).

### Running the tests

```bash
cd backend
npm run typecheck                        # all TypeScript, incl. simulation/evaluation/tests
npm test --prefix chaincode              # 26 smart-contract checks (offline, no network needed)
npm run test:e2e                         # 37 end-to-end checks — backend must be RUNNING
npm run test:fabric                      # 22 ledger checks — backend must be STOPPED (see below)
npm run sim && npm run evaluate          # the 6 scenarios, then the metrics + CES
```

Results land in `backend/evaluation/results/` — open **`metrics-latest.html`** for the dashboard
(confusion matrix, metric bars, CES gauge). A healthy run reports TAR 1.0 · FAR 0 · FRR 0 · attack
resistance 100% · audit integrity 100% · session termination 100% · **CES 100/100** excluding the
provisional Authentication Performance component (99.6 including it — see
[Notes & open items](#notes--open-items)).

> **`test:fabric` needs the backend stopped.** It writes to the ledger directly, so a running backend
> appends to the same chain from a different process. Both contend for the chain's single tail and one
> fails with `MVCC_READ_CONFLICT`. That is inherent to a hash-chained log (one global tail is one
> global serialisation point), not a defect — and it is the same pressure behind the Merkle-anchoring
> recommendation. `test:e2e` and `npm run sim` are unaffected: they drive the backend over HTTP, so
> all writes go through one process.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Docker is installed but not running` | Start Docker Desktop and wait for it to report ready. |
| `Fabric test-network not found` | Install fabric-samples (above), or set `FABRIC_SAMPLES`. |
| `503 ledger_unavailable` | The Fabric peer is unreachable. `docker ps` should list `peer0.org1`, `peer0.org2`, `orderer`. Re-run `./scripts/fabric-up.sh`. |
| `identity_mismatch` on every login | The database was re-seeded while on Fabric — the on-chain anchors still commit to the old password hashes. See the warning below. |
| Login refused with `access_denied` | The engine blocked it on risk. The response lists which signals fired. |
| Port already in use | Something else holds 3000 / 5173 / 55432. Stop it, or change `PORT` in `backend/.env`. |
| `MVCC_READ_CONFLICT` in `test:fabric` | The backend is still running. Stop it first — see the note above. |

> ⚠️ **Never re-seed while running on Fabric.** `npm run db:seed` regenerates every password hash, but
> on-chain identity anchors commit to the *old* hashes and cannot be deleted — every student is then
> locked out permanently with `identity_mismatch`. `scripts/start.sh` refuses to do this silently, but
> do not run the seed by hand on a Fabric deployment. On `--mock` it is safe.

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

---

## Docker configuration

Docker Desktop hosts the Hyperledger Fabric network. Every Fabric component runs as a container, so
the blockchain never has to be installed onto the host OS and the same topology comes up identically
on any machine.

### Verified environment

The versions below are the ones this system was **measured on** — read from the running deployment,
not from documentation.

| Component | Version |
|---|---|
| Operating system | Windows 11 |
| Linux environment | WSL2 (Ubuntu 22.04 LTS) |
| Docker Desktop | 29.6.1 (build 8900f1d) |
| Hyperledger Fabric | 2.5.16 |
| Hyperledger Fabric CA | 1.5.17 |

### Containers

Eight containers make up the running network:

| Container | Role |
|---|---|
| `peer0.org1.example.com` | Org1 (University IT) peer — endorses and commits |
| `peer0.org2.example.com` | Org2 (Registrar) peer — endorses and commits |
| `orderer.example.com` | Ordering service — sequences transactions into blocks |
| `ca_org1`, `ca_org2` | Certificate authorities issuing each org's identities |
| `ca_orderer` | Certificate authority for the ordering service |
| `dev-peer0.org1…ziam_1.0` | Chaincode container on Org1 — runs `IdentityContract` + `AuditContract` |
| `dev-peer0.org2…ziam_1.0` | The same chaincode on Org2 |

Both chaincode containers matter: an endorsement policy requiring **both** organisations is what makes
a record on this ledger a two-party agreement rather than one server's assertion. A single peer could
be compromised; two independently endorsing peers is the property the audit trail rests on. The two
organisations share **one application channel** (`mychannel`).

### Images

```
hyperledger/fabric-peer:2.5.16       the peer nodes
hyperledger/fabric-orderer:2.5.16    the ordering service
hyperledger/fabric-ca:1.5.17         certificate authorities
hyperledger/fabric-ccenv:2.5.16      chaincode build environment
hyperledger/fabric-baseos:2.5.16     base image for chaincode containers
hyperledger/fabric-nodeenv:2.5       Node.js chaincode runtime
```

`install-fabric.sh` pulls all of these automatically. Note the last one: `fabric-nodeenv` is required
**because this project's chaincode is JavaScript** — a Go or Java chaincode would not need it, and its
absence is a common cause of a deployment that packages successfully and then fails to start. Images
come from Docker Hub under the plain `hyperledger/` namespace, not `ghcr.io/hyperledger/`.

### Networking

Docker creates an isolated virtual network for the Fabric containers:

- **peer ↔ peer** — gossip and state transfer between organisations
- **peer ↔ orderer** — transaction submission and block delivery
- **peer / orderer ↔ CA** — identity enrolment and TLS certificates
- **backend ↔ peer** — the Express server via the Fabric Gateway SDK (`@hyperledger/fabric-gateway`)

That last hop crosses the container boundary. The peer publishes on the host's `localhost:7051`, which
is why the backend runs **on the host rather than in a container** — from inside a container
`localhost` is the container itself, and the gateway connection fails. TLS adds one subtlety: the
peer's certificate is issued to `peer0.org1.example.com`, not `localhost`, so the connection needs an
SNI override (`FABRIC_PEER_HOST_ALIAS`) or the handshake fails even though the connection is fine.

### Starting the network by hand

Prefer `./scripts/fabric-up.sh` — it reuses a running network instead of destroying it, deploys the
chaincode from the right path, and copies the gateway credentials. The manual equivalent, for
reference:

```bash
cd ~/fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca
./network.sh deployCC -c mychannel -ccn ziam \
    -ccp /path/to/repo/backend/chaincode -ccl javascript
./network.sh down
```

> A bare `./network.sh deployCC` deploys the *sample* chaincode, not this project's. The
> `-ccn ziam -ccp <backend/chaincode> -ccl javascript` arguments are required, and after every
> `network.sh up` the gateway credentials must be re-copied — `network.sh` regenerates all crypto
> material, so previously copied certificates no longer exist. `scripts/fabric-up.sh` does both for you.

### Verifying Docker

```bash
docker --version     # expect 29.x
docker info          # must succeed — Docker Desktop must be running, not just installed
docker ps            # 8 containers once the Fabric network is up
docker images        # the six Fabric images above
```

---

## Component reference

- **`backend/chaincode/`** (Phase 5) — the on-chain smart contracts, **deployed to and endorsed by
  both peers**. `IdentityContract` (`registerIdentity`, `verifyIdentity`, `revokeIdentity`,
  `getIdentity`) and `AuditContract` (`logAccessEvent`, `getAuditEvent`, `getAuditTrail`,
  `verifyEventIntegrity`; append-only, hash-chained). Signatures mirror `LedgerService` so
  `FabricLedger` stays a thin wrapper. `lib/hashEvent.js` is kept byte-identical to the backend's
  `src/ledger/hashEvent.ts` — the invariant tamper detection depends on. `npm test` runs **26 offline
  checks**; `npm run test:fabric` (from `backend/`) runs **22 acceptance checks** against the live
  network.
- **`backend/simulation/`** (Phase 8) — **six scenarios**, each driving the real backend over HTTP and
  emitting labelled outcomes: genuine login (→ ALLOW), invalid credentials (→ DENY at auth), credential
  theft (→ STEP_UP then blocked), log tampering (→ integrity verifier flags the mismatch), abnormal
  behaviour (→ mid-session TERMINATE), and **lateral movement** (→ contained on every axis). Run with
  `npm run sim`; counts are configurable via env vars, and `-- --quick` runs a fast smoke test.
- **`backend/evaluation/`** (Phase 9) — computes TAR / FRR / FAR, attack resistance %, mean anomaly
  detection time, session termination rate, audit integrity %, and the
  **Composite Effectiveness Score**:
  `CES = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthenticationPerformance`.
  `npm run evaluate` reads Phase 8's report and outputs JSON + CSV + a self-contained HTML dashboard.

**Admin / research API** (all admin-only, all documented at `/docs`):

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/audit` | The on-chain audit trail, newest first, filterable by student |
| `GET /api/admin/audit/verify/:eventId` | Tamper check: recompute the mirror's hash, compare to the ledger |
| `GET /api/admin/identity/:studentId/verify` | Identity check performed *inside the chaincode* |
| `POST /api/admin/identity/:studentId/revoke` | Revoke an identity anchor on-chain (permanent) |
| `GET /api/admin/metrics` | Live continuous-validation metrics from real traffic |

---

## Notes & open items

1. **"Authentication Performance" needs a definition from the client — this is the only open blocker.**
   ROADMAP §7 Table 1 gives it 10% of the CES weight but, unlike the other three components, never
   states how to measure it. Phase 9 scores it against published HCI response-time thresholds — full
   marks at ≤ 3 s (common web-response threshold), zero at ≥ 10 s (Nielsen's *limit of attention*) —
   and flags it `provisional`, reporting CES both with and without it so nothing is overstated.
   **Measured login latency on the live blockchain is 3 310 ms, which slightly exceeds the 3 000 ms
   target**, so this component scores 0.956 and the full-weighting CES is **99.6**, not 100. The
   threshold was set from the literature before the run and has deliberately not been moved to fit the
   result. This is the concrete number the client's definition should be set against.
2. **Geolocation is table-driven, not a live GeoIP service.** `zerotrust/geo.ts` resolves the RFC 5737
   documentation ranges the simulation drives; an IP it cannot place yields *no* signal rather than a
   guess. ROADMAP §8's ethics constraint rules out third-party lookups, and a fixed table keeps runs
   reproducible. Production swaps in MaxMind GeoLite2 behind the same `locate()` call.
3. **Identity revocation is permanent and deliberately manual.** `IdentityContract` has no un-revoke
   transaction, so `POST /api/admin/identity/:id/revoke` is an explicit administrative act and is *not*
   wired to the risk engine's TERMINATE decision — a false-positive risk score must never be able to
   lock a student out of their records irreversibly.
4. **Phase 8/9 results are measured against the live Fabric network.** The earlier provisional figures
   were produced on `MockLedger`; the full evaluation has since been re-run on the real blockchain,
   with no scenario or metric changes needed — the definitions are ledger-agnostic, so the identical
   `npm run sim` / `npm run evaluate` reproduce on either. Going live also produced two numbers a
   simulated ledger could not: **~2.1 s and ~8 KB per access decision**, permanently, on every peer.
   See [TECHNICAL_REPORT.md §9.2](TECHNICAL_REPORT.md#92-measured-cost-of-immutability).

---

## Security note

An earlier commit put a **real PostgreSQL password in `backend/.env.example`**, which is tracked by
git. It has been replaced with a placeholder, but **it is still in the git history** — treat that
password as compromised and rotate it. Real secrets belong in `backend/.env`, which is gitignored.
`frontend/.env` is intentionally committed and holds no secret (`VITE_API_URL` only — Vite inlines it
into the browser bundle, so it can never be secret).

---

## Scope & ethics

Prototype scale: a 2-org Fabric test-network on a single host — functional, not production. Device and
behaviour signals are derived server-side from request headers, not a dedicated client-side
fingerprinting library. Geolocation is table-driven rather than a commercial GeoIP service. The risk
engine is rule-based, chosen for reproducibility over a black box. **In scope:** credential theft, log
tampering, abnormal behaviour, lateral movement. **Out of scope:** network-layer attacks, denial of
service, insider chaincode compromise. Synthetic data only — no real student data or third-party
systems.

---

*Companion documents: [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) (full design walkthrough),
[ROADMAP.md](ROADMAP.md) (the authoritative build plan), [REQUIREMENTS.md](REQUIREMENTS.md) (the
original brief).*
