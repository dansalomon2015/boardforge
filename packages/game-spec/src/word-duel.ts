import { z } from "zod";
import { composedThemeIdSchema, validateComposedGameSpec, type ComposedGameSpec, type ComposedTheme } from "./composed";

export const wordDuelDifficultySchema = z.enum(["easy", "classic", "expert"]);
export const wordDuelSetupSchema = z.object({
  themeId: composedThemeIdSchema.default("minimal"),
  difficulty: wordDuelDifficultySchema.default("classic"),
}).strict();

export type WordDuelDifficulty = z.infer<typeof wordDuelDifficultySchema>;
export type WordDuelSetupInput = z.input<typeof wordDuelSetupSchema>;
export type WordDuelSetup = z.output<typeof wordDuelSetupSchema>;

export const wordDuelRanges: Record<WordDuelDifficulty, { min: number; max: number; label: string }> = {
  easy: { min: 4, max: 6, label: "Easy words" },
  classic: { min: 5, max: 9, label: "Classic duel" },
  expert: { min: 7, max: 12, label: "Expert words" },
};

function numberHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16_777_619); }
  return hash >>> 0;
}

export function createWordDuelSpec(setupInput: WordDuelSetupInput): ComposedGameSpec {
  const setup = wordDuelSetupSchema.parse(setupInput);
  const range = wordDuelRanges[setup.difficulty];
  const theme: ComposedTheme = setup.themeId;
  const suffix = numberHash(`word-duel-v1:${setup.themeId}:${setup.difficulty}`).toString(36);
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `word_duel_${suffix}`.slice(0, 48),
    template: "composed",
    title: "WordDuel",
    description: "Lock in a secret word, test your opponent one letter at a time, and crack their word before they crack yours.",
    theme,
    minPlayers: 2,
    maxPlayers: 2,
    suggestedDurationMinutes: 12,
    setup: { mode: "individual", rounds: 1, startingPhaseId: "choose_words", startingPlayer: "random" },
    variables: [], choices: [], clues: [], reveals: [], orderingItems: [], matchingItems: [], decks: [], boards: [], resources: [], randomizers: [], media: [],
    components: [
      { id: "game_header", kind: "header", audience: "public", eyebrow: "BoardForge Original", title: { kind: "literal", value: "WordDuel" }, description: { kind: "literal", value: "Two secret words. Twenty-six letters. One winner." }, icon: "W" },
      { id: "duel_board", kind: "word_duel", audience: "public", minLength: range.min, maxLength: range.max },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "players", kind: "players", audience: "public" },
      { id: "outcome", kind: "outcome", audience: "public", title: { kind: "literal", value: "Word cracked" }, description: { kind: "literal", value: "The winning word has been revealed." } },
    ],
    actions: [
      { id: "lock_word", label: "Lock my word", kind: "secret_word", actor: "all_players", oncePerPhase: true, wordDuelId: "duel_board", effects: [{ kind: "register_secret_word", wordDuelId: "duel_board" }] },
      { id: "guess_letter", label: "Play this letter", kind: "letter_guess", actor: "active_player", oncePerPhase: false, wordDuelId: "duel_board", effects: [{ kind: "guess_letter", wordDuelId: "duel_board" }, { kind: "set_active_player", mode: "next" }] },
      { id: "solve_word", label: "Solve the word", kind: "word_guess", actor: "active_player", oncePerPhase: false, wordDuelId: "duel_board", effects: [{ kind: "guess_word", wordDuelId: "duel_board" }, { kind: "set_active_player", mode: "next" }] },
    ],
    rules: [],
    phases: [
      { id: "choose_words", title: "Choose your secret word", componentIds: ["game_header", "duel_board", "players"], actionIds: ["lock_word"], nextPhaseId: "duel", completionMode: "all", completionConditions: [{ kind: "all_players_acted", actionId: "lock_word" }], onComplete: [] },
      { id: "duel", title: "The duel is live", componentIds: ["game_header", "duel_board", "turn", "players", "outcome"], actionIds: ["guess_letter", "solve_word"], completionMode: "manual", completionConditions: [], onComplete: [] },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok) throw new Error(`Invalid WordDuel GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`);
  return validation.spec;
}

export const defaultWordDuelSpec = createWordDuelSpec({ themeId: "minimal", difficulty: "classic" });
