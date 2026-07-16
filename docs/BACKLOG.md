# BoardForge implementation backlog

## How to use this backlog

- **P0**: required for a valid, convincing hackathon submission.
- **P1**: valuable polish or resilience; do only after its dependent P0 path works.
- **P2**: explicitly post-MVP.
- Sizes are relative: **S** (small), **M** (medium), **L** (large).
- A task is complete only when its acceptance criteria and the repository verification gates pass.

The critical path is:

```text
scaffold -> GameSpec -> pure engine -> player projection -> rooms
         -> creator UI -> LLM generation -> playtest/patch
         -> end-to-end demo -> deployment -> submission
```

## Epic A — Project control and compliance

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-001 | P0 | S | — | Record scope and non-goals | Two templates and all deferred features are documented; no universal-game claim remains. |
| BF-002 | P0 | S | — | Establish decision log | `docs/decisions/` exists; major changes record context, decision and consequences. |
| BF-003 | P0 | S | — | Define Definition of Done | Code, tests, docs, security and demo gates are explicit and linked from contribution guidance. |
| BF-004 | P0 | S | — | Create Devpost compliance checklist | Dates, category, video, repo, README, `/feedback` session ID, language and testing access are tracked. |
| BF-005 | P0 | S | — | Confirm originality window | First commit is dated in the submission period; any external/pre-existing assets are listed with licenses. |
| BF-006 | P0 | S | — | Choose and add MIT license | `LICENSE` is present and repository metadata references it. |
| BF-007 | P0 | S | — | Add secret-handling policy | `.env` rules, key rotation response and no-secret-in-logs requirements are documented. |
| BF-008 | P0 | S | BF-004 | Create submission evidence log | Important Codex sessions, commits, screenshots and design decisions can be retrieved for README/submission. |

## Epic B — Repository and developer foundation

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-010 | P0 | M | BF-001 | Scaffold pnpm monorepo | Intended apps/packages exist and one root install resolves all workspaces. |
| BF-011 | P0 | S | BF-010 | Configure strict TypeScript | All packages extend shared strict settings; project references/build boundaries work. |
| BF-012 | P0 | S | BF-010 | Configure formatting and linting | Root commands check the complete repository and fail on violations. |
| BF-013 | P0 | S | BF-010 | Configure Vitest | Unit tests run from root with deterministic timezone and seed settings. |
| BF-014 | P0 | M | BF-010 | Scaffold Next.js web app | App renders a branded responsive shell and production build succeeds. |
| BF-015 | P0 | M | BF-010 | Scaffold Fastify server | Health endpoint, error envelope, request IDs and graceful shutdown work. |
| BF-016 | P0 | S | BF-010 | Add validated environment config | Missing/invalid values fail early; `.env.example` documents every variable. |
| BF-017 | P0 | M | BF-010 | Add shared API/socket contracts | Server and web import versioned DTOs from `packages/shared`; payload schemas exist. |
| BF-018 | P1 | S | BF-010 | Configure package boundary checks | Forbidden dependency directions fail lint or a dedicated architecture test. |
| BF-019 | P0 | S | BF-010 | Add GitHub CI | Install, lint, typecheck, tests and builds run on pushes and pull requests. |
| BF-020 | P1 | S | BF-019 | Add coverage reporting | Engine, validation and secret-projection coverage is visible without enforcing vanity global thresholds. |

