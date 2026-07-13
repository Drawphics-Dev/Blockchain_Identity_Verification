# Blockchain-Enhanced Identity Verification for Zero Trust Access Control in University Student Portals

A research prototype: a university student portal secured by a Zero Trust access model, with
identity anchoring and an immutable audit trail on a permissioned Hyperledger Fabric blockchain.

**Security challenges addressed:** credential compromise, data adulteration, lateral movement.

> **Status: the portal works end-to-end on real data.**
> Log in, register and drop courses, view fees and results — all backed by PostgreSQL, with
> bcrypt passwords and revocable JWT sessions. What does **not** exist yet is the security
> research half: the Fabric network, the chaincode, and the Zero Trust risk engine.
> See [Current status](#current-status) for the honest breakdown.

## Documents

| Document | What it is |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | The original client brief, verbatim. |
| [ROADMAP.md](ROADMAP.md) | **The authoritative build plan (client-approved, 2026-07-10).** 9 phases, Fabric-first. |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Earlier internal plan. Superseded by ROADMAP.md wherever the two disagree. |

## Current status

| Phase | Status | What actually exists |
|---|---|---|
| 1 — Environment setup | ❌ Not started | Node 20+ and PostgreSQL 18 are running. No Ubuntu/WSL2, Docker, or Fabric 2.5 binaries. **This blocks Phases 4–5.** |
| 2 — Scaffold + ledger interface | ✅ **Done** | Repo structure in place (two top-level folders — see below). `LedgerService` interface (8 methods), a working hash-chained `MockLedger`, and a `FabricLedger` stub behind the same interface. |
| 3 — PostgreSQL | ✅ **Done** | Prisma schema, applied migration, and a seed script. Nine tables: Student, Course, Enrollment, FeeStatement, FeeItem, Payment, ResultSet, ResultRecord, Session. |
| 4 — Fabric network | ❌ Not started | — |
| 5 — Chaincode | ❌ Not started | `backend/chaincode/` contains a spec README and no code. |
| 6 — Backend + Zero Trust engine | 🟡 **Half done** | **Done:** bcrypt + JWT auth, DB-backed revocable sessions, and the full portal API (courses, enrolment, fees, results) — all working. **Missing:** the PDP risk engine, the PEP middleware, and TOTP MFA. Nothing is risk-scored yet. |
| 7 — React portal | 🟡 **Mostly done** | Every page now reads live data from the API — no mock files remain. **Missing:** the admin/audit view, the Verify Integrity button, and per-request telemetry. |
| 8 — Attack scenarios | ❌ Not started | `backend/simulation/` contains a spec README and no code. |
| 9 — Metrics & evaluation | ❌ Not started | `backend/evaluation/` contains a spec README and no code. |

## Repository structure

Two top-level folders. (ROADMAP.md Phase 2 originally specified five — `chaincode`, `simulation`
and `evaluation` were nested under `backend/` at the client's request. See the deviation note in
[ROADMAP.md](ROADMAP.md).)

```
backend/
├── src/           Express + TypeScript: auth, portal API, Zero Trust engine, ledger client
├── prisma/        PostgreSQL schema, migrations, seed
├── chaincode/     Hyperledger Fabric smart contracts (IdentityContract, AuditContract) [spec only]
├── simulation/    The 5 scripted attack/usage scenarios                               [spec only]
└── evaluation/    Metrics engine: TAR/FAR/FRR, attack resistance, CES                 [spec only]
frontend/          React + Vite + TypeScript + Tailwind student portal. Talks to the API.
```

`chaincode/` sits inside `backend/` for convenience, but it is **not** backend code — it is
deployed to and executed by the Fabric peers, not the Express server, and keeps its own
`package.json`.

## What has been built

### The portal works, on real data

The whole flow is live: sign in → dashboard → register/drop courses → fees → results → sign out.
Nothing is mocked. Registering a course writes an `Enrollment` row and increments the course's
seat count in the same transaction; reload the page and it is still there.

**Authentication** (`backend/src/auth/`)
- Passwords are **bcrypt** hashes; the raw password is never stored.
- Login issues a **JWT** whose `jti` is a `Session` row's id. Every protected request re-checks
  that row in PostgreSQL — so a valid signature alone is **never** sufficient. Logging out revokes
  the row, and the token dies instantly even though it has not expired. That server-side
  revocation is the Zero Trust property the project is built to demonstrate, and it is the hook
  the future `TERMINATE_SESSION` decision will use.
- Login failures return **one** message for both a bad ID and a bad password, and a dummy bcrypt
  comparison runs when the ID is unknown — so neither the response nor its timing reveals which
  student IDs exist.

**Portal API** (`backend/src/portal/`) — `/api/courses`, `/api/enrollments` (GET/POST/DELETE),
`/api/fees`, `/api/results`. Every route is behind `requireAuth` and scoped to the student in the
token, so nobody can read another student's fees or results. Enrolment is transactional and the
server is the authority: it re-checks seat availability and the 24-credit cap inside the
transaction, so two simultaneous registrations cannot both take the last seat.

**Derived, never stored** — cumulative GPA, registered credits, fee totals and a course's
effective status are all computed from the underlying rows, so they cannot drift out of sync.
(One visible consequence: the dashboard now shows a cumulative GPA of **3.46**, not the mock's
3.72 — 3.72 was only the most recent semester. 3.46 is the real credit-weighted figure across
both semesters.)

**Database** (`backend/prisma/`) — Prisma schema + migration + seed. Note that Prisma 7 no longer
accepts the connection URL in `schema.prisma`: it lives in `prisma.config.ts` for the CLI, and is
passed to the client through the `@prisma/adapter-pg` driver adapter in `src/db/prisma.ts`.

**The ledger abstraction** (`backend/src/ledger/`) — unchanged and still the key design decision.
A single `LedgerService` interface (8 methods) that the backend talks to instead of Fabric.
`MockLedger` implements it in memory with the ledger's real guarantees (append-only, and
hash-chained via `SHA-256(payload + prevHash)`, so altering any record breaks its own hash and
every hash after it). `FabricLedger` implements the same interface and currently throws
`"implement in ROADMAP Phases 4–5"`. **Nothing calls the ledger yet** — it wires in with the
Zero Trust engine.

