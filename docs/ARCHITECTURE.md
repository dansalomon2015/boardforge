# BoardForge MVP architecture

## 1. Architectural goal

BoardForge is a constrained compiler pipeline, not a free-form game-code generator:

```text
Natural-language brief
        |
        v
GPT-5.6 structured GameSpec proposal
        |
        v
Schema + semantic validation
        |
        v
Bounded playtest and critique
        |
        v
Validated balance patch
        |
        v
Deterministic server-side engine
        |
        v
Player-specific real-time room views
```

The primary engine interprets a closed catalogue of composed mechanics. GPT-5.6 selects, configures and connects those audited mechanics but cannot add executable behavior. The two historical engines remain available during migration.

## 2. Chosen stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript, strict mode | Shared contracts and safe discriminated unions |
| Monorepo | pnpm workspaces | Fast, simple package boundaries |
| Web app | Next.js | Mobile-first UI and straightforward deployment |
| Server | Fastify + Socket.IO | Explicit HTTP/WebSocket backend with room support |
| Validation | Zod with generated JSON Schema where required | One runtime contract used by API, engine and LLM boundary |
| Database | PostgreSQL + parameterized `pg` repository | Small auditable persistence boundary and explicit SQL migrations |
| Active rooms | In-memory, one server instance for MVP | Removes Redis and distributed-lock complexity |
| Tests | Vitest + Playwright | Pure engine tests and real multi-browser flows |
| Local runtime | Docker Compose | Reproducible judge setup |
| LLM API | OpenAI Responses API behind `LlmProvider` | Structured-output boundary and replaceable model ID |

The deployed MVP intentionally runs one backend instance. Scaling Socket.IO across instances, shared presence and Redis adapters are post-MVP work.

## 3. Repository boundaries

```text
apps/
  web/                 creator flow, playtest report, lobby, game room
  server/              HTTP API, WebSocket gateway, application services
packages/
  game-spec/           Zod schemas, JSON schema, types, version migrations
  game-engine/         reducers, legal actions, projections, bots, replay
  llm/                 provider interface, prompts, structured workflows
  shared/              IDs, API DTOs, Socket.IO event contracts
  config/              validated environment configuration
```

Dependency direction:

```text
web -> shared
server -> shared + game-spec + game-engine + llm + config
llm -> game-spec + shared
game-engine -> game-spec + shared
game-spec -> shared
```

`game-engine` must not import server, database, Socket.IO or OpenAI clients.

## 4. GameSpec contract

### 4.1 Common envelope

Every persisted specification has:

- `schemaVersion`;
- stable `id` and editable `revision`;
- `template`: `composed` for the primary version-2 contract; `hidden_roles` and `quiz_vote` remain legacy values;
- title, short description and rules summary;
- player minimum and maximum;
- duration target and round limit;
- presentation theme tokens from a closed palette;
- safety/moderation status;
- creation metadata that records model, prompt version and validation result.

No field may contain JavaScript, regular expressions supplied by users, arbitrary formulas, executable templates or dynamic property paths. Version 2 uses only strict enums for component kinds, actor policies, conditions and effects.

### 4.2 Composed specification

The composed contract contains bounded definitions for presentation components, phases, legal actions, atomic conditions and fixed effects. Optional systems cover decks and private hands, board spaces and tokens, scoped resources, seeded dice/spinners, teams, buzzers, ordering, matching and media prompts. Semantic validation resolves every ID reference before the specification can reach the engine.

The engine owns all interpretation. A spec may request `add_score`, `draw_cards`, `move_selected_token`, `advance_phase` or another allowlisted effect, but it cannot supply the implementation of that effect.

### 4.3 Hidden roles specification (legacy)

The fixed engine supports:

- teams and role definitions;
- exact or bounded role counts based on room size;
- public versus owner-only role text;
- a fixed phase vocabulary such as `briefing`, `discussion`, `mission`, `vote`, `reveal`, `resolution`;
- bounded timers;
- prompt/event card decks;
- mission success thresholds;
- voting and elimination options;
- allowlisted win-condition variants implemented by the engine.

The spec configures values and content; it does not define state-transition code.

### 4.4 Quiz/vote specification (legacy)

The fixed engine supports rounds containing allowlisted question modes:

- multiple-choice trivia;
- anonymous poll;
- `most_likely_to` player vote;
- audience ranking or preference vote.

