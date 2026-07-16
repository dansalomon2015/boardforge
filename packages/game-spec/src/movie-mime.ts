import { z } from "zod";
import {
  composedThemeIdSchema,
  validateComposedGameSpec,
  type ComposedGameSpec,
  type ComposedTheme,
} from "./composed";

const movieGenreSchema = z.enum([
  "action",
  "adventure",
  "animation",
  "comedy",
  "crime",
  "drama",
  "family",
  "fantasy",
  "horror",
  "musical",
  "romance",
  "science_fiction",
  "sport",
  "thriller",
]);

const movieAudienceSchema = z.enum(["family", "general"]);
const movieDifficultySchema = z.enum(["easy", "medium", "hard"]);

export const movieCatalogEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/).max(48),
    title: z.string().trim().min(1).max(100),
    year: z.number().int().min(1888).max(2030),
    genres: z.array(movieGenreSchema).min(1).max(3),
    audience: movieAudienceSchema,
    difficulty: movieDifficultySchema,
  })
  .strict();

export const movieMimeSetupSchema = z
  .object({
    themeId: composedThemeIdSchema.default("noir"),
    filmCount: z.number().int().min(6).max(40).default(20),
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z
      .array(z.object({
        name: z.string().trim().min(2).max(24),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }).strict())
      .min(2)
      .max(4)
      .default([
        { name: "Les Projecteurs", color: "#6c42f5" },
        { name: "Les Clapboards", color: "#ff6b4a" },
      ]),
  })
  .superRefine((setup, context) => {
    const names = setup.teams.map((team) => team.name.toLocaleLowerCase("fr"));
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: "custom", path: ["teams"], message: "Team names must be unique." });
    }
  })
  .strict();

export const mimeFilmPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    game: z.literal("movie_mime"),
    source: z.enum(["random", "ai"]),
    themeId: composedThemeIdSchema,
    preferences: z.string().trim().min(3).max(240).optional(),
    teams: z.array(z.object({
      id: z.string().regex(/^[a-z][a-z0-9_]*$/).max(48),
      name: z.string().trim().min(2).max(24),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }).strict()).min(2).max(4),
    films: z.array(movieCatalogEntrySchema).min(6).max(40),
  })
  .strict();

export type MovieGenre = z.infer<typeof movieGenreSchema>;
export type MovieCatalogEntry = z.infer<typeof movieCatalogEntrySchema>;
export type MovieMimeSetupInput = z.input<typeof movieMimeSetupSchema>;
export type MovieMimeSetup = z.output<typeof movieMimeSetupSchema>;
export type MimeFilmPack = z.infer<typeof mimeFilmPackSchema>;