## Epic C — GameSpec contract and validation

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-030 | P0 | M | BF-011 | Define common GameSpec envelope | Versioned schema includes IDs, metadata, player/duration limits and provenance with no arbitrary executable fields. |
| BF-031 | P0 | L | BF-030 | Define hidden-roles schema | Roles, teams, fixed phases, deck/content, voting and allowlisted win variants are representable and bounded. |
| BF-032 | P0 | L | BF-030 | Define quiz/vote schema | Supported question modes, reveal rules and allowlisted scoring variants are representable and bounded. |
| BF-033 | P0 | M | BF-031 | Implement hidden-roles semantic validator | Impossible distributions, dead phases, missing wins, broken IDs and secret visibility errors are rejected with issue codes. |
| BF-034 | P0 | M | BF-032 | Implement quiz/vote semantic validator | Invalid answers, scoring, player targeting, rounds and timing are rejected with issue codes. |
| BF-035 | P0 | S | BF-033, BF-034 | Create unified validation report | Schema and semantic errors share code/path/severity/hint shape suitable for UI and repair prompts. |
| BF-036 | P0 | M | BF-031, BF-032 | Build canonical fixtures | At least two valid and multiple invalid specs per template cover boundaries and demo scenarios. |
| BF-037 | P0 | S | BF-030 | Export LLM JSON schemas | Structured-output schemas are generated/maintained from the domain contract and audited for unsupported constructs. |
| BF-038 | P0 | M | BF-035 | Define bounded BalancePatch schema | Only allowlisted paths/operations and safe numeric/content bounds are accepted. |
| BF-039 | P0 | M | BF-038 | Implement patch apply/revalidate | Applying a patch creates a new revision, never mutates the source, and rejects invalid results. |
| BF-040 | P1 | S | BF-030 | Add schema migration interface | Unsupported versions fail clearly; a version migration hook and fixture exist. |
| BF-041 | P1 | S | BF-036 | Publish human-readable GameSpec examples | README/docs contain safe examples for both templates matching current schemas. |

## Epic D — Deterministic engine core

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-050 | P0 | M | BF-030 | Define engine module interface | Initialize, legal-actions, reduce, terminal, results and projection contracts are template-agnostic and typed. |
| BF-051 | P0 | M | BF-050 | Implement deterministic RNG | Same seed and call order produce identical output; seed is serialized and replayed. |
| BF-052 | P0 | M | BF-050 | Define action/event envelopes | Actor, revision, idempotency and ordering metadata are explicit and validated. |
| BF-053 | P0 | M | BF-050, BF-052 | Implement engine dispatcher | Valid specs route to the correct fixed module; unknown versions/templates fail closed. |
| BF-054 | P1 | M | BF-052 | Implement replay | Initial state plus ordered events/actions reproduce checksummed final state. |
| BF-055 | P0 | M | BF-052 | Implement timer commands | Reducers never read wall time; server-issued expiry actions are idempotent and phase-aware. |
| BF-056 | P1 | S | BF-050 | Add state size and transition guards | Oversized content, event loops and excessive transitions fail safely. |

## Epic E — Hidden-roles game module

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-060 | P0 | M | BF-031, BF-050, BF-051 | Initialize roles and teams | A valid player count yields deterministic, valid secret assignments. |
| BF-061 | P0 | L | BF-060, BF-055 | Implement phase state machine | Briefing, discussion, mission, vote, reveal/resolution and completion follow the spec with no dead end. |
| BF-062 | P0 | M | BF-061 | Implement cards/missions | Draw/use/resolve behavior is deterministic and validates ownership and phase. |
| BF-063 | P0 | M | BF-061 | Implement voting | Eligibility, duplicate vote prevention, tally visibility and ties follow fixed policies. |
| BF-064 | P0 | M | BF-061, BF-063 | Implement win conditions | Crew/saboteur outcomes are reachable, exclusive where intended and covered by fixtures. |
| BF-065 | P0 | M | BF-060 | Implement player projections | Each player receives public state and own secrets only; observers receive no role secrets. |
| BF-066 | P0 | M | BF-061 | Implement legal-action enumeration | UI and playtest agents can request the exact legal actions for the current player/phase. |
| BF-067 | P1 | M | BF-061 | Add richer hidden-role event variety | Extra events improve replayability without changing the engine contract. |

## Epic F — Quiz/voting party module

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-070 | P0 | M | BF-032, BF-050, BF-051 | Initialize quiz/vote rounds | Question order and any player targets are deterministic and valid for room membership. |
| BF-071 | P0 | L | BF-070, BF-055 | Implement round state machine | Prompt, answer/vote, reveal, scoring and next-round/completion transitions work. |
| BF-072 | P0 | M | BF-071 | Implement trivia answers | Submissions lock correctly; correctness and reveal timing remain server authoritative. |
| BF-073 | P0 | M | BF-071 | Implement anonymous and player voting | Eligibility, anonymity, duplicate prevention and tally behavior match the question mode. |
| BF-074 | P0 | M | BF-071, BF-072, BF-073 | Implement allowlisted scoring | All configured scoring modes are deterministic and bounded. |
| BF-075 | P0 | M | BF-070 | Implement player projections | Hidden answers/votes are absent until reveal and private submission status is correct. |
| BF-076 | P0 | M | BF-071 | Implement legal-action enumeration | Legal answers/votes are exact for each phase and player. |
| BF-077 | P1 | S | BF-071 | Add host-controlled pace mode | Host can advance eligible phases without violating timer/idempotency invariants. |

