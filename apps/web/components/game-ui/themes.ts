import type { CSSProperties } from "react";

export type GameTheme = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    muted: string;
    primary: string;
    secondary: string;
    accent: string;
    border: string;
  };
  radius: "soft" | "round" | "sharp";
  shadow: string;
};

const defineTheme = (theme: GameTheme) => theme;

export const gameThemes = {
  arcade: defineTheme({ id: "arcade", name: "Arcade", emoji: "🕹️", description: "Néons, pixels et énergie compétitive.", colors: { background: "#0b0920", surface: "#17133a", surfaceAlt: "#211b4e", text: "#f7f2ff", muted: "#aaa0d5", primary: "#9c5cff", secondary: "#12dff3", accent: "#ff4fa3", border: "#423a75" }, radius: "round", shadow: "0 18px 55px rgba(0, 0, 0, .35)" }),
  tropical: defineTheme({ id: "tropical", name: "Tropical", emoji: "🌴", description: "Cocktails, soleil et couleurs fruitées.", colors: { background: "#fff5dc", surface: "#fffdf5", surfaceAlt: "#ffe9b8", text: "#173b3a", muted: "#637a6f", primary: "#ff6b4a", secondary: "#16a6a1", accent: "#f7c843", border: "#edcf99" }, radius: "round", shadow: "0 18px 45px rgba(31, 107, 92, .16)" }),
  mystery: defineTheme({ id: "mystery", name: "Mystère", emoji: "🔍", description: "Manoir feutré et indices énigmatiques.", colors: { background: "#171814", surface: "#24251f", surfaceAlt: "#303127", text: "#f2ead4", muted: "#aaa38e", primary: "#c6a15b", secondary: "#768c6a", accent: "#ad4e3c", border: "#4b493c" }, radius: "soft", shadow: "0 20px 60px rgba(0, 0, 0, .4)" }),
  cosmic: defineTheme({ id: "cosmic", name: "Cosmique", emoji: "🪐", description: "Nébuleuses et aventure interstellaire.", colors: { background: "#080d25", surface: "#111a3e", surfaceAlt: "#192755", text: "#f3f6ff", muted: "#99a7cf", primary: "#7357ff", secondary: "#36c5f0", accent: "#ff73c3", border: "#304276" }, radius: "round", shadow: "0 22px 70px rgba(45, 68, 181, .3)" }),
  western: defineTheme({ id: "western", name: "Far West", emoji: "🤠", description: "Saloon, poussière et duels au soleil.", colors: { background: "#ead4ad", surface: "#fff1d2", surfaceAlt: "#dfbd84", text: "#3d2518", muted: "#80634f", primary: "#a4472d", secondary: "#49624a", accent: "#d89935", border: "#bd9667" }, radius: "sharp", shadow: "6px 8px 0 rgba(88, 52, 28, .18)" }),
  medieval: defineTheme({ id: "medieval", name: "Médiéval", emoji: "⚔️", description: "Blasons, parchemins et grandes quêtes.", colors: { background: "#31291f", surface: "#f0dfba", surfaceAlt: "#dbc28f", text: "#31261d", muted: "#74624f", primary: "#8b2f2f", secondary: "#315847", accent: "#c4953e", border: "#aa8958" }, radius: "soft", shadow: "0 18px 45px rgba(16, 10, 6, .36)" }),
  cyberpunk: defineTheme({ id: "cyberpunk", name: "Cyberpunk", emoji: "⚡", description: "Ville électrique et contrastes acides.", colors: { background: "#0d0715", surface: "#1b1028", surfaceAlt: "#29163a", text: "#fff8ff", muted: "#b5a0c2", primary: "#f000ff", secondary: "#00f5d4", accent: "#f8f32b", border: "#5d286d" }, radius: "sharp", shadow: "7px 7px 0 rgba(0, 245, 212, .22)" }),
  enchanted: defineTheme({ id: "enchanted", name: "Forêt enchantée", emoji: "🧚", description: "Magie douce et sous-bois lumineux.", colors: { background: "#e9f2df", surface: "#fbfff6", surfaceAlt: "#d7e8c7", text: "#24402f", muted: "#687b6a", primary: "#6c4cad", secondary: "#4c8a62", accent: "#e6a95c", border: "#b9cfab" }, radius: "round", shadow: "0 20px 50px rgba(55, 93, 60, .18)" }),
  pirate: defineTheme({ id: "pirate", name: "Pirates", emoji: "🏴‍☠️", description: "Cartes au trésor et équipage turbulent.", colors: { background: "#102f37", surface: "#f2ddb5", surfaceAlt: "#dec18b", text: "#30251b", muted: "#75634e", primary: "#a8382e", secondary: "#1e666b", accent: "#d7a928", border: "#af8f5d" }, radius: "soft", shadow: "5px 8px 0 rgba(5, 27, 31, .3)" }),
  spooky: defineTheme({ id: "spooky", name: "Frissons", emoji: "👻", description: "Halloween ludique, étrange mais chaleureux.", colors: { background: "#1d1425", surface: "#2d2037", surfaceAlt: "#3a2945", text: "#fff6e9", muted: "#bcaec2", primary: "#f47721", secondary: "#8b5cf6", accent: "#b9e55b", border: "#594364" }, radius: "round", shadow: "0 18px 60px rgba(0, 0, 0, .38)" }),
  retro: defineTheme({ id: "retro", name: "Rétro 70s", emoji: "📻", description: "Courbes vintage et palette chaleureuse.", colors: { background: "#f2d7a2", surface: "#fff2d3", surfaceAlt: "#e9bd78", text: "#43352a", muted: "#7e6958", primary: "#d85b35", secondary: "#3f8175", accent: "#e7a62f", border: "#c8945a" }, radius: "round", shadow: "8px 8px 0 rgba(95, 66, 38, .16)" }),
  disco: defineTheme({ id: "disco", name: "Disco", emoji: "🪩", description: "Paillettes, dancefloor et rythme.", colors: { background: "#190b28", surface: "#2b1442", surfaceAlt: "#3b1d57", text: "#fff7ff", muted: "#c3a5d3", primary: "#ec4cdb", secondary: "#6f7cff", accent: "#ffd447", border: "#633777" }, radius: "round", shadow: "0 20px 65px rgba(192, 54, 210, .25)" }),
  noir: defineTheme({ id: "noir", name: "Film noir", emoji: "🎩", description: "Polar graphique en noir, crème et rouge.", colors: { background: "#111111", surface: "#f1eee6", surfaceAlt: "#d7d3ca", text: "#171717", muted: "#696969", primary: "#b11f2e", secondary: "#343434", accent: "#d6b15b", border: "#aaa69e" }, radius: "sharp", shadow: "9px 9px 0 rgba(177, 31, 46, .3)" }),
  candy: defineTheme({ id: "candy", name: "Bonbons", emoji: "🍬", description: "Pastels gourmands et humeur légère.", colors: { background: "#fff0f5", surface: "#fffafd", surfaceAlt: "#ffe0ec", text: "#4e3351", muted: "#896f8b", primary: "#f05d9b", secondary: "#6bc6c3", accent: "#ffbe55", border: "#efbfd1" }, radius: "round", shadow: "0 18px 45px rgba(182, 86, 134, .17)" }),
  nature: defineTheme({ id: "nature", name: "Grande nature", emoji: "🏕️", description: "Bois, randonnée et esprit d'aventure.", colors: { background: "#e8e0c9", surface: "#f8f3e5", surfaceAlt: "#d7ccb0", text: "#26372d", muted: "#697367", primary: "#49734c", secondary: "#aa603b", accent: "#d2a33e", border: "#b8ad91" }, radius: "soft", shadow: "0 16px 45px rgba(43, 64, 48, .2)" }),
  ocean: defineTheme({ id: "ocean", name: "Grand bleu", emoji: "🌊", description: "Eau claire, récifs et exploration marine.", colors: { background: "#dff4f5", surface: "#f7ffff", surfaceAlt: "#c5e9e9", text: "#123c4a", muted: "#5e7e86", primary: "#087f9c", secondary: "#16aa98", accent: "#ff8c66", border: "#a4d4d7" }, radius: "round", shadow: "0 20px 50px rgba(22, 119, 139, .17)" }),
  laboratory: defineTheme({ id: "laboratory", name: "Labo fou", emoji: "🧪", description: "Expériences, bulles et science déjantée.", colors: { background: "#e9f7f4", surface: "#ffffff", surfaceAlt: "#d6efeb", text: "#183b40", muted: "#607c7e", primary: "#6d4ce8", secondary: "#00a88f", accent: "#f2cc3e", border: "#b7dcd7" }, radius: "round", shadow: "0 18px 50px rgba(57, 102, 107, .16)" }),
  royal: defineTheme({ id: "royal", name: "Bal royal", emoji: "👑", description: "Velours, dorures et élégance théâtrale.", colors: { background: "#25113b", surface: "#fff8e9", surfaceAlt: "#eee0c3", text: "#35253d", muted: "#796b7c", primary: "#713b96", secondary: "#9e315b", accent: "#d4aa3c", border: "#c9b88f" }, radius: "soft", shadow: "0 22px 60px rgba(35, 13, 56, .32)" }),
  cozy: defineTheme({ id: "cozy", name: "Soirée cosy", emoji: "🕯️", description: "Plaids, lumière chaude et petits groupes.", colors: { background: "#eee3d8", surface: "#fffaf5", surfaceAlt: "#e7d5c5", text: "#48372f", muted: "#806f66", primary: "#a75f46", secondary: "#667b63", accent: "#d89a48", border: "#cfbbaa" }, radius: "round", shadow: "0 18px 50px rgba(92, 61, 44, .17)" }),
  minimal: defineTheme({ id: "minimal", name: "Minimal", emoji: "◻️", description: "Neutre, lisible et adaptable à tous les sujets.", colors: { background: "#f1f1ef", surface: "#ffffff", surfaceAlt: "#e7e7e3", text: "#191919", muted: "#71716d", primary: "#315df4", secondary: "#222222", accent: "#ff6b45", border: "#d0d0cb" }, radius: "soft", shadow: "0 16px 45px rgba(20, 20, 20, .1)" }),
} as const;

