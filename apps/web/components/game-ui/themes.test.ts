import { describe, expect, it } from "vitest";
import { gameThemeList, gameThemeStyle, gameThemes, resolveGameTheme } from "./themes";

describe("game themes", () => {
  it("provides exactly twenty named atmospheres", () => {
    expect(gameThemeList).toHaveLength(20);
    expect(new Set(gameThemeList.map((theme) => theme.id)).size).toBe(20);
  });

  it("maps a theme name to reusable CSS variables", () => {
    const style = gameThemeStyle("cosmic");
    expect(style["--game-primary"]).toBe(gameThemes.cosmic.colors.primary);
    expect(style["--game-bg"]).toBe(gameThemes.cosmic.colors.background);
    expect(style["--game-radius"]).toBe("24px");
  });

  it("accepts a fully custom theme object", () => {
    const custom = { ...gameThemes.minimal, id: "brand", name: "Brand" };
    expect(resolveGameTheme(custom)).toBe(custom);
    expect(gameThemeStyle(custom)["--game-primary"]).toBe(custom.colors.primary);
  });
});
