# Backend — Auth, Portal API, Zero Trust Engine, Ledger Service

Node.js + Express + TypeScript + Prisma backend for the **Blockchain-Enhanced Identity
Verification** prototype.

**Working today:** bcrypt + JWT authentication with revocable, DB-backed sessions, and the full
portal API (courses, enrolment, fees, results) on PostgreSQL.
**Not built yet:** the Zero Trust risk engine (PDP/PEP) and the Fabric ledger client.

See [`../ROADMAP.md`](../ROADMAP.md) for the phase plan and [`../README.md`](../README.md) for
overall project status.

## Quick start

Requires Node 20+ and a running PostgreSQL 16+ with a database named `blockchain`.

```bash
npm install
cp .env.example .env      # set DATABASE_URL and JWT_SECRET
npm run db:migrate        # create the tables
npm run db:seed           # demo student, courses, fees, results
npm run dev               # http://localhost:3000
```

Verify: `GET http://localhost:3000/health` → `{ "status": "ok", ... }`.
Sign in with `SU/CS/2023/0187` / `demo1234`.

> Percent-encode reserved characters in the DB password (`@` → `%40`), or the URL will not parse.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | Generate the Prisma client, then compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:seed` | Load the demo dataset (idempotent) |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run db:studio` | Browse the data in Prisma Studio |

## API

**Interactive docs: [http://localhost:3000/docs](http://localhost:3000/docs)** (Swagger UI).
The raw OpenAPI 3.0 document is at `/openapi.json` if you want to feed it to Postman or a client
generator.

To try the protected routes from the docs page: run `POST /api/auth/login` with
`SU/CS/2023/0187` / `demo1234`, copy the `token`, click **Authorize** (top right), and paste it.
Every subsequent request carries it, and it survives a page reload.

The spec lives in [`src/docs/openapi.ts`](src/docs/openapi.ts). It is hand-authored, not
generated — **if you change a route, update it there too, or the docs will drift.**

All portal routes require `Authorization: Bearer <token>` and are scoped to the student in the
token — a student can never read another student's fees or results.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | bcrypt verify → issue JWT + create Session row |
| `POST` | `/api/auth/logout` | Revoke the Session row (kills the token immediately) |
| `GET` | `/api/auth/me` | Current student, with derived GPA + credit load |
| `GET` | `/api/courses` | Course catalogue with live seat counts |
| `GET` | `/api/enrollments` | This student's registrations |
| `POST` | `/api/enrollments` | Register (transactional: seats + credit cap re-checked) |
| `DELETE` | `/api/enrollments/:code` | Drop, freeing the seat |
| `GET` | `/api/fees` | Fee statement (sensitive) |
| `GET` | `/api/results` | Examination results (sensitive) |

`/api/admin/audit` is still a placeholder — it lands with the ledger phase.

## Design notes

**A token alone is never enough.** The JWT's `jti` is a `Session` row id, and `requireAuth`
re-reads that row from PostgreSQL on *every* request. Logout revokes the row and the token dies
instantly, though its signature is still valid. This is the hook the Zero Trust engine's
`TERMINATE_SESSION` decision will use — the mechanism already exists.

**No user enumeration.** A bad student ID and a bad password return the same message, and a dummy
bcrypt comparison runs when the ID is unknown, so response timing does not leak which IDs exist.

**Derived, never stored.** Cumulative GPA, registered credits, fee totals and a course's effective
status are computed from the underlying rows in `portal.service.ts`, so they cannot drift.

**Prisma 7.** The connection URL may no longer live in `schema.prisma` — it is in
`prisma.config.ts` for the CLI, and reaches the client through the `@prisma/adapter-pg` driver
adapter in `src/db/prisma.ts`.

## Layout

```
prisma/
├── schema.prisma             9 models: Student, Course, Enrollment, FeeStatement,
│                             FeeItem, Payment, ResultSet, ResultRecord, Session
├── migrations/               Applied SQL migrations
└── seed.ts                   Demo dataset (idempotent)
src/
├── index.ts                  Entry point
├── app.ts                    Express assembly, health check, error handler
├── config/
│   ├── env.ts                Typed environment config (fails fast if a var is missing)
│   └── policy.config.ts      Zero Trust thresholds — signalWeights still EMPTY
├── docs/
│   └── openapi.ts            OpenAPI 3.0 spec → Swagger UI at /docs
├── types/                    Shared domain + Zero Trust types
├── db/
│   └── prisma.ts             Shared Prisma client (pg driver adapter)
├── ledger/
│   ├── LedgerService.ts      The interface the backend depends on — never Fabric directly
│   ├── MockLedger.ts         In-memory, append-only, hash-chained (works today)
│   ├── FabricLedger.ts       Same interface, throws until Phases 4–5
│   └── index.ts              Factory (LEDGER=mock|fabric)
├── auth/
│   ├── auth.routes.ts        login / logout / me
│   ├── jwt.ts                Sign + verify; jti = Session id
│   └── requireAuth.ts        Bearer check + live session lookup on every request
├── zerotrust/
│   ├── pdp.ts                Policy Decision Point — NOT IMPLEMENTED
│   └── pep.middleware.ts     Policy Enforcement Point — NOT IMPLEMENTED (passes everything)
├── portal/
│   ├── portal.service.ts     Read models + transactional enrol/drop
│   └── portal.routes.ts      Portal router (all behind requireAuth)
├── audit/
│   └── audit.routes.ts       Admin / research routes — placeholder
└── utils/
    ├── logger.ts             Minimal structured logger
    └── asyncHandler.ts       Async route wrapper (Express 4 does not catch rejections)
```

## Next steps

1. **Zero Trust engine (rest of Phase 6)** — signal extraction → `pdp` scoring → `pep`
   enforcement on every request, writing each decision to the `LedgerService`. Needs no
   blockchain: `MockLedger` already satisfies the interface.
2. **TOTP step-up MFA** — triggered by the PDP's `STEP_UP` decision.
3. **Fabric client (Phases 4–5)** — implement `FabricLedger` against the deployed chaincode,
   then flip `LEDGER=fabric`. No other file changes.
