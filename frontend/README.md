# Meridian University — Student Portal (Frontend)

React frontend for the **blockchain-enhanced Zero Trust student portal** research prototype.
This is **Track A** of the build (see `../IMPLEMENTATION.md`): a fully working, professionally
designed portal running on **mock data**. The backend + Hyperledger Fabric slot in later with no
changes to these components.

## Tech stack
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** (custom "Aegis" design system — see `tailwind.config.js` + `src/styles/index.css`)
- **React Router 6** for navigation
- **Recharts** for data visualisation
- **lucide-react** for icons

## Getting started

> Requires **Node.js 20+**. Install from https://nodejs.org (or `winget install OpenJS.NodeJS.LTS`).

```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173**.

**Demo login:**
- Student ID: `MU/CS/2023/0187`
- Password: `demo1234`

## Available scripts
| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (hot reload) |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Preview the production build locally |

## Pages
| Route | Page | Highlights |
|---|---|---|
| `/login` | Login | Split hero with Zero Trust messaging, blockchain-node backdrop |
| `/dashboard` | Dashboard | Stat cards, GPA trend chart, live **Trust Score** ring, **blockchain audit trail** table |
| `/courses` | Course Registration | Searchable catalogue, add/drop, live credit-load tracker |
| `/fees` | Fee Statement | Balance summary, fee-breakdown donut, on-chain payment history |
| `/results` | Examination Results | Semester selector, score chart, verified results table |

## Project structure
```
frontend/
├── index.html
├── tailwind.config.js         # "Aegis" design tokens (colors, shadows, animations)
├── vite.config.ts             # @ alias → src/
├── public/shield.svg          # favicon
└── src/
    ├── main.tsx               # entry
    ├── App.tsx                # routes + providers
    ├── styles/index.css       # design-system component classes
    ├── config/brand.ts        # 🔧 rebrand the whole portal here
    ├── types/index.ts         # shared domain types
    ├── data/                  # mock data (swap for API calls later)
    ├── context/AuthContext.tsx# mock auth (→ real /auth/login later)
    ├── lib/utils.ts           # cn(), currency & date formatting
    ├── components/
    │   ├── ProtectedRoute.tsx
    │   ├── layout/            # AppLayout, Sidebar, Topbar
    │   └── ui/                # Card, Badge, StatCard, TrustRing, ProgressBar
    └── pages/                 # Login, Dashboard, CourseRegistration, FeeStatement, Results
```

## Design system — "Aegis"
- **Primary:** indigo → violet gradient (`brand-*` tokens)
- **Sidebar:** deep-navy `ink-gradient`
- **Semantics:** emerald (success), amber (warning), rose (danger)
- **Security motif:** the `TrustRing` gauge, "Secure session" pills, and on-chain audit
  tables surface the Zero Trust / blockchain story throughout the UI.

## Swapping mock data for the real backend (later)
Two seams are intentionally isolated:
1. **`src/context/AuthContext.tsx`** → replace the mock `login()` with a `fetch('/auth/login')`.
2. **`src/data/*`** → replace static exports with API calls (e.g. a `src/api/` client).

No page or component changes are required — they consume typed data, not data sources.
