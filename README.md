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
npm run typecheck
npm test
npm run build
```

## Deploy to Vercel

Meri uses the standard Next.js build and does not require a custom Vercel
configuration. Configure `MOONSHOT_API_KEY` as a server-side secret in Vercel.
The optional server-side settings in `.env.example` can also be configured to
override their defaults. None of these variables should use the
`NEXT_PUBLIC_` prefix.

Trips currently use an in-memory repository. On Vercel, that data can be lost
when a function instance is recycled and is not shared reliably between
instances. This is suitable only for Step 5 testing; durable persistence is
deferred to Step 6.

The current installable foundation includes a web app manifest and Home Screen
icons. Offline behavior is intentionally not supported yet because Meri does
not have a service worker or offline cache.

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
