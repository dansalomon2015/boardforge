import type { Metadata } from "next";
import "./globals.css";
import "../components/game-ui/game-components.css";

export const metadata: Metadata = {
  title: "BoardForge — Playable game compiler",
  description: "Compile a social game idea into a validated, playable multiplayer room.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