export type GameThemeName = keyof typeof gameThemes;
export type GameThemeInput = GameThemeName | GameTheme;

export const gameThemeList = Object.values(gameThemes);

export function resolveGameTheme(theme: GameThemeInput = "minimal"): GameTheme {
  return typeof theme === "string" ? gameThemes[theme] : theme;
}

export type GameThemeStyle = CSSProperties & Record<`--game-${string}`, string>;

export function gameThemeStyle(themeInput: GameThemeInput = "minimal"): GameThemeStyle {
  const theme = resolveGameTheme(themeInput);
  const radius = theme.radius === "round" ? "24px" : theme.radius === "soft" ? "14px" : "4px";

  return {
    "--game-bg": theme.colors.background,
    "--game-surface": theme.colors.surface,
    "--game-surface-alt": theme.colors.surfaceAlt,
    "--game-text": theme.colors.text,
    "--game-muted": theme.colors.muted,
    "--game-primary": theme.colors.primary,
    "--game-secondary": theme.colors.secondary,
    "--game-accent": theme.colors.accent,
    "--game-border": theme.colors.border,
    "--game-radius": radius,
    "--game-radius-small": theme.radius === "sharp" ? "3px" : theme.radius === "soft" ? "9px" : "14px",
    "--game-shadow": theme.shadow,
  };
}