### Still missing — the security half

- `src/zerotrust/pdp.ts` — the Policy **Decision** Point (risk scoring). Still 7 lines: a type + a TODO.
- `src/zerotrust/pep.middleware.ts` — the Policy **Enforcement** Point. Still calls `next()`
  unconditionally, enforcing nothing.
- `src/config/policy.config.ts` — thresholds are set (see below), but `signalWeights` is empty.
- TOTP step-up MFA — deferred until the PDP exists, since the PDP is what decides *when* to demand it.
- The dashboard's **Trust Score is a hard-coded placeholder (94)**, and the UI says so on its face
  rather than implying a risk engine that does not exist. The blockchain audit-trail panel was
  removed for the same reason: it was showing four fabricated rows.

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
tampering is always caught.

**Zero Trust decision policy** (thresholds live in `backend/src/config/policy.config.ts`
so their effect on the metrics can be demonstrated):

| Risk score | Decision |
|---|---|
| under 30 | `ALLOW` |
| 30–59 | `STEP_UP` (MFA / re-verify identity on-chain) |
| 60–84 | `DENY` |
| 85+ | `TERMINATE_SESSION` |

**The dependency chain** the whole project rests on: chaincode gives us an unforgeable ledger →
the backend uses it to make and record Zero Trust decisions → `simulation/` stress-tests those
decisions → `evaluation/` scores them. The portal end of that chain is now real; the ledger and
risk-engine end is not.

## Running it

Prerequisites: **Node 20+** and a running **PostgreSQL 16+** with a database named `blockchain`.

**Backend** — first run:

```bash
cd backend
npm install
cp .env.example .env      # then set DATABASE_URL and JWT_SECRET
npm run db:migrate        # create the tables
npm run db:seed           # load the demo student, courses, fees, results
npm run dev               # http://localhost:3000
```

**Interactive API docs: [http://localhost:3000/docs](http://localhost:3000/docs)** (Swagger UI —
log in, click *Authorize*, and call any endpoint from the browser).

Percent-encode reserved characters in the DB password (`@` → `%40`) or the URL will not parse.
Useful extras: `npm run db:studio` (browse the data), `npm run db:reset` (wipe + re-seed).

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

**Sign in** with `SU/CS/2023/0187` / `demo1234`.

## Planned: chaincode, simulation, evaluation

These three directories currently hold **specifications only** — no code.

- **`backend/chaincode/`** (Phase 5) — Node.js chaincode (`fabric-contract-api`). `IdentityContract`
  (`registerIdentity`, `verifyIdentity`, `revokeIdentity`, `getIdentity`) and `AuditContract`
  (`logAccessEvent`, `getAuditEvent`, `getAuditTrail`, `verifyEventIntegrity`; append-only,
  hash-chained). The signatures deliberately mirror `LedgerService` so `FabricLedger` stays a
  thin wrapper.
- **`backend/simulation/`** (Phase 8) — the five required scenarios, each emitting labelled outcomes for
  the metrics engine: genuine login (→ ALLOW), invalid credentials (→ DENY), credential theft &
  imitation (→ STEP_UP then DENY), log tampering (→ integrity verifier flags the mismatch), and
  abnormal behaviour (→ mid-session TERMINATE).
- **`backend/evaluation/`** (Phase 9) — computes TAR / FRR / FAR, attack resistance %, mean anomaly
  detection time, session termination rate, audit integrity %, and the client's **Composite
  Effectiveness Score**:
  `CES = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthenticationPerformance`.
  Outputs CSV/JSON plus charts.

## Open items

1. **Nothing is risk-scored yet.** The portal authenticates and authorises correctly, but there
   is no continuous verification: no risk score, no ALLOW/STEP_UP/DENY/TERMINATE decision, no
   ledger write on access. That is the rest of Phase 6, and it is the project's core claim.
2. **Phase 1 is the bottleneck for the blockchain.** Fabric needs Linux + Docker; we are on
   Windows. Until WSL2 + Docker + the Fabric 2.5 test-network exist, Phases 4 and 5 cannot start.
3. **"Authentication Performance" is undefined.** It carries 10% of the CES weight but was never
   specified in the brief. A concrete definition (login/token-issuance latency? MFA verification
   time?) is needed from the client before Phase 9 can compute CES.
4. **One demo student only.** Phases 8–9 need a population of 20–50 students to produce
   meaningful TAR/FAR/FRR figures; extend `backend/prisma/seed.ts` then.
5. **The 24-credit cap is enforced but unreachable** with the current 7-course catalogue — the
   most a student can register is 18 credits. Add courses before relying on that rule in a demo.

### Security note

An earlier commit put a **real PostgreSQL password in `backend/.env.example`**, which is tracked
by git. It has been replaced with a placeholder, but **it is still in the git history** — treat
that password as compromised and rotate it. Real secrets belong in `backend/.env`, which is
gitignored.

## Scope & ethics

Prototype scale: a 2-org Fabric test-network on a single host — functional, not production.
Device and behaviour signals are simplified; the risk engine is rule-based (chosen for
reproducibility over a black box). **In scope:** credential theft, log tampering, abnormal
behaviour. **Out of scope:** network-layer attacks, DoS, insider chaincode compromise.
Synthetic data only — no real student data or third-party systems.
