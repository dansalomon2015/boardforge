# BoardForge Game Night pivot

## Product decision

BoardForge supports two equally clear ways to play:

1. **Play one game** — choose, configure and play a single game without creating a persistent session.
2. **Start a game night** — create persistent teams, invite the group, play several compatible games and keep a global score for the evening.

A direct room belongs to one game. A Game Night is the long-lived parent session; each game it launches is an isolated child room. Internal game scores and events never become the global score directly. Only a normalized result is recorded by the Game Night.

## Current status

Completed:

- Stable pre-pivot version tagged as `pre-game-night-pivot`.
- Deterministic Game Night scoring: win 3, tie 1, loss 0.
- Individual winners mapped back to their persistent team.
- Persistent teams and optional captains.
- PostgreSQL snapshots and append-only result/score ledgers.
- Parent Game Night and child room identifiers.
- Child-room creation that preserves player identities, teams and captains.
- Explicit persisted mapping from child-game teams to persistent Game Night teams.
- Shared reconnect credentials across a Game Night and its active child room.
- Automatic, idempotent result transfer from a completed child room to the global score ledger.
- Recovery-time result reconciliation if the server stops during the completion transition.
- A shared compatibility evaluator for player count, team structure, team sizes and captain requirements.
- A Game Night catalogue API with actionable compatibility reasons, enforced again at launch.
- Backend APIs to create and join a Game Night, select teams and captains, and launch a child game.
- Distinct homepage paths for `Start a game night` and `Play one game`, plus code-aware invitation routing.
- A responsive Game Night creation flow for two to four uniquely named and colored teams.
- A shareable lobby with session recovery, player joining and self-service team selection.
- Authenticated Socket.IO subscriptions with player-scoped Game Night state.
- Live presence and team changes without manual refresh, including reconnect and session-replacement handling.
- A host-only, persisted transition from team formation to the shared Game Night board.
- A responsive live board with global standings, team members, presence and active-room recovery.

Not completed:

- Game compatibility catalogue UI and explanations.
- Return-to-board flow, history animation and final podium.

## P0 delivery plan

### Phase 1 — Stabilize contracts and lifecycle

Work:

- Persist an explicit `gameTeamId -> gameNightTeamId` mapping for every child game.
- Keep the direct-game path independent and covered by regression tests.
- Synchronize reconnect credentials between a Game Night and its active child room.
- Detect game completion exactly once and append the normalized global result.
- Clear the active room and allow the host to choose another game.
- Define compatibility checks for player count, team count, team sizes and captain requirements.
- Request captains only when the selected game requires them.

Acceptance tests:

- Reordering display cards never changes team ownership.
- A player keeps the same identity across multiple games.
- Refreshing or reconnecting inside a child game does not lose access to the Game Night.
- A repeated completion event cannot award points twice.
- Two child games cannot run at the same time.
- Direct rooms still create, join, play and complete without Game Night state.

### Phase 2 — Game Night creation (completed)

Work:

- Add clear homepage actions: `Start a game night` and `Play one game`.
- Keep `Join with a code` visually prominent.
- Build a mobile-first creation page for two to four named, colored teams.
- Do not request a game, theme or captain during initial creation.

Acceptance tests:

- At least two teams are required.
- Team names are non-empty and unique.
- Colors are valid and visually distinguishable.
- The flow works at 320, 375 and 430 pixel widths.
- The host receives a shareable six-character code in under one minute.

### Phase 3 — Shared lobby (completed)

Work:

- Show the code, share action, connected players and team cards.
- Let each player join or change team before a game.
- Show unassigned players and team capacity.
- Synchronize changes with Socket.IO.
- Let only the host open the Game Night board.

Acceptance tests:

- Four browser sessions can join and form two teams without manual refresh.
- A player never appears in two teams.
- Reconnection does not duplicate a player.
- Disconnecting marks a player offline without deleting them.
- Teams are locked only while a child game is active.

### Phase 4 — Persistent Game Night board (in progress)

Work:

- Show global standings, team members and the active game.
- Show ordered game history and awarded global points.
- Present a compatible game catalogue to the host.
- Explain why an incompatible game is unavailable.
- Show waiting players who is choosing the next game.

Initial competitive catalogue:

- CineMimes
- WordTrap
- DrawBattle
- SoundCheck

StoryChain may appear as an unranked cooperative experience. WordDuel remains outside the P0 Game Night catalogue until it has a tournament format.

Acceptance tests:

- Standings and ties are deterministic.
- History remains correct after a server restart.
- Compatibility changes when players or teams change.
- Only the host can launch the next game.

### Phase 5 — First complete vertical slice with CineMimes

Work:

- Configure CineMimes from the board with the Game Night teams.
- Ask for captains at launch time, prefilled from the previous selection when available.
- Launch every player into the child room with the same identity.
- Keep performer selection inside the game and reset it every round.
- Transfer the final winner to the Game Night score ledger.

Acceptance tests:

- Team names, colors, members and captains remain correct.
- Only the captain can choose a performer from their own team.
- The secret movie is visible only to the performer.
- The game score does not leak into the global score.
- Completion returns one normalized result to the Game Night.

### Phase 6 — Result transition and replay loop

Work:

- Show the game winner and global points awarded.
- Animate the standings from their previous to new positions.
- Return all players to the board automatically or through a clear action.
- Let the host choose another game.

Acceptance tests:

- Win awards 3, tie awards 1 per tied team, loss awards 0.
- All clients see the same updated standings.
- Refreshing the transition cannot duplicate the result.
- A second compatible game can be launched and completed.

### Phase 7 — Extend and finish

Work:

- Add WordTrap, DrawBattle and SoundCheck to the complete loop.
- Add `End game night`, confirmation and a final podium.
- Lock completed sessions while keeping history readable.
- Add complete multiplayer, browser, accessibility, Docker and migration coverage.

Acceptance tests:

- Game Nights work with two, three and four teams.
- Teams may contain one or several players.
- Captain-selected roles remain game-specific.
- Hidden information never reaches unauthorized clients.
- Fresh and existing PostgreSQL databases migrate successfully.
- `pnpm check`, multiplayer smoke tests and Docker health checks pass.

## Scoring policy

- One winning team: 3 global points.
- Multiple tied winning teams: 1 global point each.
- Losing teams: 0 global points.
- Individual winner: points go to the winner's persistent Game Night team.
- Cooperative game with no competitive winner: no global points.

Raw scores from different games are never added together.

## Release boundary

The hackathon P0 is complete when a host can create teams, invite players, play CineMimes, return to a shared board with an automatically updated score, launch a second game and end the evening on a final podium. Additional games are valuable only after that loop is reliable and visually polished.
