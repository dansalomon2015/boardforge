import { DrawBattleStage } from "./draw-battle-stage";
import { ComposedStage } from "./generic-stage";
import { MovieMimeStage } from "./movie-mime-stage";
import { SecondSenseStage } from "./second-sense-stage";
import { SoundCheckStage } from "./sound-check-stage";
import { StoryChainStage } from "./story-chain-stage";
import type { ComposedStageProps } from "./stage-shared";
import { WordDuelStage } from "./word-duel-stage";
import { WordTrapStage } from "./word-trap-stage";

export function ComposedStageRouter({
  view,
  isHost,
  pending,
  gameNightCode,
  createStoryBook,
  sendAction,
}: ComposedStageProps & { isHost: boolean; gameNightCode: string | null; createStoryBook: () => void }) {
  switch (view.experienceId) {
    case "movie_mime":
      return <MovieMimeStage view={view} pending={pending} gameNightCode={gameNightCode} sendAction={sendAction} />;
    case "word_trap":
      return <WordTrapStage view={view} pending={pending} gameNightCode={gameNightCode} sendAction={sendAction} />;
    case "draw_battle":
      return <DrawBattleStage view={view} pending={pending} gameNightCode={gameNightCode} sendAction={sendAction} />;
    case "sound_check":
      return <SoundCheckStage view={view} pending={pending} gameNightCode={gameNightCode} sendAction={sendAction} />;
    case "story_chain":
      return (
        <StoryChainStage view={view} pending={pending} createStoryBook={createStoryBook} sendAction={sendAction} />
      );
    case "word_duel":
      return <WordDuelStage view={view} pending={pending} sendAction={sendAction} />;
    case "second_sense":
      return <SecondSenseStage view={view} isHost={isHost} pending={pending} sendAction={sendAction} />;
    case "generic":
      return <ComposedStage view={view} pending={pending} sendAction={sendAction} />;
  }
}