export const movieCatalog: readonly MovieCatalogEntry[] = [
  { id: "back_to_the_future", title: "Retour vers le futur", year: 1985, genres: ["science_fiction", "comedy"], audience: "family", difficulty: "easy" },
  { id: "the_lion_king", title: "Le Roi Lion", year: 1994, genres: ["animation", "family"], audience: "family", difficulty: "easy" },
  { id: "titanic", title: "Titanic", year: 1997, genres: ["drama", "romance"], audience: "general", difficulty: "easy" },
  { id: "matrix", title: "Matrix", year: 1999, genres: ["science_fiction", "action"], audience: "general", difficulty: "easy" },
  { id: "jaws", title: "Les Dents de la mer", year: 1975, genres: ["thriller", "horror"], audience: "general", difficulty: "easy" },
  { id: "ghostbusters", title: "SOS Fantômes", year: 1984, genres: ["comedy", "fantasy"], audience: "family", difficulty: "easy" },
  { id: "rocky", title: "Rocky", year: 1976, genres: ["sport", "drama"], audience: "general", difficulty: "easy" },
  { id: "jurassic_park", title: "Jurassic Park", year: 1993, genres: ["adventure", "science_fiction"], audience: "family", difficulty: "easy" },
  { id: "home_alone", title: "Maman, j’ai raté l’avion", year: 1990, genres: ["comedy", "family"], audience: "family", difficulty: "easy" },
  { id: "harry_potter", title: "Harry Potter à l’école des sorciers", year: 2001, genres: ["fantasy", "adventure"], audience: "family", difficulty: "easy" },
  { id: "finding_nemo", title: "Le Monde de Nemo", year: 2003, genres: ["animation", "family"], audience: "family", difficulty: "easy" },
  { id: "mission_impossible", title: "Mission: Impossible", year: 1996, genres: ["action", "thriller"], audience: "general", difficulty: "easy" },
  { id: "star_wars", title: "Star Wars", year: 1977, genres: ["science_fiction", "adventure"], audience: "family", difficulty: "easy" },
  { id: "indiana_jones", title: "Les Aventuriers de l’arche perdue", year: 1981, genres: ["adventure", "action"], audience: "family", difficulty: "medium" },
  { id: "the_mask", title: "The Mask", year: 1994, genres: ["comedy", "fantasy"], audience: "family", difficulty: "easy" },
  { id: "toy_story", title: "Toy Story", year: 1995, genres: ["animation", "family"], audience: "family", difficulty: "easy" },
  { id: "shrek", title: "Shrek", year: 2001, genres: ["animation", "comedy"], audience: "family", difficulty: "easy" },
  { id: "ratatouille", title: "Ratatouille", year: 2007, genres: ["animation", "comedy"], audience: "family", difficulty: "easy" },
  { id: "up", title: "Là-haut", year: 2009, genres: ["animation", "adventure"], audience: "family", difficulty: "medium" },
  { id: "inside_out", title: "Vice-Versa", year: 2015, genres: ["animation", "family"], audience: "family", difficulty: "medium" },
  { id: "frozen", title: "La Reine des neiges", year: 2013, genres: ["animation", "musical"], audience: "family", difficulty: "easy" },
  { id: "moana", title: "Vaiana", year: 2016, genres: ["animation", "adventure"], audience: "family", difficulty: "easy" },
  { id: "pirates_caribbean", title: "Pirates des Caraïbes", year: 2003, genres: ["adventure", "fantasy"], audience: "family", difficulty: "easy" },
  { id: "karate_kid", title: "Karaté Kid", year: 1984, genres: ["sport", "drama"], audience: "family", difficulty: "medium" },
  { id: "et", title: "E.T. l’extra-terrestre", year: 1982, genres: ["science_fiction", "family"], audience: "family", difficulty: "easy" },
  { id: "grease", title: "Grease", year: 1978, genres: ["musical", "romance"], audience: "general", difficulty: "easy" },
  { id: "dirty_dancing", title: "Dirty Dancing", year: 1987, genres: ["romance", "musical"], audience: "general", difficulty: "easy" },
  { id: "the_truman_show", title: "The Truman Show", year: 1998, genres: ["drama", "comedy"], audience: "general", difficulty: "medium" },
  { id: "forrest_gump", title: "Forrest Gump", year: 1994, genres: ["drama", "comedy"], audience: "general", difficulty: "medium" },
  { id: "amelie", title: "Le Fabuleux Destin d’Amélie Poulain", year: 2001, genres: ["romance", "comedy"], audience: "general", difficulty: "medium" },
  { id: "intouchables", title: "Intouchables", year: 2011, genres: ["comedy", "drama"], audience: "general", difficulty: "easy" },
  { id: "the_fifth_element", title: "Le Cinquième Élément", year: 1997, genres: ["science_fiction", "action"], audience: "general", difficulty: "medium" },
  { id: "avatar", title: "Avatar", year: 2009, genres: ["science_fiction", "adventure"], audience: "family", difficulty: "easy" },
  { id: "inception", title: "Inception", year: 2010, genres: ["science_fiction", "thriller"], audience: "general", difficulty: "hard" },
  { id: "interstellar", title: "Interstellar", year: 2014, genres: ["science_fiction", "drama"], audience: "general", difficulty: "hard" },
  { id: "the_lord_rings", title: "Le Seigneur des anneaux", year: 2001, genres: ["fantasy", "adventure"], audience: "family", difficulty: "easy" },
  { id: "gladiator", title: "Gladiator", year: 2000, genres: ["action", "drama"], audience: "general", difficulty: "easy" },
  { id: "the_godfather", title: "Le Parrain", year: 1972, genres: ["crime", "drama"], audience: "general", difficulty: "medium" },
  { id: "pulp_fiction", title: "Pulp Fiction", year: 1994, genres: ["crime", "comedy"], audience: "general", difficulty: "hard" },
  { id: "oceans_eleven", title: "Ocean’s Eleven", year: 2001, genres: ["crime", "comedy"], audience: "general", difficulty: "medium" },
  { id: "the_grand_budapest", title: "The Grand Budapest Hotel", year: 2014, genres: ["comedy", "crime"], audience: "general", difficulty: "hard" },
  { id: "groundhog_day", title: "Un jour sans fin", year: 1993, genres: ["comedy", "fantasy"], audience: "general", difficulty: "medium" },
  { id: "the_terminal", title: "Le Terminal", year: 2004, genres: ["comedy", "drama"], audience: "family", difficulty: "medium" },
  { id: "cast_away", title: "Seul au monde", year: 2000, genres: ["adventure", "drama"], audience: "general", difficulty: "easy" },
  { id: "the_martian", title: "Seul sur Mars", year: 2015, genres: ["science_fiction", "comedy"], audience: "general", difficulty: "medium" },
  { id: "night_museum", title: "La Nuit au musée", year: 2006, genres: ["comedy", "family"], audience: "family", difficulty: "easy" },
  { id: "men_in_black", title: "Men in Black", year: 1997, genres: ["science_fiction", "comedy"], audience: "family", difficulty: "easy" },
  { id: "the_incredibles", title: "Les Indestructibles", year: 2004, genres: ["animation", "action"], audience: "family", difficulty: "easy" },
  { id: "kung_fu_panda", title: "Kung Fu Panda", year: 2008, genres: ["animation", "comedy"], audience: "family", difficulty: "easy" },
  { id: "wall_e", title: "WALL-E", year: 2008, genres: ["animation", "science_fiction"], audience: "family", difficulty: "medium" },
  { id: "coco", title: "Coco", year: 2017, genres: ["animation", "musical"], audience: "family", difficulty: "easy" },
  { id: "zootopia", title: "Zootopie", year: 2016, genres: ["animation", "comedy"], audience: "family", difficulty: "medium" },
  { id: "the_artist", title: "The Artist", year: 2011, genres: ["drama", "romance"], audience: "general", difficulty: "hard" },
  { id: "la_la_land", title: "La La Land", year: 2016, genres: ["musical", "romance"], audience: "general", difficulty: "medium" },
  { id: "top_gun", title: "Top Gun", year: 1986, genres: ["action", "drama"], audience: "general", difficulty: "easy" },
  { id: "the_devil_wears_prada", title: "Le Diable s’habille en Prada", year: 2006, genres: ["comedy", "drama"], audience: "general", difficulty: "medium" },
  { id: "school_of_rock", title: "Rock Academy", year: 2003, genres: ["comedy", "musical"], audience: "family", difficulty: "easy" },
  { id: "paddington", title: "Paddington", year: 2014, genres: ["family", "comedy"], audience: "family", difficulty: "easy" },
  { id: "the_wizard_oz", title: "Le Magicien d’Oz", year: 1939, genres: ["fantasy", "musical"], audience: "family", difficulty: "medium" },
  { id: "singin_in_rain", title: "Chantons sous la pluie", year: 1952, genres: ["musical", "comedy"], audience: "family", difficulty: "hard" },
];

