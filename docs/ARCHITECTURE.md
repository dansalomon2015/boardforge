# BoardForge architecture

## 1. Product model

BoardForge is a curated multiplayer game-night platform:

```text
Curated game + player customization
                 |
                 v
Strict setup and content validation
                 |
                 v
Deterministic virtual-agent release gate
                 |
                 v
Server-authoritative multiplayer room
                 |
                 v
Player-specific real-time views
```

Game mechanics are designed in the repository and interpreted by fixed TypeScript reducers. OpenAI does not invent games or executable behavior. It may select or generate bounded creative content, critique summarized deterministic playtests, and propose changes through a closed balance-patch schema.

## 2. Stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript strict mode | Shared contracts and discriminated unions |
| Monorepo | pnpm workspaces | Explicit package boundaries |
| Web | Next.js | Mobile-first setup, lobby and room UI |
| Server | Fastify + Socket.IO | HTTP application API and authoritative rooms |
| Validation | Zod | One strict runtime contract at every boundary |
| Database | PostgreSQL | Durable blueprints, players, events and checkpoints |
| Engine | Pure TypeScript reducers | Determinism, testing and replay |
| Tests | Vitest plus multiplayer smoke clients | Unit, integration and protocol coverage |
| Local runtime | Docker Compose | Reproducible judge setup |
| AI | OpenAI Responses API behind narrow provider interfaces | Replaceable, typed and bounded workflows |

The MVP runs one backend instance. Redis, distributed presence and horizontal scaling remain out of scope.

## 3. Repository boundaries

```text
apps/web             setup, lobby and player room views
apps/server          HTTP routes, Socket.IO gateway and persistence orchestration
packages/game-spec   strict schemas, curated specs and content catalogues
packages/game-engine reducers, legal actions, projections, simulation and replay
packages/llm         bounded content/review workflows
packages/shared      versioned transport contracts
packages/config      validated environment configuration
```

Dependency direction:

```text
web -> shared
server -> shared + game-spec + game-engine + llm + config
llm -> game-spec
game-engine -> game-spec + shared
game-spec -> shared
```

The engine never imports server, database, Socket.IO or OpenAI code.

## 4. Game contracts

### 4.1 Curated composed games

The primary `ComposedGameSpec` is strict and closed. It describes presentation components, phases, legal actions, atomic conditions and fixed effects. Optional systems cover decks, private hands, board spaces, tokens, scoped resources, seeded randomizers, teams, buzzers, ordering, matching and media prompts.

A spec may request an allowlisted effect such as `add_score`, `draw_cards`, `move_selected_token` or `advance_phase`. The engine owns the implementation. Specs cannot contain JavaScript, regular expressions, arbitrary formulas, dynamic templates or property paths.

Every public game has a stable authored mechanic. Player customization changes only approved setup values, theme tokens and bounded content.

### 4.2 Legacy compatibility

`hidden_roles` and `quiz_vote` remain internal compatibility fixtures. They do not appear in the public catalogue and cannot be selected through the main journey.

### 4.3 Validation

Schema and semantic validation reject:

- unsupported versions, components, actions, conditions or effects;
- impossible player or team distributions;
- phases with no legal action or terminal path;
- timers, rounds and content outside safe bounds;
- duplicate IDs and broken references;
- private data marked public;
- actions with no compatible audited room control;
- balance patches targeting a non-allowlisted parameter.

Validation produces machine-readable codes, paths, severities and remediation hints.

## 5. Deterministic engine

The core contract is pure:

```ts
reduceGameState(spec, state, action, context) -> { state, events }
```

Determinism requires an explicit seed, no wall-clock reads inside reducers, stable ordering, server-issued timer commands, revisioned actions and append-only events. Identical specs, seeds, initial states and accepted actions produce identical states and checksums.

The server validates the actor, phase, legal-action set, revision and idempotency key before reduction. Clients may animate optimistically but never decide scores, phase changes, timers or winners.

## 6. Private state

Internal room state may contain all cards, words and team information. It is never sent directly.

```text
projectForPlayer(fullState, playerId) -> PlayerView
```

Room updates are projected separately for each socket. Reconnect tokens are random, stored as hashes and rotated on reconnect. Logs redact private payloads. Virtual players receive the same projected view and legal action IDs as humans.

