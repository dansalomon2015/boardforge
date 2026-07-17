# BoardForge delivery plan

## 1. Target and cutoff

- Official submission deadline: **21 July 2026, 17:00 PDT**.
- Paris equivalent: **22 July 2026, 02:00 CEST**.
- Internal submission cutoff: **21 July 2026, 18:00 CEST**.
- Internal release freeze: **20 July 2026, 22:00 CEST**, except release-blocking fixes.

The eight-hour submission buffer protects against upload, Devpost, hosting and credential failures.

## 2. Execution principles for a solo build

1. Keep one vertical slice runnable at the end of every day.
2. Build the deterministic engine before depending on GPT or polished UI.
3. Use seeded demo content from the first vertical slice.
4. Treat security projections and reconnect behavior as core functionality.
5. Make the hidden-role path the hero demo; keep quiz/vote complete but visually simpler.
6. Defer every P1 task until all P0 release gates on the critical path pass.
7. Record the main Codex session and key decisions continuously, not on submission day.

## 3. Daily milestones

### 14 July — Contract and skeleton

Outcome: repository installs, builds and contains executable contracts/fixtures.

- Finish BF-001 through BF-008 planning controls.
- Scaffold BF-010 through BF-019.
- Define BF-030 through BF-038 at least to valid fixture level.
- Add seeded `Space Heist` and one quiz/vote fixture.
- Create first dated commit and begin the Codex evidence log.

Exit gate:

- root install/lint/typecheck/test/build commands exist;
- both GameSpec fixtures parse;
- invalid specs produce structured issues;
- no OpenAI or WebSocket dependency is needed yet.

### 15 July — Pure deterministic games

Outcome: both games run headlessly to completion and replay deterministically.

- Implement BF-050 through BF-056.
- Complete BF-060 through BF-066 for hidden roles.
- Complete BF-070 through BF-076 for quiz/vote.
- Start BF-160 through BF-163 while implementing, not afterward.

Exit gate:

- fixed action scripts complete both games;
- same spec/seed/actions yield the same checksum;
- player projection tests show no unauthorized secrets.

If late: reduce hidden-role phases and quiz question modes, never reduce validation or secret isolation.

### 16 July — Multiplayer vertical slice

Outcome: three browser clients can join and finish seeded games locally.

- Complete BF-080 through BF-088.
- Add BF-100 through BF-105 sufficient for blueprints, rooms, events and seeds.
- Build minimal BF-136 through BF-140 UI before visual polish.
- Add BF-164 multi-socket integration tests.

Exit gate:

- room code, lobby, start, actions, timer, results and reconnect work;
- every update is projected per player;
- seeded `Space Heist` completes through real sockets.

### 17 July — GPT generation and playtest

Outcome: GPT-5.6 can generate, critique and safely patch a GameSpec; fake provider remains available.

- Complete BF-110 through BF-124.
- Persist bounded patch revisions and before/after playtest evidence.
- Implement BF-132 through BF-135 in functional form.
- Add BF-165 workflow tests.
- Confirm GPT-5.6 access and request hackathon credits before their stated cutoff if still relevant.

Exit gate:

- live generation creates a valid spec or reports a truthful bounded failure;
- heuristic playtest always works;
- GPT playtest design maps only to fixed server-owned personas/policies;
- invalid balance patches never create revisions.

If API access is still unavailable: complete the provider and fake-path tests, keep all UI labels honest, and prioritize access resolution as the only external blocker.

### 18 July — Product experience and visual identity

Outcome: the full prompt-to-play flow is understandable and visually coherent on mobile.

- Complete BF-130 through BF-141.
- Integrate generation progress and before/after playtest report.
- Complete critical BF-150 through BF-157 security work.
- Run responsive QA BF-168 continuously.

Exit gate:

- a new user can complete the flow without developer explanation;
- hidden information remains private across normal, reconnect and error states;
- the four GPT-5.6 contributions are visible and accurately labeled.

### 19 July — Docker, deployment and hostile-path QA

Outcome: clean local setup and public hosted demo both work.

- Complete BF-180 through BF-190.
- Choose the provider in BF-185 based on available account/access.
- Finish BF-151 through BF-158 and BF-167.
- Execute hosted multi-device BF-188.
- Draft the English README BF-200 and architecture media BF-201.

Exit gate:

- fresh Docker volumes start with one command;
- public HTTPS/WSS demo completes both games;
- restart, API failure, reconnect and seeded fallback have been exercised.

### 20 July — Release candidate and video rehearsal

Outcome: code freezes on a reliable release candidate and the complete submission package is drafted.

- Finish BF-166, BF-169, BF-170 and BF-172.
- Complete BF-200 through BF-206.
- Finish Codex collaboration evidence BF-202.
- Run the compliance audit once before filming.
- Freeze non-blocking feature work at 22:00 CEST.

Exit gate:

- five consecutive demo rehearsals succeed;
- backup path has been rehearsed;
- narration consistently fits within 2:50;
- all README setup steps pass from a clean checkout.

### 21 July — Film, publish and submit

Outcome: valid submission is confirmed before 18:00 CEST.

- Record/upload BF-207 and BF-208 early.
- Complete BF-209 through BF-213.
- Retrieve and verify BF-211 `/feedback` Codex Session ID.
- Submit BF-214 and save confirmation.
- After confirmation, make no material changes unless the submission can be revalidated safely.

