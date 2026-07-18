import type { Metadata } from "next";
import "./globals.css";
import "../components/game-ui/game-components.css";

export const metadata: Metadata = {
  title: "BoardForge — Make game night yours",
  description: "Beautiful social games, personalized for your people and ready to play together.",
  manifest: "/manifest.webmanifest",
  applicationName: "BoardForge",
  appleWebApp: { capable: true, title: "BoardForge", statusBarStyle: "black-translucent" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
