import type { ComposedGameView, ComposedTheme, GameAction } from "@boardforge/shared";
import type { GameTheme, GameThemeInput, GameThemeName } from "../../../components/game-ui";

export type ComposedStageProps = {
  view: ComposedGameView;
  pending: boolean;
  sendAction: (action: GameAction) => void;
};

export function themeForRoom(theme: ComposedTheme): GameThemeInput {
  if (typeof theme === "string") return theme as GameThemeName;
  const customTheme: GameTheme = {
    id: theme.id,
    name: theme.name,
    emoji: "🎲",
    description: "Custom atmosphere defined by the GameSpec.",
    colors: theme.colors,
    radius: theme.radius,
    shadow: "0 18px 55px rgba(0, 0, 0, .2)",
  };
  return customTheme;
}
