import { storyBookInputSchema, type StoryBookInput } from "@boardforge/game-spec";
import { GameRuleError } from "@boardforge/game-engine";
import { viewFor, type Room } from "./room-runtime";

type StoryEntryView = {
  authorName: string;
  text: string;
};

export function storyBookInputForRoom(room: Room, playerId: string): StoryBookInput {
  const view = viewFor(room, playerId);
  if (
    view.kind !== "composed" ||
    view.experienceId !== "story_chain" ||
    view.status !== "completed" ||
    room.spec.template !== "composed"
  ) {
    throw new GameRuleError("A book can only be created after a completed StoryChain game.");
  }
  const header = view.components.find((component) => component.kind === "header")?.data;
  const story = view.components.find((component) => component.kind === "story")?.data;
  const title = typeof header?.title === "string" ? header.title : "Our StoryChain Tale";
  const opening = typeof story?.opening === "string" ? story.opening : undefined;
  const entries = Array.isArray(story?.entries)
    ? story.entries.flatMap((entry): StoryEntryView[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const candidate = entry as Record<string, unknown>;
        return typeof candidate.actorName === "string" && typeof candidate.text === "string"
          ? [{ authorName: candidate.actorName, text: candidate.text }]
          : [];
      })
    : [];
  const parsed = storyBookInputSchema.safeParse({
    title,
    opening,
    authors: [...room.players.values()].map((player) => player.name),
    entries,
  });
  if (!parsed.success) throw new GameRuleError("The completed manuscript is not ready to become a book.");
  return parsed.data;
}