## Epic G — Room service and real-time multiplayer

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-080 | P0 | M | BF-015, BF-017 | Configure Socket.IO gateway | Allowed origins, connection limits, validation and structured errors are configured. |
| BF-081 | P0 | M | BF-080 | Implement room registry | Codes are collision-resistant; capacity, lifecycle and idle cleanup are enforced. |
| BF-082 | P0 | M | BF-081 | Implement join/leave/presence | Names are validated; player IDs are stable; lobby updates are revisioned. |
| BF-083 | P0 | M | BF-082 | Implement host controls | Only host can start; player/template constraints are checked immediately before start. |
| BF-084 | P0 | L | BF-053, BF-081, BF-083 | Connect actions to engine | Actor, revision, legal action and idempotency checks precede reduction and emission. |
| BF-085 | P0 | L | BF-065, BF-075, BF-084 | Emit per-player state | Server generates a distinct view for every socket; no full-state broadcast path exists. |
| BF-086 | P1 | M | BF-082 | Implement reconnect tokens | Refresh/rejoin restores identity and latest view; stolen/cross-player tokens are rejected. |
| BF-087 | P0 | M | BF-055, BF-084 | Implement phase scheduler | Timers create validated engine commands and survive duplicate callbacks safely. |
| BF-088 | P1 | M | BF-084 | Implement revision recovery | Stale clients receive a safe resync rather than corrupting state. |
| BF-089 | P1 | M | BF-086 | Implement host disconnect policy | Grace period and host reassignment/termination are deterministic and visible. |

## Epic H — Persistence and audit trail

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-100 | P0 | M | BF-010 | Add PostgreSQL repository configuration | Local migrations run automatically or through one documented command. |
| BF-101 | P0 | M | BF-100, BF-030 | Persist blueprint revisions | Valid specs are immutable revisions with provenance and validation report. |
| BF-102 | P1 | M | BF-100, BF-052 | Persist room/player/event records | Ordered events support audit/replay; reconnect tokens are not stored in plaintext. |
| BF-103 | P1 | M | BF-102 | Add room checkpoints | Bounded periodic checkpoints can restore active demo rooms after a controlled restart. |
| BF-104 | P0 | M | BF-100 | Persist playtests and patches | Inputs, metrics, critique, model/prompt versions and acceptance state are traceable. |
| BF-105 | P0 | S | BF-100 | Add seed command | Seeded hidden-role and quiz/vote games are available idempotently. |
| BF-106 | P1 | S | BF-101, BF-104 | Define retention/redaction | Demo data avoids unnecessary personal data; cleanup and log redaction are documented. |
| BF-107 | P1 | M | BF-103, BF-054 | Restore room from checkpoint/events | A tested recovery path returns a room to a consistent revision. |

## Epic I — GPT-5.6 integration and playtest pipeline

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-110 | P0 | M | BF-016, BF-037 | Define `LlmProvider` contracts | Generation, playtest design, critique and patch are provider-neutral typed operations. |
| BF-111 | P0 | S | BF-110 | Implement deterministic fake provider | Tests/offline demo return known valid outputs without claiming a live GPT run. |
| BF-112 | P0 | M | BF-110 | Implement OpenAI provider | Responses API client uses configurable `OPENAI_MODEL`, timeouts, request IDs and structured outputs. |
| BF-113 | P0 | M | BF-112, BF-035 | Implement brief-to-spec workflow | Normalize, generate, validate and perform at most one bounded repair attempt. |
| BF-114 | P0 | M | BF-113 | Version generation prompts | Prompt version and model are stored; both templates have focused prompts and regression fixtures. |
| BF-115 | P0 | M | BF-066, BF-076 | Implement heuristic playtest agents | Seeded personas can finish both games and produce telemetry without API calls. |
| BF-116 | P0 | M | BF-112 | Implement structured GPT playtest design | GPT returns bounded personas, hypotheses and scenario weights that map only to fixed server-owned policies. |
| BF-117 | P0 | M | BF-115, BF-116 | Implement playtest runner | Batch runs apply the GPT-designed plan with limits, reproducible seeds, stall detection and aggregate metrics. |
| BF-118 | P1 | L | BF-112, BF-117, BF-066, BF-076 | Add bounded GPT action showcase | For a few turns, GPT may select only from projected legal action IDs; invalid/late output falls back safely. |
| BF-119 | P0 | M | BF-112, BF-117 | Implement structured critique | Critique cites telemetry evidence and returns only known issue categories/severities. |
| BF-120 | P0 | M | BF-119, BF-038 | Implement structured balance proposal | Model returns an allowlisted patch plus rationale and expected metric change. |
| BF-121 | P0 | M | BF-039, BF-117, BF-120 | Implement patch verification loop | Patched revision is revalidated/resimulated; before/after evidence is computed. |
| BF-122 | P0 | S | BF-112 | Add cost/latency guards | Token/output bounds, call count, timeout, retry and per-workflow budgets are enforced. |
| BF-123 | P0 | S | BF-113, BF-118 | Implement fallback status model | UI can distinguish live GPT, deterministic fallback, timeout and seeded demo. |
| BF-124 | P0 | M | BF-113, BF-119 | Add safety screening | User brief and generated content are screened/rejected or safely constrained before publication. |
| BF-125 | P1 | S | BF-114 | Add prompt regression suite | Fixed briefs detect schema validity and core quality regressions without brittle prose matching. |

