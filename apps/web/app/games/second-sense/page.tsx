"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { gameThemeStyle, gameThemes, type GameThemeName } from "../../../components/game-ui";
import baseStyles from "../movie-mime/page.module.css";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const themeIds = ["cyberpunk", "minimal", "cosmic", "laboratory", "arcade", "noir"] as const satisfies readonly GameThemeName[];
const tempos = [
  { id: "quickfire", name: "Quickfire", range: "0.80–3.00", note: "Short, sharp, instinctive" },
  { id: "classic", name: "Classic Pulse", range: "1.20–6.00", note: "The perfect mind game" },
  { id: "mindbreaker", name: "Mindbreaker", range: "2.00–9.00", note: "Long enough to doubt everything" },
] as const;

export default function SecondSenseSetupPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<GameThemeName>("cyberpunk");
  const [tempo, setTempo] = useState<(typeof tempos)[number]["id"]>("classic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTheme = gameThemes[theme];
  const activeTempo = tempos.find((item) => item.id === tempo)!;
  const previewStyle = useMemo(() => gameThemeStyle(theme) as CSSProperties, [theme]);

  async function prepareGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const blueprintResponse = await fetch(`${apiUrl}/api/second-sense/blueprints`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ themeId: theme, tempo }) });
      if (!blueprintResponse.ok) throw new Error("Tonight's timing arena could not be prepared.");
      const prepared = await blueprintResponse.json() as { blueprintId: string; releaseStatus: "release_ready" | "needs_review" };
      if (prepared.releaseStatus !== "release_ready") throw new Error("This arena needs another rules check. Try again.");
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blueprintId: prepared.blueprintId }) });
      if (!roomResponse.ok) throw new Error("The timing room could not be opened.");
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
          <div className={`${baseStyles.titleBlock} ${styles.titleBlock}`}><p>BoardForge Original No. 07</p><h1>Stop time.<br /><em>Trust yourself.</em></h1><span>See the target. Touch once to begin, once to stop. The clock disappears — and the closest players survive.</span></div>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>01</b><span>Choose the tempo</span><small>Targets change every elimination round</small></legend>
            <div className={styles.tempoGrid}>{tempos.map((item) => <button className={tempo === item.id ? styles.selected : ""} key={item.id} onClick={() => setTempo(item.id)} type="button"><span>{item.name}</span><strong>{item.range}</strong><small>{item.note}</small></button>)}</div>
          </fieldset>

          <fieldset className={baseStyles.fieldset}>
            <legend><b>02</b><span>Choose the atmosphere</span><small>Every pulse takes on your colors</small></legend>
            <div className={baseStyles.themeGrid}>{themeIds.map((themeId) => {
              const item = gameThemes[themeId];
              return <button className={theme === themeId ? baseStyles.selectedTheme : ""} key={themeId} onClick={() => setTheme(themeId)} style={{ "--swatch-a": item.colors.primary, "--swatch-b": item.colors.secondary, "--swatch-c": item.colors.accent } as CSSProperties} type="button"><span><i /><i /><i /></span><b>{item.emoji}</b><strong>{item.name}</strong><small>{item.description}</small></button>;
            })}</div>
          </fieldset>

          <section className={styles.rules}><p>One rule. Pure instinct.</p><div><span>01</span><strong>Memorize the target</strong><small>The number disappears the moment you begin.</small></div><div><span>02</span><strong>Stop when it feels right</strong><small>No clock, progress ring, or repeating visual cue.</small></div><div><span>03</span><strong>Survive the cut</strong><small>The closest half advances until one player remains.</small></div></section>
          {error ? <p className={baseStyles.error} role="alert">{error}</p> : null}
          <button className={`${baseStyles.submit} ${styles.submit}`} disabled={busy} type="submit"><span>{busy ? "Calibrating the pulse…" : "Open the Second Sense room"}</span><b>{busy ? "•••" : "↗"}</b></button>
          <p className={baseStyles.submitNote}>Bring 2–12 players. No teams, no player-count setup, no visible countdown.</p>
        </section>

        <aside className={baseStyles.previewColumn}><div className={baseStyles.sticky}>
          <p className={baseStyles.previewLabel}>Tonight&apos;s pulse</p>
          <div className={styles.preview} style={previewStyle}>
            <div className={styles.previewTop}><span>BoardForge Original</span><b>No. 07</b></div>
            <div className={styles.orbit}><i /><i /><i /><div><small>Your target</small><strong>02.00</strong><span>seconds</span></div></div>
            <div className={styles.previewCopy}><small>Internal clock elimination</small><h2>Second<br /><em>Sense</em></h2></div>
            <div className={styles.previewCut}><span>8 players</span><i /><span>4 survive</span><i /><span>2 finalists</span></div>
            <div className={styles.previewFooter}><span><b>{activeTempo.range}</b> target range</span><span><b>2–12</b> players</span><span><b>1</b> survivor</span></div>
          </div>
          <div className={baseStyles.previewDetails}><div><span>Tempo</span><b>{activeTempo.name}</b></div><div><span>Atmosphere</span><b>{activeTheme.name}</b></div><div><span>Skill</span><b>Pure instinct</b></div></div>
        </div></aside>
      </form>
      {busy ? <div className={`${baseStyles.loading} ${styles.loading}`} aria-live="polite"><div className={styles.loadingPulse}><i /><i /><strong>02.00</strong></div><p>Calibrating your internal clock…</p><small>Drawing fresh targets · testing the cut · opening the room</small></div> : null}
    </main>
  );
}
