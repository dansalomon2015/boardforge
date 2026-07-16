# Implementation progress

## 16 July 2026 — Immutable revision history

Completed and verified:

- revision families are reconstructed from immutable source/derived balance-patch links without overwriting a GameSpec;
- API exposes every connected version with release status, patch decision, playtest metrics and structured critique;
- proposed balance revisions can be explicitly rejected, with the patch decision and derived blueprint status updated transactionally;
- creator UI renders version cards for original, proposed, accepted and rejected branches;
- any previous `release_ready` blueprint can be selected again and used to open a room;
- branch smoke test produced one rejected and one accepted variant while the original release remained playable;
- full lint, typecheck, unit-test and production-build gate passes.

## 16 July 2026 — Structured critique and constrained balance review

Completed and verified:

- strict `ComposedGameCritique` contract with source GameSpec identity, release verdict, strengths, known issue categories, severity, evidence and bounded recommendations;
- live OpenAI and deterministic local providers implement the same typed critique boundary;
- every generated or balanced blueprint is critiqued after deterministic playtest and persists one immutable critique in PostgreSQL;
- release requires both a passing simulation report and a favorable structured critique;
- balance proposals receive the persisted critique as mandatory evidence instead of operating directly on raw telemetry alone;
- derived balance revisions are replayed and critiqued again, remain blocked before explicit acceptance, and cannot be accepted without both gates;
- creator UI exposes the AI verdict, strengths, evidence, recommendations and the new post-patch critique;
- bounded balance patches, before/after reports and explicit acceptance are persisted in PostgreSQL;
- full lint, typecheck, unit-test, production-build and Docker acceptance gates pass.

## 16 July 2026 — Revisioned actions and deterministic room recovery

Completed and verified:

- common action envelope for every engine with player identity, expected room revision and idempotency key;
- optimistic concurrency rejects stale actions while web and smoke clients perform a bounded resync retry;
- append-only `room_events` table with unique room sequence and idempotency constraints;
- persisted room sessions include players, hashed reconnect credentials, team selection, deterministic seed and checkpoint checksum;
- pure engine replay rebuilds legacy and composed states from the same GameSpec, players, seed and accepted actions;
- startup restoration revalidates database payloads, replays every event and rejects rooms whose revision or checksum diverges;
- action persistence and checkpoint update occur in one PostgreSQL transaction before the in-memory state is published;
- completed hidden-role room `8VG2DB` restored successfully after a real server restart at revision 27;
- multiplayer smoke covers concurrent stale revisions, idempotent retry, key reuse rejection, reconnect rotation and impersonation rejection;
- GitHub Actions CI runs frozen install, secret scan, lint, typecheck, tests, builds and Compose validation.
- Docker images install from the frozen lockfile after source copy, preserve workspace dependency links and expose health checks;
- the web image runs the Next.js standalone artifact instead of the development-oriented package start wrapper;
- full Compose acceptance passes with three healthy services, the complete multiplayer smoke, and room `6FHYBL` restored after a container restart;
- full lint, typecheck, 37-unit-test and production-build gate passes.

## 16 July 2026 — Persistent releases and secure reconnect

Completed and verified:

- idempotent PostgreSQL migration for immutable blueprint revisions and one playtest report per revision;
- every GameSpec is strictly revalidated immediately before persistence and after database retrieval;
- generated prompt, provider, release status, structured spec and full virtual-agent telemetry are persisted;
- server health exposes active persistence mode and database readiness;
- local in-memory fallback remains available when PostgreSQL is optional; Docker requires the database and fails closed;
- Docker PostgreSQL moved to host port 5433 to avoid a detected native PostgreSQL conflict on 5432;
- reconnect now requires a 256-bit random credential, stores only its SHA-256 hash, rotates it on every successful reconnect and replaces the previous socket;
- player-bound socket authorization now protects team selection, game start and every game action;
- multiplayer smoke test rejects a stale-token reconnect and a player impersonation attempt;
- cross-process acceptance: a fake-provider server persisted a new release, then the main server retrieved it from PostgreSQL and created room `PKB9L5`.
- full lint, typecheck, 33-unit-test, production-build and hardened multiplayer smoke gates passing.

## 16 July 2026 — Human-playable composed rooms

Completed and verified:

