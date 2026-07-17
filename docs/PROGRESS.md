# Implementation progress

## 17 July 2026 — Curated game collection

BoardForge now ships as a curated multiplayer game-night platform. The universal prompt-to-game experiment and its compilation API have been removed.

Completed and verified:

- seven authored games: Movie Mime, Word Trap, Draw Battle, Sound Check, Story Chain, Word Duel and Second Sense;
- twenty reusable visual themes with bounded game-specific customization;
- OpenAI restricted to typed content packs, structured playtest critique and allowlisted balance suggestions;
- strict `ComposedGameSpec` validation with no generated or dynamically executed code;
- deterministic TypeScript reducers, explicit seeds, append-only events and replay checksums;
- player-specific projections that keep private words, cards and roles server-side;
- authoritative Socket.IO rooms with revision checks, idempotency keys and rotating reconnect credentials;
- player-selected teams and host-selected captains where a game requires them;
- deterministic virtual-agent release gates before a blueprint becomes room-ready;
- immutable blueprint revisions and PostgreSQL-backed room recovery;
- mobile-first game-specific setup and room experiences;
- development-only component lab excluded from production;
- modular HTTP routes, room runtime and real-time gateway with narrow injected interfaces;
- Biome formatting/linting, strict unused checks, Knip dead-code analysis and V8 coverage;
- HTTP and Socket.IO integration tests in the normal test suite.

## Verification

The release gate is:

```bash
pnpm check
```

It runs formatting, linting, strict TypeScript, all unit/integration tests, dead-code analysis and production builds.

Additional acceptance paths:

```bash
pnpm coverage
pnpm smoke:multiplayer
docker compose up --build
```

## Current deliberate limitations

- the public product does not invent new game mechanics from a prompt;
- live OpenAI content requires project quota; audited local catalogues provide a transparent fallback;
- active rooms run on one authoritative backend instance and recover from PostgreSQL after restart;
- room retention, event compaction and automated cleanup are not implemented;
- the legacy `hidden_roles` and `quiz_vote` engines remain internal compatibility fixtures only.

## Next release work

1. Add browser-level multi-client regression coverage for every public game.
2. Run the complete Docker Compose acceptance gate after the refactor.
3. Deploy the web, WebSocket backend and PostgreSQL database.
4. Record submission evidence and complete the hackathon compliance audit.
