# BoardForge repository instructions

These instructions apply to the entire repository.

## Product scope

Build a hackathon-grade, curated collection of premium social and tabletop games. Each public game has designed, deterministic mechanics expressed as a strictly validated `ComposedGameSpec`; the model may supply only bounded creative content, structured playtest critique and allowlisted balance suggestions. It never defines executable behavior.

The original `hidden_roles` and `quiz_vote` templates remain compatibility fixtures while the composed engine powers the curated collection. Do not reintroduce a universal prompt-to-game compiler, arbitrary scripting, formulas, a marketplace, payments, accounts, or horizontal scaling before all P0 release gates pass.

## Safety and architecture invariants

- Never evaluate or execute code, expressions, templates, or scripts produced by an LLM.
- The LLM boundary accepts typed inputs and returns typed structured outputs only.
- Validate every LLM output at the boundary and validate the final `GameSpec` again before persistence or execution.
- Express game behavior through closed component, action, condition and effect enums with bounded parameters interpreted by fixed TypeScript reducers.
- Keep the server authoritative for state transitions, timers, scores, role assignment, and win conditions.
- Never serialize the full hidden-role state to a client. Build a player-specific view on the server.
- Validate every action against the actor, current phase, legal action set, and idempotency key.
- Preserve deterministic replay through an explicit seed and append-only game events.

## Intended repository shape

```text
apps/web             Next.js mobile-first UI
apps/server          Fastify HTTP API and Socket.IO gateway
packages/game-spec   schemas, types, migrations, fixtures
packages/game-engine pure reducers, views, simulations, replay
packages/llm         provider abstraction and structured workflows
packages/shared      transport contracts and shared utilities
docs                 architecture, backlog, delivery and submission docs
```

## Engineering conventions

- TypeScript strict mode everywhere; avoid `any`.
- Prefer pure functions for game rules and state transitions.
- Use discriminated unions for template-specific specifications, actions, and events.
- Keep transport DTOs separate from internal/domain state.
- Store secrets only in environment variables; keep `.env*` out of Git except `.env.example`.
- New behavior requires tests proportional to risk.
- Security regressions involving hidden information are release blockers.
- Keep user-facing submission copy and the README in English.

## Verification gates

Before declaring an implementation task complete, run the commands defined by the scaffold for:

1. formatting and linting;
2. TypeScript type checking;
3. unit and integration tests;
4. production builds;
5. Docker Compose smoke test when infrastructure is affected.

Update this file with the exact commands immediately after the project scaffold introduces them.

Current root commands:

- `pnpm dev` — run web and server locally.
- `pnpm lint` — run package-level static checks.
- `pnpm typecheck` — type-check every workspace.
- `pnpm test` — run all automated tests.
- `pnpm build` — create production builds.
- `pnpm check` — run the complete local verification gate.
- `docker compose up --build` — run the reproducible local stack.