const genreLabels: Record<MovieGenre, string> = {
  action: "Action",
  adventure: "Aventure",
  animation: "Animation",
  comedy: "Comédie",
  crime: "Policier",
  drama: "Drame",
  family: "Famille",
  fantasy: "Fantastique",
  horror: "Horreur",
  musical: "Comédie musicale",
  romance: "Romance",
  science_fiction: "Science-fiction",
  sport: "Sport",
  thriller: "Thriller",
};

const genreIcons: Record<MovieGenre, string> = {
  action: "💥",
  adventure: "🗺️",
  animation: "✨",
  comedy: "😄",
  crime: "🕵️",
  drama: "🎭",
  family: "🍿",
  fantasy: "🪄",
  horror: "👻",
  musical: "🎵",
  romance: "💞",
  science_fiction: "🚀",
  sport: "🏆",
  thriller: "⏱️",
};

function numberHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values];
  let state = numberHash(seed) || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const selected = state % (index + 1);
    [shuffled[index], shuffled[selected]] = [shuffled[selected]!, shuffled[index]!];
  }
  return shuffled;
}

export function createMovieMimePack(
  setupInput: MovieMimeSetupInput,
  filmIds: readonly string[],
  source: MimeFilmPack["source"],
): MimeFilmPack {
  const setup = movieMimeSetupSchema.parse(setupInput);
  if (filmIds.length !== setup.filmCount) {
    throw new Error(`Movie mime pack requires exactly ${setup.filmCount} films.`);
  }
  if (new Set(filmIds).size !== filmIds.length) throw new Error("Movie mime pack cannot contain duplicate films.");
  const catalogById = new Map(movieCatalog.map((film) => [film.id, film]));
  const films = filmIds.map((id) => {
    const film = catalogById.get(id);
    if (!film) throw new Error(`Unknown movie catalog id: ${id}`);
    return film;
  });
  return mimeFilmPackSchema.parse({
    schemaVersion: 1,
    game: "movie_mime",
    source,
    themeId: setup.themeId,
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    teams: setup.teams.map((team, index) => ({ id: `team_${index + 1}`, ...team })),
    films,
  });
}

