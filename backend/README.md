# Backend — Zero Trust Engine + Ledger Service (skeleton)

Node.js + Express + TypeScript backend for the **Blockchain-Enhanced Identity
Verification** prototype. This is the project **skeleton**: the folder structure
from [`../IMPLEMENTATION.md`](../IMPLEMENTATION.md) §7 plus a running Express
server with a health check. Each module is a stub with `TODO`s marking the
phase that fills it in.

## Quick start

```powershell
cd backend
npm install
copy .env.example .env
npm run dev            # http://localhost:3000
```

Verify: `GET http://localhost:3000/health` → `{ "status": "ok", ... }`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |

## Layout (maps to IMPLEMENTATION.md §7)

```
src/
├── index.ts                  App entry (start server)
├── app.ts                    Express assembly, health check, route mounting
├── config/
│   ├── env.ts                Typed environment config
│   └── policy.config.ts      Zero Trust weights & thresholds (stub)
├── types/                    Shared domain + Zero Trust types (stub)
├── db/
│   └── store.ts              In-memory store → PostgreSQL later (stub)
├── ledger/
│   ├── LedgerService.ts      Interface — the abstraction both tracks depend on
│   ├── MockLedger.ts         Track A implementation (stub)
│   ├── FabricLedger.ts       Track B implementation (stub)
│   └── index.ts              Factory (LEDGER=mock|fabric)
├── auth/
│   └── auth.routes.ts        Auth router (stub)
├── zerotrust/
│   ├── pdp.ts                Policy Decision Point (stub)
│   └── pep.middleware.ts     Policy Enforcement Point (stub)
├── portal/
│   ├── portal.controller.ts  Courses / fees / results handlers (stub)
│   └── portal.routes.ts      Portal router (stub)
├── audit/
│   └── audit.routes.ts       Admin / research routes (stub)
└── utils/
    └── logger.ts             Minimal logger
```

## Next steps (per IMPLEMENTATION.md)

1. Ledger phase — `LedgerService` interface + `MockLedger` (append-only + SHA-256).
2. Data phase — PostgreSQL schema + seed (swap the in-memory `store`).
3. Auth phase — login (JWT), MFA/TOTP step-up.
4. Zero Trust — signals → `pdp` scoring → `pep` enforcement on every request.
5. Audit — on-chain trail + off-chain mirror + integrity verifier.
