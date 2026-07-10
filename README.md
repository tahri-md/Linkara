<p align="center">
  <img src="assets/linkara-logo.png" alt="Linkara logo" width="120" height="120">
</p>

<h1 align="center">Linkara</h1>

<p align="center">
  Self-hosted CI/CD pipeline automation — define workflows, run them in Docker, watch them live.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/backend-Node.js%20%2F%20TypeScript-33ffa3?style=flat-square&labelColor=0a100f">
  <img src="https://img.shields.io/badge/frontend-Next.js%2016-33ffa3?style=flat-square&labelColor=0a100f">
  <img src="https://img.shields.io/badge/license-MIT-33ffa3?style=flat-square&labelColor=0a100f">
</p>

---

Linkara lets teams define workflows made of containerized jobs, trigger them manually, on a schedule, via webhook, or via API, execute them against Docker, and monitor runs, logs, and artifacts through a web dashboard.

The project has two parts:

- **Backend** (`backend/`) — a TypeScript/Node.js GraphQL API built on Apollo Server, backed by PostgreSQL and Redis, with job execution handled by BullMQ workers running against Docker.
- **Frontend** (`frontend/`) — a Next.js 16 / React 19 dashboard that talks to the backend over GraphQL.

The whole stack (Postgres, Redis, Docker-in-Docker, backend, and frontend) can be run with a single `docker compose up --build`, or each part can be run natively — see [Getting Started](#getting-started).

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Database](#database)
- [Architecture Notes](#architecture-notes)
- [License](#license)

## Features

- **Workflow definition and validation** — define multi-job workflows with dependencies between jobs, retry counts, and timeouts; dependency graphs are validated server-side (including circular-dependency detection).
- **Pipeline execution** — jobs run inside Docker containers, orchestrated through a BullMQ job queue with configurable concurrency and retry/backoff behavior.
- **Multiple trigger types** — workflows can be triggered manually, on a schedule, via inbound webhook, or via the API.
- **Live logs and artifacts** — job logs are streamed and stored per run; build/test artifacts produced by jobs can be retrieved per job.
- **Organizations and multi-tenancy** — resources are scoped to organizations, with support for org invites.
- **Role-based access control (RBAC)** — permission checks are enforced at the resolver level for organization-scoped actions.
- **Secrets management** — sensitive values (API keys, credentials used by pipelines) are stored encrypted at rest.
- **Webhooks** — outbound webhooks can be configured per organization to notify external systems of pipeline events.
- **Notifications** — email and Slack integrations for pipeline and workflow events (Slack/GitHub integrations are present in configuration but not yet wired into the codebase — see [Environment Variables](#environment-variables)).
- **Authentication** — JWT-based authentication with signup/login flows on the frontend.

## Tech Stack

### Backend

- Node.js with TypeScript (ESM)
- Apollo Server 4 (GraphQL API), served over Express
- PostgreSQL (via `pg`), with hand-written SQL migrations
- Redis, accessed through `ioredis`
- BullMQ for the job queue and worker processes
- Dockerode for programmatic control of Docker (running job containers)
- JSON Web Tokens for authentication, bcrypt for password hashing
- Nodemailer for email notifications, `@slack/web-api` for Slack notifications

### Frontend

- Next.js 16 (App Router, Turbopack)
- React 19
- Tailwind CSS 4
- Radix UI primitives with a small local component library (`components/ui`)
- React Hook Form with Zod for form validation
- `graphql-request` for talking to the backend GraphQL API

## Project Structure

```
Linkara-main/
├── backend/                       # Backend (Node.js/TypeScript)
│   ├── src/
│   │   ├── index.ts               # Express + Apollo server entrypoint
│   │   ├── config/                # Apollo and queue configuration
│   │   ├── middleware/            # Auth middleware
│   │   ├── services/               # Business logic (one service per domain)
│   │   ├── graphql/
│   │   │   ├── types/             # GraphQL SDL type definitions (.graphql)
│   │   │   ├── resolvers/         # Resolver implementations
│   │   │   └── schema.ts          # Combines type defs into the executable schema
│   │   ├── queue/                 # BullMQ queue setup, Redis connection, worker
│   │   ├── models/                # TypeScript types/interfaces for DB entities
│   │   ├── db/
│   │   │   ├── migrations/        # Numbered SQL migration files + runner
│   │   │   ├── connection.ts      # PostgreSQL connection pool
│   │   │   └── seed.ts            # Development seed data
│   │   └── utils/                 # Encryption and permission helpers
│   ├── Dockerfile.dev             # Dev container (hot-reload via nodemon)
│   └── .env.example               # Backend environment variable reference
├── frontend/                      # Frontend (Next.js app)
│   ├── app/
│   │   ├── (auth)/                # Login and signup pages
│   │   ├── (dashboard)/           # Authenticated app: dashboard, workflows,
│   │   │                          # runs, organizations, invites
│   │   ├── components/            # Shared React components (incl. ui/ primitives)
│   │   └── lib/                   # GraphQL client, app state, formatting helpers
│   ├── middleware.ts               # Route protection
│   └── Dockerfile.dev              # Dev container (hot-reload via next dev)
├── docker-compose.yml              # Postgres, Redis, Docker-in-Docker, backend, frontend
└── README.md
```

## Prerequisites

- Docker and Docker Compose (this covers everything — Postgres, Redis, Docker-in-Docker, backend, and frontend)
- Node.js 18+ and npm 9+ only if you plan to run the backend or frontend natively instead of via Docker

## Getting Started

### Option A: Run everything with Docker Compose (recommended)

1. **Clone the repo**

   ```bash
   git clone https://github.com/tahri-md/Linkara.git
   cd Linkara-main
   ```

2. **Configure backend environment variables**

   ```bash
   cp backend/.env.example backend/.env
   ```

   Fill in at minimum `JWT_SECRET` and `ENCRYPTION_KEY` (the backend refuses to boot without them — generate one with `openssl rand -base64 32`). The database/Redis/Docker host values in this file are overridden automatically by `docker-compose.yml` when running in containers, so you don't need to edit those.

3. **Build and start everything**

   ```bash
   docker compose up --build
   ```

   This starts, in order: PostgreSQL, Redis, a Docker-in-Docker container (used to run pipeline job containers), the backend API, and the frontend.

   - Frontend: `http://localhost:3000`
   - Backend GraphQL API: `http://localhost:4000/graphql`
   - Backend health check: `http://localhost:4000/health`

4. **Run database migrations** (first run only, in a separate terminal)

   ```bash
   docker compose exec backend npm run db:migrate
   docker compose exec backend npm run db:seed   # optional, adds development sample data
   ```

Backend and frontend source are bind-mounted into their containers, so code changes hot-reload without rebuilding.

### Option B: Run natively (no Docker for backend/frontend)

1. **Install dependencies**

   ```bash
   git clone https://github.com/tahri-md/Linkara.git
   cd Linkara-main

   # Backend
   cd backend && npm install --legacy-peer-deps && cd ..

   # Frontend
   cd frontend && npm install && cd ..
   ```

2. **Start supporting services only** (Postgres, Redis, Docker-in-Docker)

   ```bash
   docker compose up -d postgres redis docker-dind
   ```

3. **Configure environment variables**

   ```bash
   cp backend/.env.example backend/.env
   ```

   Fill in the values described in [Environment Variables](#environment-variables) below. At minimum, `JWT_SECRET` and `ENCRYPTION_KEY` must be set or the backend will refuse to start. Since you're running natively, `DATABASE_HOST`/`REDIS_HOST` should stay as `localhost` (matching the ports Compose exposes on the host).

4. **Run database migrations and seed data**

   ```bash
   cd backend
   npm run db:migrate
   npm run db:seed   # optional, adds development sample data
   ```

5. **Start the backend**

   ```bash
   npm run dev
   ```

   The GraphQL API is served at `http://localhost:4000/graphql` by default, with a health check at `http://localhost:4000/health`.

6. **Start the frontend**

   ```bash
   cd frontend
   npm run dev
   ```

   The dashboard is served at `http://localhost:3000` by default.

## Environment Variables

Full reference lives in `backend/.env.example`. Summary:

### Backend (required)

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | Signing secret for authentication tokens. Server exits on boot if unset. |
| `ENCRYPTION_KEY` | Key used to encrypt stored secrets. Server exits on boot if unset. |

### Backend (commonly configured)

| Variable | Description |
| --- | --- |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | PostgreSQL connection details. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Redis connection details, used by the job queue. |
| `PORT` | Port the API server listens on (default `4000`). |
| `API_BASE_URL`, `APP_BASE_URL` | Used to build links in emails/notifications. |
| `JWT_EXPIRATION` | Token lifetime, e.g. `24h`. |
| `EMAIL_FROM`, `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASSWORD` | Outbound email notification settings. |
| `DOCKER_HOST` | Docker socket/endpoint used to run job containers. Natively: leave as `unix:///var/run/docker.sock` (or unset) to use your local Docker daemon. Under Docker Compose: set to `http://docker-dind:2375` (already set in `docker-compose.yml`) — use `http://`, not `tcp://`, since dockerode's underlying client only recognizes `http`/`https`. |
| `JOB_EXECUTION_CONCURRENCY`, `LOG_PROCESSING_CONCURRENCY`, `QUEUE_DEFAULT_ATTEMPTS`, `QUEUE_DEFAULT_BACKOFF_MS` | Queue and worker tuning. |

### Backend (reserved, not yet used by the code)

`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` are present for planned integrations but not currently read anywhere in the backend.

### Frontend

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_GRAPHQL_URL` | URL of the backend GraphQL endpoint, e.g. `http://localhost:4000/graphql`. |

## Available Scripts

### Backend (run from `backend/`)

| Script | Description |
| --- | --- |
| `npm run dev` | Run the API server with auto-reload via nodemon/ts-node. |
| `npm run build` | Compile TypeScript to `dist/` and copy SQL/GraphQL assets. |
| `npm start` | Run the compiled server from `dist/`. |
| `npm test` | Run the Jest test suite. |
| `npm run lint` | Run ESLint over `src/`. |
| `npm run format` | Format `src/` with Prettier. |
| `npm run db:migrate` | Apply SQL migrations in `src/db/migrations/`. |
| `npm run db:seed` | Insert development seed data. |

### Frontend (run from `frontend/`)

| Script | Description |
| --- | --- |
| `npm run dev` | Run the Next.js development server. |
| `npm run build` | Build the production bundle. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run Next.js's linting. |
| `npm run typecheck` | Run the TypeScript compiler with no output. |

## Database

Schema changes are managed through numbered SQL migration files in `backend/src/db/migrations/`, applied in order by `backend/src/db/migrations/run.ts`. Current migrations cover: enums, initial schema, users, organizations, workflows, pipelines and jobs, secrets, webhooks, notifications, RBAC, tenancy, deployments, and organization invites.

## Architecture Notes

- The GraphQL schema is split by domain into separate `.graphql` files under `backend/src/graphql/types/`, combined in `backend/src/graphql/schema.ts`, with one resolver module per domain under `backend/src/graphql/resolvers/`.
- Job execution is asynchronous: workflow runs are enqueued onto BullMQ queues (`backend/src/queue/queues.ts`) and processed by a worker (`backend/src/queue/worker.ts`) that uses Dockerode to run each job's container image and command.
- Authorization is enforced per-organization: resolvers that touch organization-scoped data check the requesting user's membership/role via `RbacService` and helpers such as `userCanAccessOrganization` before proceeding.
- The frontend uses the Next.js App Router with route groups: `(auth)` for unauthenticated pages and `(dashboard)` for the authenticated application, with `middleware.ts` guarding dashboard routes.

## License

MIT