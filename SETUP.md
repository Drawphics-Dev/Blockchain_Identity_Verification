# Setup & Run Guide — from a fresh clone to a working system

**Follow this top to bottom on a machine that has never seen this project.** Every command is
copy-pasteable. Nothing is assumed.

| Other docs | When to read them |
|---|---|
| [README.md](README.md) | Project overview, design rationale, how it works |
| [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) | The formal write-up with measured results |
| [ROADMAP.md](ROADMAP.md) | The phased build plan |

---

## Contents

- [What you're about to run](#what-youre-about-to-run)
- [Part 1 — Install the prerequisites](#part-1--install-the-prerequisites)
- [Part 2 — Clone the repository](#part-2--clone-the-repository)
- [Part 3 — Path A: run it now (no blockchain)](#part-3--path-a-run-it-now-no-blockchain)
- [Part 4 — Path B: the full Hyperledger Fabric stack](#part-4--path-b-the-full-hyperledger-fabric-stack)
- [Part 5 — Your first sign-in](#part-5--your-first-sign-in)
- [Part 6 — Check everything works](#part-6--check-everything-works)
- [Part 7 — Docker configuration, completely](#part-7--docker-configuration-completely)
- [Part 8 — Stopping and cleaning up](#part-8--stopping-and-cleaning-up)
- [Part 9 — Doing it manually, without the scripts](#part-9--doing-it-manually-without-the-scripts)
- [Part 10 — Showing it to someone on another machine](#part-10--showing-it-to-someone-on-another-machine)
- [Part 11 — Troubleshooting](#part-11--troubleshooting)
- [Appendix — Reference tables](#appendix--reference-tables)

---

## What you're about to run

Four pieces. It helps to know which is which before you start:

| Piece | Where it runs | Started by |
|---|---|---|
| **React portal** (the website) | On your machine, port 5173 | `scripts/start.sh` |
| **Express backend** (the API) | On your machine, port 3000 | `scripts/start.sh` |
| **PostgreSQL** (the database) | In **Docker**, port 55432 | `scripts/start.sh` → `docker-compose.yml` |
| **Hyperledger Fabric** (the blockchain) | In **Docker**, 8 containers | `scripts/fabric-up.sh` — **optional** |

The backend and frontend deliberately run *on your machine* rather than in Docker. The reason is
explained in [Part 7](#why-the-backend-is-not-in-docker).

### Choose your path

| | **Path A — Mock ledger** | **Path B — Real blockchain** |
|---|---|---|
| Time to running | ~2 minutes | ~15 minutes first time |
| Extra software | None | `fabric-samples` (inside WSL2 on Windows) |
| Disk space | ~1 GB | ~4 GB |
| RAM needed | ~2 GB | ~6 GB |
| What works | **Everything** — portal, Zero Trust engine, MFA, audit trail, tamper detection | Everything, plus real two-organisation consensus |
| What differs | The ledger is PostgreSQL-backed instead of Fabric. Still durable, append-only, hash-chained. | The genuine article |

**Start with Path A.** It exercises the entire system. Path B swaps the storage underneath the
ledger and changes nothing above it — which is the whole point of the ledger abstraction.

---

## Part 1 — Install the prerequisites

You need exactly two things: **Docker** and **Node.js 20+**.

### Windows

1. **Docker Desktop** — from [docker.com](https://www.docker.com/products/docker-desktop/). During
   installation **tick "Use WSL 2 based engine"**. Reboot when asked, then launch Docker Desktop and
   wait for the whale icon to stop animating.

2. **Node.js 20 or newer** — the LTS installer from [nodejs.org](https://nodejs.org/).

3. **Git** — from [git-scm.com](https://git-scm.com/download/win). This also installs **Git Bash**,
   which you need: the setup scripts are bash scripts. PowerShell and CMD cannot run them.

> **Run every command in this guide from Git Bash**, not PowerShell or CMD.
> Right-click in the folder → *Git Bash Here*.

### macOS

```bash
# Docker Desktop — download from docker.com, or via Homebrew:
brew install --cask docker
# then LAUNCH it. Installing is not the same as running.

brew install node@20 git
```

### Linux (Ubuntu/Debian)

```bash
# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # then log out and back in

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
```

### Verify before continuing

```bash
docker --version          # any recent version; this project was measured on 29.6.1
docker compose version    # the v2 plugin
docker info               # MUST SUCCEED — see below
node -v                   # must be v20.x or higher
git --version
```

> **`docker info` is the one that matters.** Docker being *installed* is not the same as Docker
> *running*. If it errors, start Docker Desktop and wait. Every script here checks this first and
> refuses to continue without it.

---

## Part 2 — Clone the repository

```bash
git clone https://github.com/Drawphics-Dev/Blockchain_Identity_Verification.git
cd Blockchain_Identity_Verification
```

You do **not** need to create any config file by hand. The start script generates `backend/.env` on
its first run, including a freshly generated random signing key.

### ⚠️ Windows users: do this check first

Git for Windows installs with `core.autocrlf=true`, which rewrites Unix line endings to Windows ones
on checkout. The scripts in this repo are bash scripts, and a bash script with Windows line endings
fails immediately with a confusing error:

```
./scripts/start.sh: line 4: $'\r': command not found
```

Check whether you're affected:

```bash
file scripts/start.sh
```

- Says `Bourne-Again shell script ... executable` → you're fine, continue.
- Mentions **`CRLF line terminators`** → fix it before going further:

```bash
sed -i 's/\r$//' scripts/*.sh
```

To avoid it permanently on this machine:

```bash
git config --global core.autocrlf input
```

---

## Part 3 — Path A: run it now (no blockchain)

Make sure **Docker Desktop is running**, then:

```bash
./scripts/start.sh --mock
```

First run takes about two minutes, mostly npm installs. Later runs take seconds.

### What that command does

| Step | What happens |
|---|---|
| 1 | Checks Docker is running and Node is 20+ |
| 2 | Creates `backend/.env` — copies the example, **generates a real random `JWT_SECRET`**, points `DATABASE_URL` at the Docker database |
| 3 | Installs npm dependencies (skipped if `node_modules` already exists) |
| 4 | Starts the PostgreSQL container and **waits for its healthcheck to go green** |
| 5 | Applies database migrations |
| 6 | Seeds demo data — **only if the database is empty** |
| 7 | Starts the backend on port 3000, then checks it survived startup |
| 8 | Starts the frontend on port 5173 |

### When it's ready

```
══ Running ══
  Portal      http://localhost:5173
  API         http://localhost:3000
  API docs    http://localhost:3000/docs
  Ledger      mock
```

**Leave this terminal open.** `Ctrl-C` stops the backend and frontend. PostgreSQL keeps running in
Docker — stop that separately with `./scripts/stop.sh`.

> **Before you close this terminal, scroll up and copy the enrollment token.** You need it to sign
> in — see [Part 5](#part-5--your-first-sign-in).

---

## Part 4 — Path B: the full Hyperledger Fabric stack

Only attempt this once Path A works.

### 4.1 Install fabric-samples

**On Windows this must go inside WSL2**, not on the Windows filesystem. Fabric's `network.sh` is a
Linux script driving Linux Docker.

Open a **WSL/Ubuntu terminal** (run `wsl` from PowerShell, or launch the Ubuntu app):

```bash
cd ~
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 docker samples binaries
```

This downloads `~/fabric-samples` and pulls six Docker images (~2 GB). On macOS/Linux, run the same
commands in your normal terminal.

Verify:

```bash
ls ~/fabric-samples/test-network      # should list network.sh
docker images | grep hyperledger      # should list six images
```

### 4.2 Start everything

Back in **Git Bash**, in the repo folder:

```bash
./scripts/start.sh --fabric
```

This does everything Path A does, **plus**:

| Step | What happens |
|---|---|
| a | On Windows, notices `fabric-samples` lives in WSL and **re-runs itself there automatically** |
| b | Starts the two-organisation network with Certificate Authorities, creates channel `mychannel` |
| c | Deploys `IdentityContract` + `AuditContract` to **both** organisations |
| d | Copies three gateway certificates into `backend/fabric-network/` |
| e | Sets `LEDGER=fabric` in `backend/.env` |

First run takes 10–15 minutes. Most of that is the chaincode being packaged, installed, approved by
both organisations, and committed.

### 4.3 Three things to know

**Restarting is safe.** `./scripts/start.sh --fabric` **reuses** a network that is already running.
It does not destroy the ledger. That is deliberate — restarting your app is routine, wiping a
blockchain is not.

**`--recreate` destroys everything:**

```bash
./scripts/start.sh --fabric --recreate    # tears the network down first
```

Every identity anchor and audit record is permanently gone. You must re-seed afterwards or nobody
can log in.

**Expect it to be slower.** A login takes roughly 3.3 seconds on Fabric versus 0.3 seconds on mock.
That is not a bug: every write is endorsed by both organisations, ordered, and committed into a
block, and the test network's batch timeout alone is 2 seconds. Use `--mock` for day-to-day work.

---

## Part 5 — Your first sign-in

Open **http://localhost:5173**.

| Account | Password | What it can do |
|---|---|---|
| `SU/CS/2023/0187` | `demo1234` | Student — dashboard, courses, fees, results |
| `SU/IT/ADMIN/001` | `demo1234` | Admin — the audit trail and integrity verifier |

### You will be asked for an enrollment token. This is expected.

The first sign-in from any new computer is, by definition, from an **unrecognised device**. The Zero
Trust engine raises a step-up challenge, and because the account has no authenticator app bound yet,
it asks for the **registrar's one-time enrollment token** first.

This models real life: the token is something the registrar hands over in person, deliberately *not*
down the same channel as the password. It is what stops someone with a stolen password from binding
their own phone to your account.

### For the student account

The token is printed by the seed script. Scroll up in the terminal where you ran `start.sh`:

```
  Enrollment token for the demo student — this is what the registrar would hand
  the student in person, NOT down the same channel as the password. It is needed
  once, to bind an authenticator app, and it is consumed on first use:

      SU/CS/2023/0187   K7RM-P4XW-9TJD
```

Missed it? Re-print by re-seeding — **but read the Fabric warning below first**:

```bash
cd backend && npm run db:seed
```

### For the admin account — read this, it is not obvious

**The seed script does not print the admin's enrollment token.** It generates one and stores it, but
only the student's is echoed to the terminal. Since tokens are never exposed over the API, and the
admin's first login always raises a step-up, you cannot reach the audit/research view without
looking the token up directly in the database:

```bash
docker exec -it ziam-postgres psql -U ziam -d blockchain
```

Then at the `blockchain=#` prompt:

```sql
SELECT "studentId", "enrollmentToken" FROM "Student" WHERE role = 'ADMIN';
\q
```

The double quotes matter — Prisma creates case-sensitive table and column names.

> ⚠️ **On Fabric (Path B), never re-seed a database that already has data.** Seeding regenerates
> every password hash, while the on-chain identity anchors still commit to the old ones. Every login
> is then refused with `identity_mismatch` — the system correctly reporting tampering it caused
> itself. See [Part 11](#login-fails-with-identity_mismatch).

### Then, for either account

1. Enter the token → a QR code appears.
2. Scan it with **Google Authenticator**, **Microsoft Authenticator**, **Authy**, or any TOTP app.
3. Enter the 6-digit code. That single code both binds the app and clears the challenge.

From then on that device is recognised and logins go straight through.

---

## Part 6 — Check everything works

```bash
# The API is alive, and reports which ledger is active
curl http://localhost:3000/health
# {"status":"ok","ledger":"mock","env":"development"}
```

Interactive API documentation: **http://localhost:3000/docs**

### Run the tests

```bash
cd backend
npm run test:e2e     # backend must be running in another terminal
```

This drives the real running backend over HTTP — no mocks — and asserts that the security behaviour
actually holds. Takes about a minute; one check waits for a real background monitor tick.

```bash
npm run test:fabric  # Path B only — and STOP the backend first
```

> Stop the backend before `test:fabric`. It writes to the ledger directly, and if the backend is also
> running, its continuous monitor is appending to the same chain from another process. Both contend
> for a single chain-tip key and one loses with `MVCC_READ_CONFLICT`.

### Run the attack simulation and metrics

```bash
cd backend
npm run sim          # six scripted attack scenarios against the live system
npm run evaluate     # TAR/FAR/FRR, attack resistance, audit integrity, CES
```

Open `backend/evaluation/results/metrics-latest.html` in a browser for the dashboard.

---

## Part 7 — Docker configuration, completely

### 7.1 What Docker runs here

Two **separate** jobs. Don't confuse them:

| Job | Defined by | Started by |
|---|---|---|
| **PostgreSQL** — the app database | `docker-compose.yml` in this repo | `scripts/start.sh` |
| **Hyperledger Fabric** — the blockchain | `fabric-samples/test-network` (Hyperledger's own scripts) | `scripts/fabric-up.sh` |

### Why the backend is not in Docker

The Fabric peers publish themselves on **your machine's** `localhost:7051`. Inside a container,
`localhost` means *the container itself* — so a containerised backend simply cannot reach the
blockchain.

The workarounds are worse than the problem. Host networking is Linux-only, which would break the
WSL2 + Docker Desktop setup this project targets; joining the test network's own Docker network by
name couples this repo to `fabric-samples`' internal naming, which changes between releases.

So the one component with no such constraint — the database — is containerised, and the rest runs on
the host. This reasoning is recorded at the top of `docker-compose.yml`.

### 7.2 The PostgreSQL container, line by line

```yaml
services:
  postgres:
    image: postgres:16-alpine        # PostgreSQL 16 on a small Alpine base
    container_name: ziam-postgres    # fixed name so the scripts can find it
    restart: unless-stopped          # survives a reboot
    environment:
      POSTGRES_USER: ziam
      POSTGRES_PASSWORD: ziam_dev_password
      POSTGRES_DB: blockchain
    ports:
      - '55432:5432'                 # host 55432 → container 5432
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ziam -d blockchain']
      interval: 3s
      timeout: 5s
      retries: 20
      start_period: 5s

volumes:
  postgres-data:
    name: ziam-postgres-data
```

**Why port 55432 rather than the standard 5432?** This is a bug that was hit and fixed. Many
developer machines already run PostgreSQL locally on 5432. On Windows, Docker will happily publish
onto the same port instead of refusing to bind — and `localhost:5432` then resolves to whichever
bound first. The app silently connects to the **wrong database** and fails with an authentication
error that points nowhere near the real cause. An unlikely port makes the stack self-contained.

**Why the healthcheck?** PostgreSQL accepts TCP connections for a short window *before* it will
answer queries. Migrating inside that window fails confusingly. `start.sh` blocks on this check.

**Why a named volume?** So `docker compose down` stops the database without destroying your data.
Only `docker compose down -v` deletes it.

### 7.3 Database container commands

```bash
# Start / stop
docker compose up -d postgres
docker compose down                 # stop, KEEP data
docker compose down -v              # stop, DELETE all data

# Status and logs
docker compose ps
docker inspect -f '{{.State.Health.Status}}' ziam-postgres    # expect: healthy
docker compose logs -f postgres

# Open a SQL prompt
docker exec -it ziam-postgres psql -U ziam -d blockchain
#   \dt           list tables
#   \d "Student"  describe a table  (quotes matter — names are case-sensitive)
#   \q            quit

# One-off query
docker exec ziam-postgres psql -U ziam -d blockchain -c 'SELECT COUNT(*) FROM "Student";'

# Backup and restore
docker exec ziam-postgres pg_dump -U ziam blockchain > backup.sql
docker exec -i ziam-postgres psql -U ziam -d blockchain < backup.sql
```

### 7.4 The Fabric containers

With the blockchain running, **eight** containers are up:

| Container | Role |
|---|---|
| `peer0.org1.example.com` | Org1 (University IT) peer — endorses and commits |
| `peer0.org2.example.com` | Org2 (Registrar) peer — endorses and commits |
| `orderer.example.com` | Orders transactions into blocks |
| `ca_org1` | Certificate authority for Org1 |
| `ca_org2` | Certificate authority for Org2 |
| `ca_orderer` | Certificate authority for the ordering service |
| `dev-peer0.org1…-ziam_1.0` | The chaincode running on Org1's peer |
| `dev-peer0.org2…-ziam_1.0` | The same chaincode on Org2's peer |

**Both chaincode containers matter.** The endorsement policy requires both organisations to
independently run each transaction and agree. That is what makes a record here a two-party agreement
rather than one server's claim. A single peer could be compromised; two independently endorsing peers
is what the audit trail actually rests on.

Both organisations share one application channel: `mychannel`.

### 7.5 The Fabric images

```
hyperledger/fabric-peer:2.5.16       the peer nodes
hyperledger/fabric-orderer:2.5.16    the ordering service
hyperledger/fabric-ca:1.5.17         certificate authorities
hyperledger/fabric-ccenv:2.5.16      chaincode build environment
hyperledger/fabric-baseos:2.5.16     base image for chaincode containers
hyperledger/fabric-nodeenv:2.5       Node.js chaincode runtime
```

`install-fabric.sh` pulls all of them. **Note the last one:** `fabric-nodeenv` is required *because
this project's chaincode is JavaScript*. Its absence is a common cause of chaincode that packages
fine and then fails to start. Images come from Docker Hub under plain `hyperledger/`, **not**
`ghcr.io/hyperledger/`.

### 7.6 Fabric networking

Docker creates an isolated virtual network for the Fabric containers:

- **peer ↔ peer** — gossip and state transfer between organisations
- **peer ↔ orderer** — submitting transactions, receiving blocks
- **peer / orderer ↔ CA** — identity enrolment and TLS certificates
- **backend ↔ peer** — the Express server via the Fabric Gateway SDK

Only that last hop crosses the container boundary, and it has two gotchas:

1. The peer publishes on your **host's** `localhost:7051` — hence the backend runs on the host.
2. The peer's TLS certificate is issued to `peer0.org1.example.com`, **not** `localhost`. Dialling
   `localhost` without an SNI override fails the TLS handshake even though the connection itself is
   fine. That is what `FABRIC_PEER_HOST_ALIAS` in `backend/.env` is for.

### 7.7 Inspecting Fabric

```bash
docker ps                                          # 8 containers when up
docker images | grep hyperledger                   # the six images

docker logs peer0.org1.example.com --tail 100
docker logs orderer.example.com --tail 100
docker logs $(docker ps --format '{{.Names}}' | grep dev-peer0.org1)   # chaincode logs

docker network ls
docker network inspect fabric_test
```

### 7.8 Housekeeping

```bash
docker system df          # how much disk Docker is using
docker system prune       # remove stopped containers, unused networks, dangling images
docker volume ls          # look for ziam-postgres-data
docker stats              # live CPU/memory per container
```

> Be careful with `docker system prune -a --volumes` — it removes **everything** unused on the
> machine, including your database volume.

### 7.9 Commands that destroy data

| Command | What it destroys |
|---|---|
| `docker compose down -v` | The entire PostgreSQL database |
| `./scripts/stop.sh --purge` | Same |
| `./scripts/fabric-down.sh` | The entire blockchain — all anchors, all audit records |
| `./scripts/start.sh --fabric --recreate` | Same — it tears the network down first |
| `npm run db:reset` | Wipes and re-seeds the database |
| `docker system prune -a --volumes` | Every unused image, container and volume on the machine |

---

## Part 8 — Stopping and cleaning up

```bash
Ctrl-C                        # stops the backend and frontend
./scripts/stop.sh             # stops PostgreSQL, KEEPS the data
./scripts/stop.sh --fabric    # also tears down the blockchain
./scripts/stop.sh --purge     # stops PostgreSQL and DELETES its volume
```

`fabric-down.sh` also deletes the copied certificates from `backend/fabric-network/`. That matters:
leaving them behind makes the next Fabric start fail with a TLS error that looks like a config
problem, when the real cause is that the network was destroyed.

### Complete removal

```bash
./scripts/stop.sh --purge --fabric
docker system prune -a --volumes       # careful: affects your whole machine
cd .. && rm -rf Blockchain_Identity_Verification
```

---

## Part 9 — Doing it manually, without the scripts

Useful if a script fails and you want to see each step.

```bash
# 1 — Database
docker compose up -d postgres
docker inspect -f '{{.State.Health.Status}}' ziam-postgres     # wait for: healthy

# 2 — Backend config
cd backend
cp .env.example .env
```

Now edit `backend/.env` and set two values:

```bash
DATABASE_URL="postgresql://ziam:ziam_dev_password@localhost:55432/blockchain?schema=public"
JWT_SECRET="<paste the output of the command below>"
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
# 3 — Backend
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed              # prints the student's enrollment token — copy it
npm run dev                  # port 3000

# 4 — Frontend, in a second terminal
cd frontend
npm install
npm run dev                  # port 5173
```

`frontend/.env` is committed and already points at `http://localhost:3000`, so no edit is needed.

> `DATABASE_URL` must use port **55432**. Using 5432 is the single most common setup mistake.

---

## Part 10 — Showing it to someone on another machine

To let someone else try the running system without deploying anything, expose your machine with a
**Cloudflare Quick Tunnel** — free, no account, no card, no domain.

1. Download `cloudflared-windows-amd64.exe` from the
   [cloudflared releases page](https://github.com/cloudflare/cloudflared/releases/latest) and rename
   it to `cloudflared.exe`.

2. With the stack already running:

```bash
cloudflared.exe tunnel --url http://localhost:5173      # the portal
cloudflared.exe tunnel --url http://localhost:3000      # the API, in a second terminal
```

3. Each prints a `https://<random-words>.trycloudflare.com` URL.

### Two configuration changes are required first

Out of the box this **will not work**. Both of these are verified failures, not theoretical:

**a) Vite blocks unknown hostnames.** Vite 5.4.12+ rejects any request whose `Host` header it does
not recognise (a DNS-rebinding defence). Every visitor gets `403 Blocked request` before the app
runs. Add `allowedHosts` to the `server` block of `frontend/vite.config.ts`:

```ts
server: {
  port: 5173,
  open: true,
  allowedHosts: ['.trycloudflare.com'],
},
```

> **Important:** this repo also contains a generated `frontend/vite.config.js`, and **Vite loads the
> `.js` file in preference to the `.ts` file**. Editing only the `.ts` will appear to do nothing.
> Either delete `vite.config.js` and `vite.config.d.ts` first, or make the same edit in the `.js`.

**b) CORS rejects the tunnel origin.** The backend only allows origins listed in `CORS_ORIGIN`. Add
the portal's tunnel URL to `backend/.env` and restart the backend:

```bash
CORS_ORIGIN=http://localhost:5173,https://happy-river-green.trycloudflare.com
```

Then point the frontend at the API tunnel in `frontend/.env` and restart it:

```bash
VITE_API_URL=https://blue-ocean-tree.trycloudflare.com
```

### Caveats

- Your machine must stay on, with Docker and the stack running.
- Both URLs change every time you restart the tunnels — which means redoing the `CORS_ORIGIN` and
  `VITE_API_URL` edits each time.
- Anyone with the link can reach the app, **including the admin account with a known password**.
  Stop the tunnels when you're done.

---

## Part 11 — Troubleshooting

### The scripts fail with `$'\r': command not found`

Windows line endings — see [Part 2](#-windows-users-do-this-check-first).

```bash
sed -i 's/\r$//' scripts/*.sh
```

### "Docker is installed but not running"

Start Docker Desktop and wait for the whale icon to settle. Confirm with `docker info`.

### "PostgreSQL did not become healthy within 90s"

```bash
docker compose logs postgres
```

Usually a port conflict or a corrupted volume. Reset (this deletes data):

```bash
docker compose down -v && docker compose up -d postgres
```

### `EADDRINUSE` — port 3000 or 5173 already in use

The stack is already running in another terminal. Stop it there with `Ctrl-C`, or find the process:

```bash
netstat -ano | findstr :3000        # Windows — note the PID, then: taskkill /PID <pid> /F
lsof -ti:3000 | xargs kill          # macOS / Linux
```

### The backend exits immediately at startup

Read the output just above the exit. Almost always one of:

- `DATABASE_URL` pointing at port 5432 instead of **55432**
- Missing `JWT_SECRET`
- `LEDGER=fabric` with no network running, or stale certificates in `backend/fabric-network/`

### Login fails with `identity_mismatch`

The stored password hash no longer matches the on-chain identity anchor — almost always because the
database was re-seeded while a live Fabric ledger still held the **old** anchors.

```bash
./scripts/fabric-down.sh                  # destroy the old chain
./scripts/start.sh --fabric --seed        # fresh chain, fresh data
```

This cannot happen on mock, because seeding clears the mock ledger tables in the same run.

### The browser says "Cannot reach the server"

Check the API is up: `curl http://localhost:3000/health`. If it answers, check `CORS_ORIGIN` in
`backend/.env` includes the port Vite actually chose — it falls back to 5174 or 5175 if 5173 is
taken, and the browser console will say so explicitly.

### Can't get into the admin account

The admin's enrollment token is not printed by the seed. Look it up in the database — see
[Part 5](#for-the-admin-account--read-this-it-is-not-obvious).

### `scripts/fabric-up.sh` can't find the test network

On Windows, `fabric-samples` must be at `~/fabric-samples` **inside WSL2**. The script detects this
and hands off automatically. For a checkout elsewhere:

```bash
FABRIC_SAMPLES=/path/to/fabric-samples ./scripts/fabric-up.sh
```

### Chaincode deploys but won't start

Usually the missing `hyperledger/fabric-nodeenv` image:

```bash
docker images | grep nodeenv
docker logs $(docker ps -aq --filter name=dev-peer0.org1)
```

### `MVCC_READ_CONFLICT` in the logs

Two processes appending to the chain at once. Stop the backend before `npm run test:fabric`.
Occasional conflicts under normal load are retried automatically and are harmless.

### Editing `frontend/vite.config.ts` has no effect

A generated `frontend/vite.config.js` sits beside it, and Vite loads the `.js` first. Delete
`vite.config.js` and `vite.config.d.ts`, or make your edit in the `.js` file.

---

## Appendix — Reference tables

### Ports

| Port | What |
|---|---|
| 5173 | React portal |
| 3000 | Express API (`/docs` for Swagger, `/health` for the health check) |
| 55432 | PostgreSQL (in Docker) |
| 7051 | Fabric peer (Path B only) |

### Accounts

| Account | Password | Role |
|---|---|---|
| `SU/CS/2023/0187` | `demo1234` | Student |
| `SU/IT/ADMIN/001` | `demo1234` | Admin — the only account that may read the audit trail |

Plus 29 synthetic students sharing the same password, used by the attack simulation. All data is
entirely synthetic.

### Script flags

```bash
./scripts/start.sh                     # use whatever LEDGER backend/.env says
./scripts/start.sh --mock              # force the mock ledger
./scripts/start.sh --fabric            # force Fabric, reusing a running network
./scripts/start.sh --fabric --recreate # DESTROYS the ledger, then rebuilds
./scripts/start.sh --seed              # force a re-seed
./scripts/start.sh --no-seed           # never seed

./scripts/stop.sh                      # stop PostgreSQL, keep data
./scripts/stop.sh --fabric             # also destroy the blockchain
./scripts/stop.sh --purge              # delete the database volume too

./scripts/fabric-up.sh                 # start/reuse the blockchain only
./scripts/fabric-down.sh               # destroy the blockchain
```

### Backend npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` | Generate the Prisma client and compile TypeScript |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check everything without emitting |
| `npm run db:migrate` | Create and apply a new migration |
| `npm run db:seed` | Wipe and re-seed demo data |
| `npm run db:reset` | Reset migrations and re-seed |
| `npm run db:studio` | Open Prisma Studio, a visual database browser |
| `npm run test:e2e` | End-to-end engine test |
| `npm run test:fabric` | Fabric ledger acceptance test |
| `npm run sim` | The six attack scenarios |
| `npm run evaluate` | Compute metrics and the CES |

### Frontend npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

### Key environment variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 3000 | API port |
| `CORS_ORIGIN` | `http://localhost:5173,5174,5175` | Must include the frontend's actual origin |
| `LEDGER` | `mock` | `mock` or `fabric` |
| `DATABASE_URL` | — | **Required.** Port **55432** |
| `JWT_SECRET` | — | **Required.** Generated automatically by `start.sh` |
| `JWT_EXPIRES_IN_HOURS` | 8 | Session lifetime |
| `FABRIC_MSP_ID` | `Org1MSP` | Read only when `LEDGER=fabric` |
| `FABRIC_PEER_ENDPOINT` | `localhost:7051` | Where the peer is |
| `FABRIC_PEER_HOST_ALIAS` | `peer0.org1.example.com` | TLS SNI override — required |
| `FABRIC_CHANNEL` | `mychannel` | Channel name |
| `FABRIC_CHAINCODE` | `ziam` | Chaincode name |
| `FABRIC_TLS_CERT_PATH` / `FABRIC_CERT_PATH` / `FABRIC_KEY_PATH` | `./fabric-network/*.pem` | Copied by `fabric-up.sh` |
