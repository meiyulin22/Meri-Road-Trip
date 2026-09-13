# Meri

Meri is a personal outdoor intelligence companion. This repository currently
contains the first, deliberately small foundation: a full-stack Next.js
application with a responsive landing page and a health endpoint.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The health endpoint is available at
[http://localhost:3000/api/health](http://localhost:3000/api/health).

## Validate

```bash
npm run lint
npm run build
```

## Project structure

```text
docs/             Product and architecture documents
src/app/          App Router pages, layouts, and route handlers
src/components/   Shared UI components
src/domain/       Meri domain concepts
src/lib/          Shared utilities
src/server/       Server-only application code
```

The domain, server, component, and library directories are intentionally empty
until a real product requirement needs them.