The specification may configure questions, answers, explanations, timers, reveal behavior and allowlisted scoring modes. Scoring formulas are selected from engine-owned enums and bounded parameters.

### 4.5 Semantic validation

Schema validation is necessary but not sufficient. Semantic validators must reject:

- unsupported schema versions or template names;
- player bounds outside the MVP limits;
- impossible role distributions;
- missing or unreachable win conditions;
- phases with no legal action or terminal path;
- timers and round counts outside safe bounds;
- duplicate IDs or broken references;
- trivia questions without exactly one valid answer where required;
- secret data marked public;
- content failing moderation policy;
- a patch touching non-allowlisted paths.

Validation produces machine-readable issues with a code, path, severity and remediation hint.

## 5. Deterministic game engine

The core contract is pure:

```ts
reduceGameState(spec, state, action, context) -> {
  state,
  events
}
```

Determinism requires:

- an explicit pseudo-random seed stored with the room;
- no wall-clock reads inside reducers;
- time represented by validated commands from the server scheduler;
- stable action ordering and event IDs;
- replayable append-only events;
- identical output for identical spec, seed, initial state and actions.

Template modules implement initial state, legal actions, reduction, terminal detection, score/winner calculation and player projections behind one interface.

## 6. Secret-state model

Internal room state may contain all roles and private cards. It is never used as a transport payload.

For every outbound update, the server calls:

```text
projectForPlayer(fullState, playerId) -> PlayerView
```

Security requirements:

- role and team membership are owner-only unless explicitly revealed by an engine event;
- room broadcasts are generated per socket/player, not by broadcasting one full object;
- logs and error telemetry redact private payloads;
- GPT playtest agents receive only the same projected view and legal actions available to their simulated player;
- reconnect tokens are random, hashed at rest where persisted, and never accepted for another player;
- tests assert the absence of every known secret field for unauthorized viewers.

## 7. Real-time room protocol

### 7.1 Session model

- A host creates a room from a validated blueprint.
- Players join using a short room code and display name.
- The server returns a player ID plus reconnect token.
- The host starts the game once the template's player constraints are satisfied.
- Every action includes room ID, player ID, expected revision and idempotency key.

### 7.2 Authoritative flow

```text
client action
  -> authenticate socket/player
  -> validate payload
  -> check room revision and legal action
  -> reduce state
  -> append events
  -> persist checkpoint when required
  -> project a tailored view for each player
  -> emit revisioned updates
```

Clients may optimistically animate but never decide scores, roles, phase changes or winners.

### 7.3 MVP resilience

- bounded in-memory room registry;
- idle room cleanup;
- reconnect within a defined grace period;
- periodic database checkpoint and append-only event persistence;
- host reassignment or explicit room termination when the host disconnects;
- seeded demo blueprints available when the LLM is unavailable.

## 8. LLM boundary and workflows

The provider interface must make model access replaceable:

```ts
interface LlmProvider {
  generateGameSpec(input: GameBrief): Promise<GameSpecCandidate>;
  designPlaytest(input: PlaytestDesignInput): Promise<PlaytestPlan>;
  critiquePlaytest(input: PlaytestEvidence): Promise<GameCritique>;
  proposeBalancePatch(input: BalanceInput): Promise<BalancePatch>;
}
```

`OpenAiLlmProvider` uses separate environment configuration for generation and review, with local defaults `OPENAI_MODEL=gpt-5.6-terra` and `OPENAI_REVIEW_MODEL=gpt-5.6-luna`; a deterministic fake provider supports tests and the offline demo path.

All outputs use strict structured schemas. The application rejects refusal, truncation, invalid structure, unknown fields and unsafe content explicitly.

### 8.1 Generation

1. Normalize the brief.
2. Ask the model to select one of the two templates and fill the corresponding schema.
3. Parse structured output.
4. Run schema and semantic validation.
5. Allow one bounded repair attempt using validation issues.
6. Persist only a valid candidate.

### 8.2 AI-assisted playtest

The playtest combines GPT-5.6 test design with deterministic simulation:

