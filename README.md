# BoardForge

> Not a rule generator — a playable game compiler.

BoardForge turns one natural-language game idea into a validated `GameSpec`, tests it with virtual players, and runs it in a deterministic multiplayer room.

This repository contains a working local slice for the OpenAI Build Week hackathon. The public product is prompt-first: the creator does not select a predefined game family, player count or duration. A model infers those properties and combines audited primitives—phases, actions, rules, cards, boards, resources, randomizers, private views, buzzers, ordering and matching—without ever generating executable behavior.

Historical hidden-role and quiz/vote engines remain only as internal compatibility fixtures and are no longer exposed on the landing page. `Cinema Charades` is the seeded version-2 `ComposedGameSpec` fallback.

## Non-negotiable product invariants

- GPT-5.6 returns structured data only; generated code is never evaluated or executed.
- Every `GameSpec` is validated before the engine can load it.
- The authoritative game engine is deterministic TypeScript running on the server.
- Multiplayer rooms update in real time.
- A player receives public state plus only that player's private view.
- The complete project starts locally with Docker Compose.

## Planning documents

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation backlog](docs/BACKLOG.md)
- [Delivery plan](docs/DELIVERY_PLAN.md)
- [Implementation progress](docs/PROGRESS.md)

## Run locally

Requirements: Node.js 22+ and pnpm 11.7+.

```bash
pnpm install
pnpm dev
```

Then open:

- web app: `http://localhost:3000`
- API health: `http://localhost:4000/health`

The app supports two explicitly labeled providers:

- `LLM_PROVIDER=openai`: live GPT-5.6 generation through the Responses API, JSON-constrained output and strict local validation;
- `LLM_PROVIDER=fake`: deterministic offline compiler for demos without API access.

Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and keep that local file out of version control.

Run the complete verification gate:

```bash
pnpm check
```

With the dev servers running, complete all three demo engines through real WebSocket clients:

```bash
pnpm smoke:multiplayer
```

Docker Compose is also available:

```bash
docker compose up --build
```

The Compose stack waits for PostgreSQL and the API health check before starting the standalone Next.js server. Generated rooms and accepted actions are restored from PostgreSQL when the server container restarts.

## Current implementation

- strict Zod `GameSpec` validation with unknown-field rejection;
- prompt-only creator surface plus one composed `Cinema Charades` fallback blueprint;
- deterministic server-side TypeScript reducers for both legacy templates and the composed engine;
- 20 parameterized visual themes and a reusable game-component library;
- closed schemas for flows, actions, rules, private cards, boards, resources, randomizers, buzzers, ordering and matching;
- semantic human-playability gate: every generated action must resolve to a compatible, audited room control before a spec can be released;
- generic room controls for choices, text, decks, hands, boards, resources, dice/spinners, buzzers, ordering, matching, challenges, drawing and media;
- AI-authored team slots and explicit policies supporting one or several people per team; real players choose their own team in the lobby;
- per-player hidden-state projection;
- Fastify API and Socket.IO room service;
- PostgreSQL-backed immutable blueprint revisions, playtest reports, structured AI critiques and balance patches, with idempotent startup migrations;
- rotating reconnect credentials: the browser stores the token, while the server keeps only its SHA-256 hash and rejects stale or cross-player sessions;
- revision-aware action envelopes with one idempotency key across every engine;
- append-only PostgreSQL room events, deterministic replay checksums and server-start room restoration;
- live GPT-5.6 provider plus deterministic offline provider behind `LlmProvider`;
- deterministic virtual-agent release gate: 24 simulations across valid player and team configurations before room creation;
- strict GPT critique with a verdict, evidence-backed issue categories and bounded recommendations for every generated revision;
- allowlisted `BalancePatch` revisions that are revalidated, replayed, critiqued and explicitly accepted before release;
- creator-facing immutable revision history with accepted, proposed and rejected branches plus safe selection of any prior `release_ready` version;
- visible GameSpec, phase, component, critique and before/after playtest evidence before room creation;
- mobile-first creator, lobby and game-room UI, verified without horizontal overflow at 390 × 844;
- unit tests and an automated multi-client WebSocket smoke test;
- production builds for web and server.

Blueprints, playtest reports, critiques, balance decisions, room snapshots and accepted actions survive server restarts in PostgreSQL. The server reconstructs each started room from its seed and append-only event stream, then verifies the stored checkpoint checksum before exposing it. Docker exposes BoardForge PostgreSQL on local port `5433` to avoid conflicts with an existing PostgreSQL on the conventional port.

## Status

Local P0 prototype with deterministic recovery, structured critique, constrained balance revisions, revision history and CI. Hosted deployment, server timers, browser regression coverage and submission evidence remain.

## License

BoardForge is licensed under the MIT license.