## Epic J — Creator and player experience

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-130 | P0 | M | BF-014 | Create BoardForge visual identity | Logo/type/color/motion choices are coherent, fun and readable on mobile and video. |
| BF-131 | P0 | M | BF-130 | Build landing page | Promise, safety distinction and primary creation CTA are understood within seconds. |
| BF-132 | P0 | L | BF-131, BF-113 | Build brief composer | Players, duration, mood, complexity and free text validate and submit with useful examples. |
| BF-133 | P0 | M | BF-113, BF-123 | Build generation progress | UI visibly and truthfully labels GPT generation, validation, playtest and patch stages. |
| BF-134 | P0 | M | BF-035 | Build validation/spec preview | Template, mechanics and actionable validation issues are readable without exposing raw complexity. |
| BF-135 | P0 | L | BF-117, BF-119, BF-121 | Build playtest report | Metrics, detected issue and before/after patch are understandable and patch acceptance is explicit. |
| BF-136 | P0 | M | BF-081, BF-101 | Build room creation/share screen | Valid revision creates room code, link and QR code with copy/open actions. |
| BF-137 | P0 | M | BF-082, BF-083 | Build join and lobby UI | Name entry, presence, constraints, ready/start and reconnect states work on mobile. |
| BF-138 | P0 | L | BF-061, BF-085 | Build hidden-role room UI | Private role, phase, timer, legal actions, vote and result are clear without secret leakage. |
| BF-139 | P0 | L | BF-071, BF-085 | Build quiz/vote room UI | Question, answer/vote, lock, reveal, scores and results work on mobile. |
| BF-140 | P0 | M | BF-138, BF-139 | Build shared room state/error UX | Loading, reconnect, stale revision, host wait, API failure and completion states are recoverable. |
| BF-141 | P1 | M | BF-130, BF-140 | Accessibility pass | Keyboard, focus, contrast, status announcements and touch targets pass the defined checklist. |
| BF-142 | P1 | M | BF-138, BF-139 | Add restrained game motion/audio cues | Effects improve demo clarity, respect reduced motion and use only owned/licensed assets. |

## Epic K — Security, privacy and abuse resistance

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-150 | P0 | M | BF-017 | Add input validation at every boundary | HTTP, socket, database JSON and LLM outputs reject unknown/invalid fields. |
| BF-151 | P0 | M | BF-065, BF-075, BF-085 | Audit secret projection | Automated adversarial tests prove other roles/answers/votes cannot be inferred from payload fields. |
| BF-152 | P0 | M | BF-084 | Authorize every player action | Impersonation, host-only action, duplicate and cross-room attempts fail closed. |
| BF-153 | P0 | S | BF-015, BF-080 | Add rate and size limits | Brief generation, joins, actions and sockets have appropriate limits and clear errors. |
| BF-154 | P0 | S | BF-015 | Configure web security basics | CORS, headers, cookie/token transport, error disclosure and production logging are reviewed. |
| BF-155 | P0 | S | BF-112 | Redact LLM and application logs | API keys, tokens, full private states and user secrets never appear in logs. |
| BF-156 | P0 | S | BF-132 | Constrain user content | Lengths, names and rendered text are sanitized/escaped; unsafe rich HTML is not supported. |
| BF-157 | P0 | S | BF-102 | Review data minimization | No account/real identity is required; retention and deletion behavior match the README. |
| BF-158 | P1 | M | BF-151, BF-152 | Run lightweight threat review | Threats, mitigations and accepted MVP risks are documented before release freeze. |

