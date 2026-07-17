# BoardForge

> A premium collection of social games, ready to play together.

BoardForge is a mobile-first multiplayer game night platform built for the OpenAI Build Week hackathon. Players choose a designed game, customize its visual theme and content, create a room, form teams when the game calls for them, and play from their own devices.

The public product is a curated game collection—not a universal game generator. Every game mechanic is implemented and tested in deterministic TypeScript. OpenAI is used only for bounded creative content, virtual-playtest critique and allowlisted balance suggestions; it never writes or executes game logic.

## Included games

- Movie Mime — team charades with AI-curated movie cards.
- Word Trap — describe a secret word without using its forbidden clues.
- Draw Battle — fast team drawing rounds.
- Sound Check — imitate sounds and let your team guess.
- Story Chain — build a shared story around private twists.
- Word Duel — discover your opponent's hidden word one letter at a time.
- Second Sense — an elimination game of timing and intuition.

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

With both development servers running, exercise the real multiplayer protocol:

```bash
pnpm smoke:multiplayer
```

Run the reproducible stack with PostgreSQL:

```bash
docker compose up --build
```

PostgreSQL is exposed on local port `5433`. Blueprints, rooms, rotating reconnect credentials, accepted actions and append-only room events survive server restarts.

## Status

The seven-game local collection, deterministic simulations, real-time rooms, persistence, reconnect flow and production builds are operational. The remaining hackathon work is quality hardening, browser regression coverage, hosted deployment and submission evidence.

## License

BoardForge is licensed under the MIT license.
