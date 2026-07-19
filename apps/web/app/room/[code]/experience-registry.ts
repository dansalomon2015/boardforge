import type { ComposedExperienceId, LobbyView } from "@boardforge/shared";

type OriginalExperienceId = Exclude<ComposedExperienceId, "generic">;

type ExperienceMetadata = {
  dataAttribute: string;
  displayName: string;
  editionNumber: string;
  lobbyEyebrow: string;
  waitingPrompt: string;
  facts: (view: LobbyView) => string[];
};

const teamCount = (view: LobbyView) => view.teamSetup?.teams.length ?? 2;
const turnDuration = (view: LobbyView, fallback: number) => view.game.turnSeconds ?? fallback;
const contentCount = (view: LobbyView, fallback: number) => view.game.rounds ?? fallback;

const experienceRegistry: Record<OriginalExperienceId, ExperienceMetadata> = {
  movie_mime: {
    dataAttribute: "cinemimes",
    displayName: "CineMimes",
    editionNumber: "01",
    lobbyEyebrow: "Casting in progress",
    waitingPrompt: "The room is not ready yet",
    facts: (view) => [
      `🎬 ${contentCount(view, 20)} movies`,
      `⏱ ${turnDuration(view, 60)} seconds`,
      `✦ ${teamCount(view)} teams`,
    ],
  },
  word_trap: {
    dataAttribute: "word-trap",
    displayName: "WordTrap",
    editionNumber: "02",
    lobbyEyebrow: "Teams are entering the trap",
    waitingPrompt: "The room is not ready yet",
    facts: (view) => [
      `⚡ ${contentCount(view, 20)} words`,
      `⏱ ${turnDuration(view, 60)} seconds`,
      `✦ ${teamCount(view)} teams`,
    ],
  },
  draw_battle: {
    dataAttribute: "draw-battle",
    displayName: "DrawBattle",
    editionNumber: "03",
    lobbyEyebrow: "The gallery is opening",
    waitingPrompt: "The room is not ready yet",
    facts: (view) => [
      `✎ ${contentCount(view, 16)} prompts`,
      `⏱ ${turnDuration(view, 75)} seconds`,
      `✦ ${teamCount(view)} teams`,
    ],
  },
  sound_check: {
    dataAttribute: "sound-check",
    displayName: "SoundCheck",
    editionNumber: "04",
    lobbyEyebrow: "The studio is warming up",
    waitingPrompt: "The room is not ready yet",
    facts: (view) => [
      `◖ ${contentCount(view, 16)} sounds`,
      `⏱ ${turnDuration(view, 60)} seconds`,
      `✦ ${teamCount(view)} teams`,
    ],
  },
  story_chain: {
    dataAttribute: "story-chain",
    displayName: "StoryChain",
    editionNumber: "05",
    lobbyEyebrow: "The first page is waiting",
    waitingPrompt: "Invite one more storyteller",
    facts: () => ["✦ One shared story", "⌁ Secret twists", "♡ No teams, no score"],
  },
  word_duel: {
    dataAttribute: "word-duel",
    displayName: "WordDuel",
    editionNumber: "06",
    lobbyEyebrow: "The challenger is waiting",
    waitingPrompt: "Invite your rival",
    facts: () => ["W Secret words", "⌨ Playable keyboard", "⚔ Exactly 2 players"],
  },
  second_sense: {
    dataAttribute: "second-sense",
    displayName: "Second Sense",
    editionNumber: "07",
    lobbyEyebrow: "The pulse is waiting",
    waitingPrompt: "Invite at least one timekeeper",
    facts: () => ["◉ Invisible clock", "⌁ Knockout rounds", "✦ 2–12 players"],
  },
};

export function originalExperience(experienceId: ComposedExperienceId | undefined): ExperienceMetadata | undefined {
  if (!experienceId || experienceId === "generic") return undefined;
  return experienceRegistry[experienceId];
}
