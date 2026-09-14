# SHÜÜT

A voice-note-first social feed where people publish short recordings, readable transcripts, and a growing cited record of how they think.

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
- `lib/db/src/schema/shuut.ts` — persistent profile and post data

## Architecture decisions

- Web first, mobile-first responsive UI; business data is exposed through a platform-neutral JSON API.
- New accounts complete a two-step name and lowercase-username onboarding before any in-app navigation or feed content appears.
- Email codes establish account identity; every new session must then enroll or verify a passkey before any product API, feed, posting, or audio access.
- Development preview bypasses the passkey gate for faster owner testing; production builds and published APIs continue to require passkey verification.
- Publishing requires an owned voice recording but does not trigger an additional passkey prompt after the session has been verified.
- Voice recordings remain private in storage and are streamed only through authenticated, post-scoped API routes.
- Unsafe cookie-authenticated requests require matching Origin and CSRF proof; security-sensitive endpoints use database-backed rate limits and append-only audit events.
- Everyone is the default launch feed; Following is available but secondary during the community cold start.
- Recording uses the browser MediaRecorder API with a hard 90-second limit. Transcript preview is off by default and can be enabled per profile; otherwise transcription runs after submission and the complete text-and-audio post appears when ready.
- Authors can edit a published transcript from the post menu for 30 seconds after publication; the API enforces the ownership and time limit.

## Product

Members can record and publish voice posts, scan a chronological transcript-first feed, react with the SHÜÜT reaction set, reshüüt, follow profiles, share direct post links, and ask a profile-scoped agent questions with source-post citations.

## User preferences

- Use neutral audience language such as people, members, profiles, and usernames. Do not describe SHÜÜT as exclusively for founders.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
