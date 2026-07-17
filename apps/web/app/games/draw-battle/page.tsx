"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { gameThemeStyle, gameThemes, type GameThemeName } from "../../../components/game-ui";
import styles from "../movie-mime/page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const themeIds = [
  "arcade",
  "candy",
  "cosmic",
  "tropical",
  "cyberpunk",
  "minimal",
] as const satisfies readonly GameThemeName[];
const promptCounts = [6, 12, 18, 24, 30] as const;
const teamColors = ["#7357ff", "#ff6b4a", "#22a699", "#e2a72e"] as const;
type TeamDraft = { id: string; name: string; color: string };

export default function DrawBattleSetupPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<GameThemeName>("arcade");
  const [promptCount, setPromptCount] = useState<(typeof promptCounts)[number]>(18);
  const [preferences, setPreferences] = useState("");
  const [teams, setTeams] = useState<TeamDraft[]>([
    { id: "team-draft-1", name: "The Doodlers", color: teamColors[0] },
    { id: "team-draft-2", name: "The Scribblers", color: teamColors[1] },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTheme = gameThemes[theme];
  const previewStyle = useMemo(() => gameThemeStyle(theme) as CSSProperties, [theme]);

  function updateTeam(id: string, changes: Partial<Pick<TeamDraft, "name" | "color">>) {
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, ...changes } : team)));
  }

  function addTeam() {
    setTeams((current) =>
      current.length >= 4
        ? current
        : [
            ...current,
            {
              id: crypto.randomUUID(),
              name: `Team ${current.length + 1}`,
              color: teamColors[current.length] ?? teamColors[0],
            },
          ],
    );
  }

  function removeTeam(id: string) {
    setTeams((current) => (current.length <= 2 ? current : current.filter((team) => team.id !== id)));
  }

  async function prepareGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedNames = teams.map((team) => team.name.trim().toLowerCase());
      if (teams.some((team) => team.name.trim().length < 2)) throw new Error("Every team needs a name.");
      if (new Set(normalizedNames).size !== normalizedNames.length) throw new Error("Every team needs a unique name.");
      const blueprintResponse = await fetch(`${apiUrl}/api/draw-battle/blueprints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          themeId: theme,
          promptCount,
          teams: teams.map((team) => ({ name: team.name.trim(), color: team.color })),
          ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
        }),
      });
      if (!blueprintResponse.ok) {
        const failure = (await blueprintResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "The drawing deck could not be prepared.");
      }
      const prepared = (await blueprintResponse.json()) as {
        blueprintId: string;
        releaseStatus: "release_ready" | "needs_review";
      };
      if (prepared.releaseStatus !== "release_ready")
        throw new Error("That drawing mix needs a quick rethink. Try another theme.");
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprintId: prepared.blueprintId }),
      });
      if (!roomResponse.ok) throw new Error("The room could not be opened.");
      const room = (await roomResponse.json()) as { code: string };
      router.push(`/room/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something unexpected happened.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span>BF</span>
          <b>BoardForge</b>
        </Link>
        <Link className={styles.back} href="/">
          ← Back to the collection
        </Link>
      </nav>
      <form className={styles.layout} onSubmit={prepareGame}>
        <section className={styles.configuration}>
          <div className={styles.titleBlock}>
            <p>BoardForge Original No. 03</p>
            <h1>
              Make tonight&apos;s
              <br />
              <em>DrawBattle.</em>
            </h1>
            <span>Set the mood, name your teams, and choose what you would love — or hate — to draw.</span>
          </div>

          <fieldset className={styles.fieldset}>
            <legend>
              <b>01</b>
              <span>Choose the mood</span>
              <small>What should tonight feel like?</small>
            </legend>
            <div className={styles.themeGrid}>
              {themeIds.map((themeId) => {
                const item = gameThemes[themeId];
                return (
                  <button
                    className={theme === themeId ? styles.selectedTheme : ""}
                    key={themeId}
                    onClick={() => setTheme(themeId)}
                    style={
                      {
                        "--swatch-a": item.colors.primary,
                        "--swatch-b": item.colors.secondary,
                        "--swatch-c": item.colors.accent,
                      } as CSSProperties
                    }
                    type="button"
                  >
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                    <b>{item.emoji}</b>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              <b>02</b>
              <span>Your teams</span>
              <small>Create two to four teams</small>
            </legend>
            <div className={styles.teamEditor}>
              {teams.map((team, index) => (
                <article
                  className={styles.teamDraft}
                  style={{ "--team-color": team.color } as CSSProperties}
                  key={team.id}
                >
                  <div className={styles.teamNumber}>
                    <i />
                    Team {index + 1}
                  </div>
                  <input
                    aria-label={`Team ${index + 1} name`}
                    maxLength={24}
                    onChange={(event) => updateTeam(team.id, { name: event.target.value })}
                    value={team.name}
                  />
                  <div className={styles.teamPalette} role="group" aria-label={`${team.name} color`}>
                    {teamColors.map((color) => (
                      <button
                        aria-label={`Choose ${color}`}
                        className={team.color === color ? styles.selectedColor : ""}
                        key={color}
                        onClick={() => updateTeam(team.id, { color })}
                        style={{ background: color }}
                        type="button"
                      />
                    ))}
                  </div>
                  {teams.length > 2 ? (
                    <button className={styles.removeTeam} onClick={() => removeTeam(team.id)} type="button">
                      Remove
                    </button>
                  ) : null}
                </article>
              ))}
              {teams.length < 4 ? (
                <button className={styles.addTeam} onClick={addTeam} type="button">
                  <b>＋</b>
                  <span>Add a team</span>
                  <small>Up to four teams</small>
                </button>
              ) : null}
            </div>
            <p className={styles.captainNote}>
              <span>★</span> Players choose teams in the room. The host appoints one captain per team.
            </p>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              <b>03</b>
              <span>How long are we playing?</span>
              <small>Pick the pace for tonight</small>
            </legend>
            <div className={styles.countGrid}>
              {promptCounts.map((count) => (
                <button
                  className={promptCount === count ? styles.selectedCount : ""}
                  key={count}
                  onClick={() => setPromptCount(count)}
                  type="button"
                >
                  <strong>{count}</strong>
                  <span>drawings</span>
                  <small>~{Math.ceil(count * 1.35)} min</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              <b>04</b>
              <span>Make the ideas yours</span>
              <small>Optional · leave it blank for a great surprise</small>
            </legend>
            <textarea
              maxLength={240}
              onChange={(event) => setPreferences(event.target.value)}
              placeholder="e.g. Easy animals and fantasy for a family game night…"
              rows={4}
              value={preferences}
            />
            <div className={styles.suggestions}>
              {["Easy animals", "Fantasy worlds", "Everyday chaos", "Hard mode"].map((suggestion) => (
                <button key={suggestion} onClick={() => setPreferences(suggestion)} type="button">
                  {suggestion}
                </button>
              ))}
              <span>{preferences.length}/240</span>
            </div>
          </fieldset>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <button className={styles.submit} disabled={busy} type="submit">
            <span>{busy ? "Hanging the first canvas…" : "Open the DrawBattle room"}</span>
            <b>{busy ? "•••" : "↗"}</b>
          </button>
          <p className={styles.submitNote}>
            {preferences.trim()
              ? "Your brief will shape tonight’s drawing mix."
              : "No brief needed — the surprise is part of the fun."}
          </p>
        </section>

        <aside className={styles.previewColumn}>
          <div className={styles.sticky}>
            <p className={styles.previewLabel}>Tonight&apos;s edition</p>
            <div className={styles.gamePreview} style={previewStyle}>
              <div className={styles.previewGlow} />
              <div className={styles.previewTop}>
                <span>BoardForge Original</span>
                <strong>✎</strong>
              </div>
              <div className={styles.previewCenter}>
                <small>Live drawing showdown</small>
                <h2>
                  Draw
                  <br />
                  Battle
                </h2>
                <p>{preferences.trim() || "Secret prompts, fearless lines, and a room racing to name the picture."}</p>
              </div>
              <div className={styles.previewStats}>
                <span>
                  <b>{promptCount}</b> prompts
                </span>
                <span>
                  <b>{teams.length}</b> teams
                </span>
                <span>
                  <b>75</b> sec.
                </span>
              </div>
            </div>
            <div className={styles.previewDetails}>
              <div>
                <span>Tonight&apos;s mood</span>
                <b>{activeTheme.name}</b>
              </div>
              <div>
                <span>Drawing mix</span>
                <b>{preferences.trim() ? "Made for your group" : "Surprise me"}</b>
              </div>
              <div>
                <span>Best with</span>
                <b>Fearless artists</b>
              </div>
            </div>
          </div>
        </aside>
      </form>
      {busy ? (
        <div className={styles.loading} aria-live="polite">
          <div className={styles.loadingMark}>
            <span>BF</span>
            <i />
          </div>
          <p>{preferences.trim() ? "Tonight’s gallery is taking shape…" : "The sketchbook is opening…"}</p>
          <small>Picking the ideas · setting the mood · opening the room</small>
        </div>
      ) : null}
    </main>
  );
}