## Epic L — Test strategy and quality gates

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-160 | P0 | M | BF-033, BF-034 | Add schema/semantic unit tests | Valid boundaries pass and each rejection family has a focused fixture. |
| BF-161 | P0 | L | BF-061, BF-064 | Add hidden-role engine tests | Every phase, action, tie, disconnect command and win path is deterministic. |
| BF-162 | P0 | L | BF-071, BF-074 | Add quiz/vote engine tests | Every question/scoring mode, tie, timer and terminal path is deterministic. |
| BF-163 | P1 | M | BF-051, BF-053 | Add replay/property tests | Repeatability and core invariants hold across multiple seeds and action sequences. |
| BF-164 | P0 | L | BF-085, BF-151 | Add multiplayer integration tests | Multiple sockets join, act, reconnect and receive only authorized views. |
| BF-165 | P0 | M | BF-113, BF-121 | Add LLM workflow tests | Fake-provider success, refusal, invalid output, timeout, repair and invalid patch paths are covered. |
| BF-166 | P0 | L | BF-136, BF-138, BF-139 | Add Playwright multi-context happy paths | Creator plus enough browser contexts complete one game of each template. |
| BF-167 | P1 | M | BF-140 | Add failure-path E2E tests | API unavailable, socket reconnect, stale action and seeded fallback remain understandable. |
| BF-168 | P0 | M | BF-130, BF-141 | Run responsive/browser QA | Current Chrome plus mobile viewport matrix shows no clipping or blocked controls. |
| BF-169 | P1 | M | BF-122, BF-166 | Run load/latency smoke test | Demo-sized concurrent rooms and LLM workflow stay within documented limits. |
| BF-170 | P0 | S | BF-019 | Enforce release CI gate | No release build is accepted with failing lint, types, tests or production build. |
| BF-171 | P1 | M | BF-166 | Add visual regression snapshots | Critical demo surfaces have stable snapshots without blocking on harmless animation. |
| BF-172 | P0 | M | BF-105, BF-166 | Execute full demo rehearsal repeatedly | The complete three-minute path succeeds at least five consecutive times, including one fallback rehearsal. |

## Epic M — Docker, operations and deployment

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-180 | P0 | M | BF-014, BF-015, BF-100 | Write production-ready Dockerfiles | Images use reproducible installs, non-root runtime where practical and health checks. |
| BF-181 | P0 | M | BF-180 | Create Docker Compose stack | One documented command starts web, server, database, migrations and seeded data. |
| BF-182 | P1 | S | BF-181 | Add Compose smoke test | Fresh volumes reach healthy state and complete a minimal API/database check. |
| BF-183 | P0 | S | BF-015, BF-100 | Add liveness/readiness endpoints | Readiness reflects database and critical initialization without depending on OpenAI availability. |
| BF-184 | P0 | S | BF-016 | Document production environment matrix | Required/optional secrets, origins, URLs, model ID and limits are listed. |
| BF-185 | P0 | S | — | Confirm hosting account/provider | Provider supports WebSockets, one backend instance, secrets, health checks and PostgreSQL. |
| BF-186 | P0 | M | BF-180, BF-184, BF-185 | Deploy backend/database | HTTPS/WSS, migration, secret and health configuration pass smoke tests. |
| BF-187 | P0 | M | BF-014, BF-184, BF-186 | Deploy frontend | Production frontend points to backend with correct CORS and works from a clean browser. |
| BF-188 | P0 | M | BF-186, BF-187 | Run hosted multi-device test | At least three independent clients finish both seeded games without local services. |
| BF-189 | P1 | S | BF-186 | Add operational logs and request correlation | Failures can be diagnosed without exposing secrets/private state. |
| BF-190 | P1 | S | BF-186 | Create rollback/reseed procedure | Previous deploy and seeded demo can be restored quickly before judging. |
| BF-191 | P1 | S | BF-186 | Add basic uptime check | Public health check detects downtime without exercising paid LLM calls. |

