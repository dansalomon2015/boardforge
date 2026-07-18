# BoardForge

> Bring game night back, wherever everyone is.

The internet makes it easy to see and hear the people we care about. But a video call rarely feels like a real evening together. The little moments are missing: the nervous pause before an answer, the laughter when a mime goes terribly wrong, and the friendly arguments over who really won.

BoardForge was created to bring those moments back. It is a collection of social games made for friends and families, whether everyone is sitting around the same table or joining from different places.

A host picks a game, chooses an atmosphere and shares a room code. Everyone joins from their own phone or computer, with nothing to install. From that point on, every screen becomes part of the game: one player may receive a secret word, another may become the performer, and the whole room stays together through every turn, timer and score.

Each game has its own personality, visual world and way of using the device in your hand. OpenAI helps make a session feel personal by preparing content around the group’s chosen mood or topic. The rules themselves are carefully designed and tested, so the experience stays reliable and easy to understand.

BoardForge was built for the OpenAI Build Week hackathon around one simple idea: distance should not make game night feel distant.

## Included games

- **Movie Mime** — perform a movie without saying a word while your team races to guess it.
- **Word Trap** — help your team find a secret word without using any of the forbidden clues.
- **Draw Battle** — turn a secret idea into a drawing before the clock runs out.
- **Sound Check** — recreate a sound and hope your team understands what you mean.
- **Story Chain** — write one story together, with private twists that send it in unexpected directions.
- **Word Duel** — uncover your opponent’s hidden word one letter at a time before they uncover yours.
- **Second Sense** — trust your sense of time and survive each round by stopping closest to the target.

The collection includes twenty visual themes, so the same game can feel playful, cinematic, nostalgic or completely chaotic depending on the night.

## How a game night works

1. Choose the game you want to play.
2. Pick a theme and personalize the content when the game allows it.
3. Create a private room and share its six-character code.
4. Let everyone join from their own device.
5. Follow the instructions on screen and play together in real time.

## How it is built

BoardForge uses AI to prepare creative content, not to invent or execute game logic. Every game runs through a deterministic TypeScript engine, and the server decides what happens next. This keeps the rules consistent and prevents private information from appearing on the wrong player’s screen.

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

Design and delivery notes live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/GAME_NIGHT_PLAN.md](docs/GAME_NIGHT_PLAN.md), [docs/BACKLOG.md](docs/BACKLOG.md), [docs/DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md) and [docs/PROGRESS.md](docs/PROGRESS.md).

## Run locally

Requirements: Node.js 22+ and pnpm 11.7+.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open the web app at `http://localhost:3000`; API health is available at `http://localhost:4000/health`.

BoardForge can run with either of these content providers:

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

BoardForge currently includes seven playable games. Private rooms, real-time play, reconnection, persistent game state and production container builds are working. The project is now focused on polishing the experience, strengthening browser coverage and preparing the final hackathon demonstration.

## License

BoardForge is proprietary software and is **not open source**. The repository
is made available for review and hackathon evaluation only. No permission is
granted to use, copy, modify, redistribute, host, sell, or create derivative
works from the code without prior written authorization from the copyright
holder. See [LICENSE](LICENSE) for the complete terms.