## 7. Multiplayer lifecycle

1. A setup endpoint validates game-specific customization and creates an immutable blueprint.
2. Deterministic virtual agents simulate valid player/team configurations.
3. The blueprint becomes `release_ready` only when its gate passes.
4. The host creates a room from that exact revision.
5. Players join with a short code, choose teams when applicable and mark themselves ready.
6. The host starts once the game constraints are satisfied.
7. Socket actions are authenticated, revision-checked, persisted, reduced and projected.
8. Checkpoints plus append-only events restore and verify started rooms after a restart.

The deployed MVP intentionally uses an in-memory active-room registry backed by durable PostgreSQL records.

## 8. AI boundary

The replaceable provider exposes only bounded workflows:

```ts
interface GameContentProvider {
  generateMovieMimePack(input): Promise<MimeFilmPack>;
  generateWordTrapPack(input): Promise<WordTrapPack>;
  generateDrawBattlePack(input): Promise<DrawBattlePack>;
  generateSoundCheckPack(input): Promise<SoundCheckPack>;
  generateStoryChainPack(input): Promise<StoryChainPack>;
  generateStoryBook(manuscript): Promise<StoryBook>;
}

interface GameReviewProvider {
  critiqueComposedGameSpec(spec, evidence): Promise<ComposedGameCritique>;
  proposeComposedBalancePatch(spec, evidence, critique): Promise<ComposedBalancePatch>;
}
```

Content calls cannot change rules. Their outputs pass strict content schemas and are converted into an authored game spec by repository code. Invalid or unavailable model output falls back to audited local catalogues with honest source labels.

StoryChain bookbinding is an explicit post-game action. The server sends one compact payload containing only the public opening, accepted contributions and author names; room state, secret twists and the event ledger never cross the model boundary. Concurrent requests share one persisted generation state, the response uses a strict schema with at most four chapters, storage is disabled at the API boundary and output tokens are capped. The resulting book is persisted with the room and broadcast to every connected player.

After deterministic simulations, critique receives a compact redacted structure and telemetry—not private room state. A balance patch may modify only allowlisted numeric parameters. The server applies it to a new immutable revision, validates the complete spec, reruns simulations and requires explicit acceptance.

`OPENAI_MODEL` controls content work and `OPENAI_REVIEW_MODEL` may route critique and patch work separately. `FakeLlmProvider` provides repeatable offline behavior.

## 9. Persistence

Core tables store:

- immutable game blueprint revisions and provenance;
- playtest runs, critiques and balance decisions;
- room identity, lifecycle, seed and timestamps;
- player public identity and reconnect-token hashes;
- ordered append-only room events and checkpoints.

Historical compilation-job migrations remain forward-only database history; no public compilation API or generic creation workflow uses them.

## 10. HTTP and Socket.IO surfaces

HTTP covers health, game catalogue discovery, one setup endpoint per curated game, blueprint history and bounded balance decisions, plus room creation.

Socket.IO covers join, reconnect, readiness, team selection, game start, revisioned action submission and player-specific state updates. Transport DTOs are versioned and validated separately from internal state.

## 11. UX

The mobile-first journey is:

1. discover the curated collection;
2. select a game;
3. choose a visual theme and game-specific options;
4. create a tested blueprint and room;
5. share the code or link;
6. form teams when the selected game needs them;
7. play through a game-specific premium interface;
8. see results and start another round.

Developer-only component galleries must not be linked from production navigation.

## 12. Failure policy

| Failure | Product behavior |
| --- | --- |
| Missing API key | Use clearly identified audited local content |
| Model unavailable or rate limited | Bounded retry, then catalogue fallback |
| Invalid structured content | One repair attempt where supported, then catalogue fallback |
| Virtual playtest failure | Keep the blueprint unavailable for rooms and report evidence |
| Invalid balance patch | Reject it and preserve the source revision |
| Socket disconnect | Reconnect with the rotating token and current revision |
| Server restart | Restore and checksum-verify persisted room history |

No fallback may claim that OpenAI ran when it did not.

## 13. Deployment

Local and judge environments use Docker Compose for Next.js, Fastify and PostgreSQL. A hosted version may deploy the web app separately from the stateful WebSocket backend, but the MVP keeps one authoritative backend instance and one PostgreSQL database.