## Epic N — Demo, documentation and Devpost submission

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-200 | P0 | M | BF-041, BF-181 | Write complete English README | Pitch, architecture, GPT/Codex roles, setup, env, demo data and room testing are clear. |
| BF-201 | P0 | S | BF-200 | Add architecture diagram and screenshots | Assets are owned, current and legible on GitHub/Devpost. |
| BF-202 | P0 | S | BF-008, BF-200 | Document Codex collaboration | README names acceleration, key human decisions and representative implementation work honestly. |
| BF-203 | P0 | S | BF-181 | Verify clean-machine setup instructions | A clean checkout reaches both seeded templates with documented commands only. |
| BF-204 | P0 | M | BF-172, BF-188 | Lock three-minute demo scenario | Exact brief, players, timing, expected imbalance, patch and playable turn are deterministic enough for filming. |
| BF-205 | P0 | M | BF-204 | Write English narration and shot list | Script explains what was built and how GPT-5.6/Codex were used within 2:50 target runtime. |
| BF-206 | P0 | S | BF-204 | Prepare demo backup pack | Seeded game, backup room, local Compose path and screenshots are ready and honestly labeled. |
| BF-207 | P0 | M | BF-205, BF-206 | Record and edit demo video | Clear audio, readable UI, no secrets/trademarks/unlicensed music, duration under three minutes. |
| BF-208 | P0 | S | BF-207 | Upload public YouTube video | Public link works signed out and playback quality preserves text readability. |
| BF-209 | P0 | M | BF-200, BF-208 | Write Devpost description | English copy covers audience, problem, solution, implementation, GPT-5.6 and Codex. |
| BF-210 | P0 | S | BF-209 | Complete Devpost media/category fields | `Apps for Your Life`, screenshots, repository, demo URL and video are correct. |
| BF-211 | P0 | S | BF-008 | Capture `/feedback` Codex session ID | ID points to the thread where most core functionality was built and is stored for submission. |
| BF-212 | P0 | S | BF-006, BF-200 | Make public repository release-ready | License, no secrets, clean history/status and testing instructions are present. |
| BF-213 | P0 | M | BF-208, BF-210, BF-211, BF-212 | Run final compliance audit | Every official submission and eligibility requirement has evidence and an owner. |
| BF-214 | P0 | S | BF-213 | Submit before internal cutoff | Submission is finalized by 21 July 18:00 CEST and confirmation is saved. |

## Epic O — Explicit post-MVP backlog

| ID | Pri | Size | Depends on | Task | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BF-220 | P2 | L | Release | Add Redis/Socket.IO adapter and horizontal scaling | Multi-instance rooms preserve ordering and presence. |
| BF-221 | P2 | L | Release | Add accounts and public game gallery | Auth, ownership, moderation and privacy are production-ready. |
| BF-222 | P2 | L | Release | Add educational mode | Learning objectives and teacher workflows have a separate validated contract. |
| BF-223 | P2 | L | Release | Add more fixed template modules | Each template has bounded schema, engine, projections and full tests. |
| BF-224 | P2 | L | Release | Add standalone export | Export packages fixed runtime plus spec, never generated executable code. |
| BF-225 | P2 | M | Release | Add asset generation | Image assets have provenance, moderation, caching and fallback behavior. |
| BF-226 | P2 | L | Release | Production hardening | Full authz, audit, observability, backups, data controls and abuse handling are completed. |

## P0 release gates

P0 is complete only when all of the following are true:

1. A clean Docker Compose start reaches a seeded game without an OpenAI key.
2. With GPT-5.6 configured, a brief generates a structured spec that passes strict validation.
3. Both templates can be completed by real clients through the server-authoritative engine.
4. Hidden roles and unrevealed answers/votes never reach unauthorized client payloads or logs.
5. Invalid LLM output and invalid patches are rejected; no generated code is executed.
6. A playtest produces evidence, critique and a bounded before/after patch workflow.
7. Hosted WebSocket play works with at least three independent clients.
8. The three-minute demo succeeds five times consecutively and has a seeded fallback.
9. README, public repository, video, test access and Devpost fields meet the official rules.
10. The `/feedback` session ID and submission confirmation are saved before the internal cutoff.
