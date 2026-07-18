# BoardForge

> Bring game night back, wherever everyone is.

The internet is remarkably good at putting people on the same call. It is less successful at recreating the spontaneity, suspense and shared laughter of a game night when family and friends cannot be in the same room.

BoardForge closes that gap. It is an immersive, mobile-first tabletop for playing together from anywhere. A host chooses a game and its atmosphere, shares a room code, and every player joins from their own device. Each screen becomes part of the table: revealing private clues, coordinating teams, capturing gestures and keeping every turn synchronized in real time.

The experience is designed to feel like a shared place rather than another video-call utility. Twenty visual worlds let the group shape the mood of the evening, while carefully crafted interactions preserve the tension and delight of playing face to face.

BoardForge is built for the OpenAI Build Week hackathon. Its games use authored and deterministic mechanics instead of AI-generated rules. OpenAI personalizes bounded creative content and supports virtual playtesting and balance critique, while the server remains authoritative over secrets, turns, timers, scores and winners.

## Included games

- Movie Mime - team charades with AI-curated movie cards.
- Word Trap - describe a secret word without using its forbidden clues.
- Draw Battle - fast team drawing rounds.
- Sound Check - imitate sounds and let your team guess.
- Story Chain - build a shared story around private twists.
- Word Duel - discover your opponent's hidden word one letter at a time.
- Second Sense - an elimination game of timing and intuition.

Twenty visual themes can be applied across the collection.

## Safety and architecture

- Strict Zod schemas reject unknown or invalid structured content.
- The server-authoritative engine owns state transitions, timers, scores and winners.
- LLM output is data only; generated code, formulas and scripts are never evaluated.
- Each player receives a server-built view containing only the information they may see.
- Actions are revisioned and idempotent.
- Explicit seeds and append-only events support deterministic replay.
- Virtual agents exercise each game before a blueprint becomes room-ready.

## Repository

```text
apps/web             Next.js mobile-first UI
apps/server          Fastify API and Socket.IO gateway
packages/game-spec   strict schemas, curated specs and content catalogues
packages/game-engine deterministic reducers, projections, simulations and replay
packages/llm         bounded content and review provider abstraction
packages/shared      transport contracts and shared utilities
```

Design and delivery notes live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/BACKLOG.md](docs/BACKLOG.md), [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md) and [docs/PROGRESS.md](docs/PROGRESS.md).

## Run locally

Requirements: Node.js 22+ and pnpm 11.7+.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open the web app at `http://localhost:3000`; API health is available at `http://localhost:4000/health`.

The provider is explicit:

- `LLM_PROVIDER=openai` uses the OpenAI Responses API for bounded game content and review.
- `LLM_PROVIDER=fake` uses deterministic local catalogues for offline development and repeatable tests.

Set `OPENAI_API_KEY` only in your local `.env`; environment files remain outside Git. `OPENAI_MODEL` selects the content model and `OPENAI_REVIEW_MODEL` can select a separate critique model. The app falls back safely to audited catalogue content when live content generation fails.

## Verify

```bash
pnpm check
```

The gate verifies Biome formatting/linting, strict TypeScript (including unused locals and parameters), all tests, Knip dead-code analysis and production builds. Run `pnpm coverage` for the V8 coverage report.

With both development servers running, exercise the real multiplayer protocol:

```bash
pnpm smoke:multiplayer
```

Run the reproducible stack with PostgreSQL:

```bash
docker compose up --build
```

PostgreSQL is exposed on local port `5433`. Blueprints, rooms, rotating reconnect credentials, accepted actions and append-only room events survive server restarts.

## Deploy

Production uses the same container boundaries as local development on a single Ubuntu EC2 instance, with Caddy providing HTTPS and GitHub Actions handling configuration, verification and deployment. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the AWS prerequisites, required GitHub secrets, first-time setup, deployment and rollback procedures.

## Status

The seven-game local collection, deterministic simulations, real-time rooms, persistence, reconnect flow and production builds are operational. The remaining hackathon work is quality hardening, browser regression coverage, hosted deployment and submission evidence.

## License

BoardForge is proprietary software and is **not open source**. The repository
is made available for review and hackathon evaluation only. No permission is
granted to use, copy, modify, redistribute, host, sell, or create derivative
works from the code without prior written authorization from the copyright
holder. See [LICENSE](LICENSE) for the complete terms.