- composed projections now expose only the component references required to render each legal action;
- semantic validation rejects a `GameSpec` when an action has no compatible audited human control (`HUMAN_CONTROL_MISSING`);
- generic room renderer now supports choices, free text, decks, private hands, board movement, resources, dice/spinners, buzzers, ordering, matching, challenges, clues, reveals, drawing and safe HTTPS media;
- failed remote media renders a themed fallback instead of a broken browser element;
- internal `systems_lab` fixture exercises every reusable component and action family without adding a predefined public game;
- every internal composed blueprint receives its own 24-run virtual-agent release report at server startup;
- two-player browser room manually completed through the generic controls with no rejected action or UI error;
- responsive room verified at 390 × 844 with no horizontal overflow;
- full lint, typecheck, 28-unit-test, production-build and three-engine multiplayer smoke gates passing.

## 15 July 2026 — Prompt-first creator and release gate

Completed and verified:

- landing page rebuilt around one natural-language prompt; historical template, player-count and duration controls removed;
- GPT-5.6 composed-spec generation through the Responses API with JSON-constrained output, strict Zod parsing and semantic validation before engine use;
- one bounded semantic repair attempt for invalid model output;
- explicit `teamPolicy` covering balanced/random allocation, one or many members per team, uneven-team permission and capacity bounds;
- thematic team names/colors generated in the spec, with player-controlled team selection synchronized in the lobby and validated before start;
- deterministic virtual-player personas operating only through per-player projected views and legal action IDs;
- 24-simulation release gate with stall, rejected-action, max-action and private-data-leak detection;
- room creation blocked unless the compiled blueprint reaches `release_ready`;
- release report rendered on the creator page with configurations, team sizes and action metrics;
- responsive browser review at 390 × 844 with no overflow and no legacy controls;
- deterministic compiler acceptance: 24/24 simulations at 2, 3, 4, 6 and 12 players, then successful room creation;
- full lint, typecheck, unit-test, production-build and multi-client smoke gates passing.

External status:

- the configured OpenAI request reaches the API, but the current project key reports exhausted quota/credits; the offline provider keeps the complete local acceptance path testable without mislabeling it as GPT output.

## 15 July 2026 — Composed engine foundation

Completed and verified:

- version-2 `ComposedGameSpec` with strict unknown-field rejection and semantic reference validation;
- 20 reusable visual themes plus a component gallery;
- deterministic flow, action, rule and effect interpreter;
- teams, scores, resources, cards/private hands, board tokens, seeded randomizers, buzzers, ordering and matching;
- player-specific composed projections with regression tests preventing private-card leaks;
- composed `Cinema Charades` fixture and themed multiplayer room rendering;
- WebSocket smoke test completing legacy hidden roles, legacy quiz/vote and composed charades.

The next slice is bounded balance-patch verification and a browser-level regression suite for generated composed games.

## 14 July 2026 — Local vertical slice

Completed and verified:

- pnpm TypeScript monorepo with web, server and domain packages;
- strict `hidden_roles` and `quiz_vote` GameSpec schemas;
- semantic fixture validation and unknown-field rejection;
- deterministic seeded role assignment and server-side reducers;
- phase, action, score and terminal-state handling for both templates;
- player-specific projections that omit other players' roles and unrevealed answers/votes;
- Fastify API, in-memory blueprints and rooms, and Socket.IO transport;
- local procedural compiler/playtest abstraction that turns different briefs into different validated GameSpecs;
- compiled-game preview with generated roles, mission prompt or quiz/vote deck before room creation;
- live OpenAI provider using GPT-5.6, the Responses API and schema-constrained Structured Outputs;
- explicit API failure states for invalid keys, exhausted quota and unavailable models;
- responsive creator, lobby, hidden-role and quiz/vote interfaces;
- Dockerfiles, Docker Compose definition and PostgreSQL service definition;
- unit tests plus an automated WebSocket smoke test that completes both games;
- local production builds and browser walkthrough;
- MIT license and local setup documentation.

Verification evidence:

- `pnpm check` passes;
- `pnpm smoke:multiplayer` completes hidden roles at revision 27 and quiz/vote at revision 13;
- `docker compose config --quiet` passes;
- `GET http://localhost:4000/health` returns `status: ok` with provider `procedural-local`;
- browser-tested compile, room creation, join and lobby flow on `http://localhost:3000`.

## Next implementation slice

1. Add server-issued expiry actions and deterministic timers.
2. Add multi-client browser regression tests for the generic room controls.
3. Prepare GitHub release evidence and hosted deployment.

## Current deliberate limitations

- the offline provider generates deterministic variations from curated safe content; live mode calls GPT-5.6 but requires valid project quota;
- prompts can combine the audited version-2 components; a genuinely new mechanic still requires a reviewed schema/engine primitive, projection and tests;
- server development mode requires a restart after server/domain code changes;
- active room objects remain in memory while the server runs, but are reconstructed from PostgreSQL events after restart;
- room retention, event compaction and automated cleanup are not implemented yet;
- host-driven advance replaces server timers for the first slice.
