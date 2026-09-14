# SHÜÜT

A voice-note-first social feed where London founders publish short recordings, readable transcripts, and a growing cited record of how they think.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/shuut-app` — React web app and SHÜÜT visual system
- `artifacts/api-server/src/routes/shuut.ts` — feed, profile, post, reaction, follow, reshüüt, and Ask Me API
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `lib/db/src/schema/shuut.ts` — persistent founder and post data

## Architecture decisions

- Web first, mobile-first responsive UI; business data is exposed through a platform-neutral JSON API.
- The initial experience uses a seeded current founder so the social loop can be evaluated before full account onboarding is connected.
- Everyone is the default launch feed; Following is available but secondary during the community cold start.
- Recording uses the browser MediaRecorder API with a hard 90-second limit and an editable transcript before publish.

## Product

Founders can record and publish voice posts, scan a chronological transcript-first feed, react with the SHÜÜT reaction set, reshüüt, follow profiles, share direct post links, and ask a profile-scoped agent questions with source-post citations.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
