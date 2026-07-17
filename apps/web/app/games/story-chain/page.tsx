"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { gameThemeStyle, gameThemes, type GameThemeName } from "../../../components/game-ui";
import baseStyles from "../movie-mime/page.module.css";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const themeIds = ["cozy", "mystery", "enchanted", "spooky", "royal", "minimal"] as const satisfies readonly GameThemeName[];
const moods = [
  { id: "chaotic", emoji: "✦", name: "Chaotic", line: "Anything can happen" },
  { id: "mystery", emoji: "⌕", name: "Mystery", line: "Clues, secrets, suspicion" },
  { id: "fantasy", emoji: "♜", name: "Fantasy", line: "Magic beyond the map" },
  { id: "spooky", emoji: "◐", name: "Spooky", line: "Deliciously unsettling" },
  { id: "romantic", emoji: "♡", name: "Romantic", line: "Chemistry and near misses" },
  { id: "family", emoji: "☀", name: "Family", line: "Warm, playful adventure" },
] as const;
const lengths = [
  { id: "quick", name: "Quick Tale", chapters: 8, time: "12–18 min" },
  { id: "full", name: "Full Story", chapters: 12, time: "20–30 min" },
  { id: "epic", name: "Epic", chapters: 16, time: "30–45 min" },
] as const;

export default function StoryChainSetupPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<GameThemeName>("cozy");
  const [mood, setMood] = useState<(typeof moods)[number]["id"]>("chaotic");
  const [length, setLength] = useState<(typeof lengths)[number]["id"]>("full");
  const [preferences, setPreferences] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTheme = gameThemes[theme];
  const activeMood = moods.find((item) => item.id === mood)!;
  const activeLength = lengths.find((item) => item.id === length)!;
  const previewStyle = useMemo(() => gameThemeStyle(theme) as CSSProperties, [theme]);

  async function prepareGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/story-chain/blueprints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ themeId: theme, mood, length, ...(preferences.trim() ? { preferences: preferences.trim() } : {}) }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? "Tonight's story could not be prepared.");
      }
      const prepared = await response.json() as { blueprintId: string; releaseStatus: "release_ready" | "needs_review" };
      if (prepared.releaseStatus !== "release_ready") throw new Error("That story needs another draft. Try again for a fresh opening.");
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blueprintId: prepared.blueprintId }) });
      if (!roomResponse.ok) throw new Error("The room could not be opened.");
      const room = await roomResponse.json() as { code: string };
      router.push(`/room/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something unexpected happened.");
      setBusy(false);
    }
  }

  return (
    <main className={`${baseStyles.page} ${styles.page}`}>
      <nav className={baseStyles.nav}><Link className={baseStyles.brand} href="/"><span>BF</span><b>BoardForge</b></Link><Link className={baseStyles.back} href="/">← Back to the collection</Link></nav>
      <form className={baseStyles.layout} onSubmit={prepareGame}>
        <section className={baseStyles.configuration}>
          <div className={baseStyles.titleBlock}><p>BoardForge Original No. 05</p><h1>Write a story<br /><em>no one expects.</em></h1><span>Set the atmosphere. We will create the opening and secret twists. Your group writes everything that happens next.</span></div>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>01</b><span>Choose the story mood</span><small>What kind of tale are we telling?</small></legend>
            <div className={styles.moodGrid}>{moods.map((item) => <button className={mood === item.id ? styles.selected : ""} key={item.id} onClick={() => setMood(item.id)} type="button"><b>{item.emoji}</b><span>{item.name}</span><small>{item.line}</small></button>)}</div>
          </fieldset>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>02</b><span>Choose the edition</span><small>The room adapts to whoever joins</small></legend>
            <div className={styles.lengthGrid}>{lengths.map((item) => <button className={length === item.id ? styles.selected : ""} key={item.id} onClick={() => setLength(item.id)} type="button"><span>{item.name}</span><strong>{item.chapters}</strong><small>chapters · {item.time}</small></button>)}</div>
          </fieldset>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>03</b><span>Choose the visual world</span><small>Your story, beautifully bound</small></legend>
            <div className={baseStyles.themeGrid}>{themeIds.map((themeId) => {
              const item = gameThemes[themeId];
              return <button className={theme === themeId ? baseStyles.selectedTheme : ""} key={themeId} onClick={() => setTheme(themeId)} style={{ "--swatch-a": item.colors.primary, "--swatch-b": item.colors.secondary, "--swatch-c": item.colors.accent } as CSSProperties} type="button"><span><i /><i /><i /></span><b>{item.emoji}</b><strong>{item.name}</strong><small>{item.description}</small></button>;
            })}</div>
          </fieldset>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>04</b><span>Give us a spark</span><small>Optional · a sentence is plenty</small></legend>
            <textarea maxLength={240} onChange={(event) => setPreferences(event.target.value)} placeholder="e.g. A wedding on a train where every guest is hiding something…" rows={4} value={preferences} />
            <div className={baseStyles.suggestions}>{["A hotel after midnight", "A magical family reunion", "Friends lost in time", "Surprise me"].map((suggestion) => <button key={suggestion} onClick={() => setPreferences(suggestion === "Surprise me" ? "" : suggestion)} type="button">{suggestion}</button>)}<span>{preferences.length}/240</span></div>
          </fieldset>

          {error ? <p className={baseStyles.error} role="alert">{error}</p> : null}
          <button className={baseStyles.submit} disabled={busy} type="submit"><span>{busy ? "Writing the first page…" : "Open the StoryChain room"}</span><b>{busy ? "•••" : "↗"}</b></button>
          <p className={baseStyles.submitNote}>No teams. No score. Just one story your group could never write twice.</p>
        </section>

        <aside className={baseStyles.previewColumn}><div className={baseStyles.sticky}>
          <p className={baseStyles.previewLabel}>Tonight&apos;s edition</p>
          <div className={styles.book} style={previewStyle}><div className={styles.bookSpine} /><div className={styles.bookTop}><span>BoardForge Original</span><b>No. 05</b></div><div className={styles.bookTitle}><small>{activeMood.name} collaborative fiction</small><h2>Story<br /><em>Chain</em></h2><p>{preferences.trim() || "One opening. A secret twist for every writer. An ending nobody sees coming."}</p></div><div className={styles.bookFooter}><span>{activeLength.chapters} chapters</span><span>{activeTheme.name}</span><span>2–12 players</span></div></div>
          <div className={baseStyles.previewDetails}><div><span>Story mood</span><b>{activeMood.name}</b></div><div><span>Edition</span><b>{activeLength.name}</b></div><div><span>Written by</span><b>Everyone in the room</b></div></div>
        </div></aside>
      </form>
      {busy ? <div className={`${baseStyles.loading} ${styles.loading}`} aria-live="polite"><div className={styles.quill}>✦<i /></div><p>Your opening is taking shape…</p><small>Setting the scene · hiding the twists · testing every chapter</small></div> : null}
    </main>
  );
}