Latest recommended checkpoints:

- 10:00 CEST: final video take selected.
- 12:00 CEST: public YouTube, repository and demo URLs verified signed out.
- 15:00 CEST: Devpost draft fully populated.
- 17:00 CEST: final compliance audit.
- 18:00 CEST: submission completed.

## 4. Three-minute demo contract

Target runtime: **2 minutes 50 seconds**.

| Time | Evidence on screen | Narration goal |
| --- | --- | --- |
| 0:00–0:15 | Landing and one-sentence promise | BoardForge turns phones into a premium shared game night. |
| 0:15–0:35 | Select Movie Mime and a visual theme | Show a curated mechanic with meaningful, bounded customization. |
| 0:35–0:50 | Generate the movie card pack | OpenAI creates typed creative content while authored code owns the rules. |
| 0:50–1:05 | Virtual-agent release evidence | Show the deterministic release gate before a room can open. |
| 1:05–1:25 | Create a room and join from two devices/windows | Prove real multiplayer, not a static rules document. |
| 1:25–2:05 | Form teams, choose captains and play a turn | Prove private views and authoritative real-time state. |
| 2:05–2:28 | Cut between Word Duel and Second Sense | Show two genuinely different designed experiences and interactions. |
| 2:28–2:42 | Typed AI and deterministic architecture | Show bounded content, validated data, replay and private projection. |
| 2:42–2:50 | Collection and closing line | Seven games today, one coherent platform for game night. |

The recording may use audited fallback content to control latency, but it must not falsely label fallback output as a live OpenAI call.

## 5. Cut order when schedule slips

Cut in this order:

1. decorative audio and complex animation;
2. host-controlled pacing and extra events;
3. checkpoint restore beyond a documented restart fallback;
4. optional live GPT action selection showcase;
5. extra quiz question modes beyond multiple choice plus one party-vote mode;
6. optional public sharing/polish outside the room link;
7. separate Vercel frontend deployment—serve the web app with the backend if faster.

Never cut:

- strict GameSpec validation;
- deterministic server engine;
- per-player secret projection;
- both playable template paths;
- Docker Compose and seeded data;
- truthful GPT/Codex demonstration;
- README, video, repository and `/feedback` requirements.

## 6. Risk register

| Risk | Trigger | Mitigation | Fallback/decision deadline |
| --- | --- | --- | --- |
| GPT-5.6 access delayed | No successful test call by 17 July morning | Provider abstraction, fake provider, official access follow-up | Seeded demo remains usable; submission must still show genuine GPT-5.6 use before filming |
| LLM latency/cost too high | Prompt-to-patch exceeds demo budget | Compact schemas/evidence, strict output bounds, one repair, cached seeded scenario | Record generation separately or use controlled live call with truthful labels |
| Hidden-role module overruns | No headless completion by 15 July evening | Reduce phase/card variety to minimum complete loop | Keep briefing, mission, discussion, vote, resolution only |
| Quiz module overruns | No headless completion by 16 July morning | Limit to multiple-choice and one player-vote mode | Keep one scoring mode per question type |
| Secret leakage | Any unauthorized secret in payload/log/test | Stop feature work; fix projection and add regression test | Release blocker; no acceptance of risk |
| WebSocket hosting incompatible | Hosted three-client test fails on 19 July | Select single-instance WebSocket-capable provider and verify timeouts | Serve web/backend together on alternative provider; local Compose remains judge path |
| Server restart loses room | Recovery incomplete | Seeded rooms, checkpoints/events, clear restart behavior | Do not restart during demo; show reproducible new-room flow |
| Mobile UI unreadable in video | Controls/text fail phone viewport | Larger touch targets, simplified room layout, restrained motion | Film phone-sized desktop windows at readable zoom |
| Demo API outage | GPT call fails during recording/judging | Seeded blueprints and stored playtest report, visible status | Judges can test both games without API key; do not claim live generation |
| Solo workload exceeds capacity | P0 critical-path milestone missed by > half day | Apply cut order and stop all P1 work | Preserve one exceptional hero path plus complete second template core |
| Submission/upload failure | Video or Devpost incomplete on 21 July | Internal 18:00 CEST cutoff and early public-link verification | Use backup video export and saved submission copy |
| Unlicensed material | Asset provenance unclear | Use self-created visuals and no copyrighted music/trademarks | Remove questionable asset before recording |

## 7. External decisions and credentials

Only these items remain externally dependent:

- OpenAI API key and confirmed GPT-5.6 access;
- hosting account/provider choice;
- deployment secrets and any billing approval;
- GitHub repository publication/remote configuration;
- YouTube upload;
- Devpost final submission and `/feedback` session retrieval.

All architecture and local implementation work can proceed before those are resolved.

## 8. Final compliance evidence

Keep a private/local checklist with:

- eligibility and representative identity;
- public repository URL and MIT license;
- clean secret scan result;
- hosted demo URL and test instructions;
- signed-out YouTube verification;
- video duration and audio check;
- README section explaining Codex collaboration;
- dated commit history during the submission window;
- primary `/feedback` Codex Session ID;
- Devpost category and completed English description;
- saved final submission confirmation.

Official references:

- [OpenAI Build Week rules](https://openai.devpost.com/rules)
- [OpenAI API model documentation](https://developers.openai.com/api/docs/models)