export function createRandomMovieMimePack(
  setupInput: MovieMimeSetupInput,
  seed: string,
): MimeFilmPack {
  const setup = movieMimeSetupSchema.parse(setupInput);
  const films = deterministicShuffle(movieCatalog, seed).slice(0, setup.filmCount);
  return createMovieMimePack(setup, films.map((film) => film.id), "random");
}

export function createMovieMimeSpec(packInput: MimeFilmPack): ComposedGameSpec {
  const pack = mimeFilmPackSchema.parse(packInput);
  const rounds = pack.films.length;
  const theme: ComposedTheme = pack.themeId;
  const suffix = numberHash(`captain-loop-v1:${pack.themeId}:${pack.films.map((film) => film.id).join(":")}`).toString(36);
  const spec: ComposedGameSpec = {
    schemaVersion: 2,
    id: `movie_mime_${suffix}`.slice(0, 48),
    template: "composed",
    title: "CinéMimes",
    description: pack.preferences
      ? `Une partie de mime personnalisée autour de ${pack.preferences}.`
      : "Des équipes font deviner des films en les mimant, sans parler ni écrire.",
    theme,
    minPlayers: pack.teams.length,
    maxPlayers: 12,
    suggestedDurationMinutes: Math.max(8, Math.ceil(rounds * 1.2)),
    setup: {
      mode: "teams",
      teamPolicy: {
        teams: pack.teams,
        minMembersPerTeam: 1,
        maxMembersPerTeam: 6,
        allocation: "balanced",
        allowUnevenTeams: true,
        rotateActivePlayer: true,
      },
      rounds,
      startingPhaseId: "select_mimer",
      startingPlayer: "random",
    },
    variables: [],
    choices: [],
    clues: [],
    reveals: [],
    orderingItems: [],
    matchingItems: [],
    boards: [],
    resources: [],
    randomizers: [],
    media: [],
    decks: [{
      id: "films",
      name: "Films à mimer",
      visibility: "private",
      shuffle: true,
      initialHandSize: 0,
      cards: pack.films.map((film) => ({
        id: film.id,
        title: film.title,
        body: `${film.year} · ${film.genres.map((genre) => genreLabels[genre]).join(" · ")} · difficulté ${film.difficulty}`,
        icon: genreIcons[film.genres[0] ?? "drama"],
        tags: film.genres,
      })),
    }],
    components: [
      { id: "game_header", kind: "header", audience: "public", eyebrow: "BoardForge présente", title: { kind: "literal", value: "CinéMimes" }, description: { kind: "literal", value: "Un film secret, un mime, une équipe pour le reconnaître." }, icon: "🎬" },
      { id: "film_deck", kind: "deck", audience: "active_player", deckId: "films", label: "Film secret" },
      { id: "film_prompt", kind: "prompt", audience: "active_player", category: "À mimer sans parler", prompt: { kind: "active_card", deckId: "films", field: "title" }, hint: { kind: "active_card", deckId: "films", field: "body" }, icon: "🎭" },
      { id: "mime_timer", kind: "timer", audience: "public", seconds: 60, label: "Temps restant" },
      { id: "turn", kind: "turn", audience: "public" },
      { id: "round", kind: "round", audience: "public", label: "Film" },
      { id: "teams", kind: "teams", audience: "public" },
      { id: "scores", kind: "scores", audience: "public", title: "Box-office des équipes" },
      { id: "outcome", kind: "outcome", audience: "public", title: { kind: "literal", value: "Fin de la séance !" }, description: { kind: "literal", value: "L’équipe avec le plus de films trouvés remporte la partie." } },
    ],
    actions: [
      { id: "select_mimer", label: "Choisir le mimeur", kind: "select_player", actor: "team_captain", oncePerPhase: true, effects: [{ kind: "set_active_player", mode: "selected" }, { kind: "advance_phase" }] },
      { id: "draw_film", label: "Découvrir mon film", kind: "draw", actor: "active_player", oncePerPhase: true, deckId: "films", effects: [{ kind: "draw_cards", deckId: "films", count: 1, target: "actor" }, { kind: "advance_phase" }] },
      { id: "film_guessed", label: "Film trouvé", kind: "complete_challenge", actor: "active_player", oncePerPhase: true, effects: [{ kind: "add_score", target: "actor_team", amount: 1 }, { kind: "discard_selected_card", deckId: "films" }, { kind: "advance_round", resetPhaseActions: true }, { kind: "set_active_player", mode: "next_team_captain" }, { kind: "advance_phase" }] },
      { id: "film_passed", label: "Passer", kind: "advance", actor: "active_player", oncePerPhase: true, effects: [{ kind: "discard_selected_card", deckId: "films" }, { kind: "advance_round", resetPhaseActions: true }, { kind: "set_active_player", mode: "next_team_captain" }, { kind: "advance_phase" }] },
    ],
    rules: [
      { id: "end_after_success", trigger: { kind: "after_action", actionId: "film_guessed" }, conditionMode: "all", conditions: [{ kind: "round_at_least", round: rounds + 1 }], effects: [{ kind: "end_game", winnerBy: "highest_score" }] },
      { id: "end_after_pass", trigger: { kind: "after_action", actionId: "film_passed" }, conditionMode: "all", conditions: [{ kind: "round_at_least", round: rounds + 1 }], effects: [{ kind: "end_game", winnerBy: "highest_score" }] },
    ],
    phases: [
      { id: "select_mimer", title: "Le capitaine choisit", componentIds: ["game_header", "round", "turn", "teams", "scores"], actionIds: ["select_mimer"], nextPhaseId: "draw", completionMode: "manual", completionConditions: [], onComplete: [] },
      { id: "draw", title: "Le prochain film", componentIds: ["game_header", "round", "turn", "teams", "scores", "film_deck"], actionIds: ["draw_film"], nextPhaseId: "mime", completionMode: "manual", completionConditions: [], onComplete: [] },
      { id: "mime", title: "Silence, ça mime !", componentIds: ["game_header", "round", "turn", "teams", "scores", "mime_timer", "film_prompt"], actionIds: ["film_guessed", "film_passed"], nextPhaseId: "select_mimer", completionMode: "manual", completionConditions: [], onComplete: [] },
    ],
  };
  const validation = validateComposedGameSpec(spec);
  if (!validation.ok) {
    throw new Error(`Invalid movie mime GameSpec: ${validation.issues.map((issue) => `${issue.code}:${issue.path}`).join(", ")}`);
  }
  return validation.spec;
}

export const defaultMovieMimePack = createRandomMovieMimePack(
  { themeId: "noir", filmCount: 20 },
  "boardforge-default-movie-mime",
);

export const defaultMovieMimeSpec = createMovieMimeSpec(defaultMovieMimePack);