- GPT-5.6 returns a structured playtest plan containing bounded player personas, hypotheses and scenario weights;
- the server maps those personas to fixed heuristic policies and runs seeded batch simulations;
- heuristic agents receive only the same `PlayerView` and legal actions available to their simulated player;
- GPT-5.6 receives summarized, redacted telemetry after the simulations and critiques the results;
- an optional P1 showcase may let GPT select from explicit legal action IDs for a few turns, but this is not on the critical path;
- telemetry records turns, scores, win rates, stalls, repeated actions and duration.

### 8.3 Critique and patch

- GPT receives the validated spec plus summarized playtest evidence.
- The critique uses issue categories and evidence references.
- The proposed `BalancePatch` can modify only allowlisted content and bounded numeric fields.
- The server applies the patch, revalidates the full spec, reruns simulation and compares metrics.
- The creator sees before/after changes and explicitly accepts the patch before publication.

## 9. Persistence model

Minimum tables:

- `game_blueprints`: identity, ownerless creator session, template, status;
- `game_blueprint_revisions`: immutable spec JSON, validation report, provenance;
- `playtest_runs`: seed, provider/model, metrics, critique and status;
- `balance_patches`: source revision, patch, validation and acceptance;
- `rooms`: room code, blueprint revision, lifecycle, seed and timestamps;
- `room_players`: public identity, reconnect-token hash and status;
- `room_events`: ordered append-only event payloads;
- `room_checkpoints`: periodic internal-state snapshots.

For the no-account MVP, creator ownership uses an unguessable browser token. Public blueprint sharing is out of scope.

## 10. HTTP and WebSocket surfaces

Core HTTP endpoints:

- health/readiness;
- `POST /api/compilations` to persist a prompt-first job and return `202 Accepted`;
- `GET /api/compilations/:id` as the refresh-safe source of truth for progress and the terminal compiled result;
- `GET /api/compilations/:id/events` for Server-Sent Event progress updates;
- launch and retrieve playtests;
- accept or reject a balance patch;
- create a room from a valid revision;
- retrieve a seeded demo game.

Minimum socket events:

- join/reconnect/leave;
- lobby snapshot and presence update;
- start game;
- submit action;
- player-specific state update;
- timer/phase update;
- recoverable and fatal error;
- room completed.

All transport contracts are versioned and validated on both sides.

## 11. UX surfaces

The mobile-first happy path contains:

1. Landing page with the compiler promise.
2. One prompt-only brief composer; players, duration, team structure and mechanics are inferred from the requested experience.
3. Durable generation progress showing model assembly, strict validation, deterministic playtest and structured review.
4. Validated spec preview with clear template and mechanics.
5. Playtest report with detected issue, evidence and proposed patch.
6. Before/after patch approval.
7. Room creation with code, link and QR code.
8. Lobby with connected players and readiness.
9. Template-specific game room with private role/question view.
10. Result screen and replay/restart action.

The demo must remain usable on a laptop plus at least two phone-sized browser windows.

## 12. Failure and fallback policy

| Failure | Product behavior |
| --- | --- |
| Missing API key | Explain configuration and offer seeded demo blueprints |
| Model unavailable/rate limited | Retry with bounded backoff, then seeded demo path |
| Invalid structured output | One repair attempt, then actionable validation report |
| Playtest timeout | Keep deterministic results and mark GPT analysis unavailable |
| Invalid patch | Reject, show the failed constraints, keep original revision |
| Socket disconnect | Reconnect using token and current revision |
| Server restart | Restore checkpoint/event history where possible; demo has a seeded restart path |

No fallback may silently claim that GPT-5.6 ran when it did not. The UI labels seeded or simulated data.

## 13. Deployment topology

### Local

Docker Compose starts:

- web;
- server;
- PostgreSQL;
- optional migration/seed job.

### Hosted MVP

- static/server-rendered frontend may run separately;
- the backend must run on a platform supporting long-lived WebSockets;
- managed PostgreSQL is required;
- exactly one backend replica is configured;
- health checks, migrations, secrets and CORS origins are explicit.

The final provider remains a delivery decision until account availability is confirmed.

## 14. Explicitly deferred

- universal game mechanics or user-authored scripting;
- arbitrary code generation/execution;
- marketplace, accounts, payments or public social graph;
- complex board maps, physics or card-engine DSLs;
- Redis-based horizontal scaling;
- native mobile applications;
- asset generation pipeline;
- analytics beyond demo-safe operational telemetry;
- moderation workflows beyond prompt/spec screening;
- export as a standalone generated application.
