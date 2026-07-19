"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import type { JoinGameNightResult } from "@boardforge/shared";
import { validateGameNightDraft, type GameNightTeamDraft } from "../../../lib/game-night-draft";
import { saveGameNightSession } from "../../../lib/game-night-session";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const palette = ["#ff6846", "#7658ff", "#23aa89", "#e8b633", "#e64f82", "#1f9ed1", "#83ad35", "#d56ce6"];
const starterTeams: GameNightTeamDraft[] = [
  { id: "team-draft-1", name: "Moon Club", color: palette[0]! },
  { id: "team-draft-2", name: "Wild Cards", color: palette[1]! },
];

export default function NewGameNightPage() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [teams, setTeams] = useState<GameNightTeamDraft[]>(starterTeams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateTeam(id: string, changes: Partial<Pick<GameNightTeamDraft, "name" | "color">>) {
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, ...changes } : team)));
  }

  function addTeam() {
    setTeams((current) => {
      if (current.length >= 4) return current;
      const color = palette.find((candidate) => !current.some((team) => team.color === candidate)) ?? palette[0]!;
      return [...current, { id: crypto.randomUUID(), name: `Team ${current.length + 1}`, color }];
    });
  }

  function removeTeam(id: string) {
    setTeams((current) => (current.length > 2 ? current.filter((team) => team.id !== id) : current));
  }

  async function createGameNight(event: FormEvent) {
    event.preventDefault();
    const validationError = validateGameNightDraft(hostName, teams);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/api/game-nights`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostName: hostName.trim(),
          teams: teams.map((team) => ({ name: team.name.trim(), color: team.color })),
        }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "Your Game Night could not be opened.");
      }
      const result = (await response.json()) as JoinGameNightResult;
      saveGameNightSession(result.view.id, {
        playerId: result.playerId,
        reconnectToken: result.reconnectToken,
        name: hostName.trim(),
      });
      router.push(`/game-night/${result.view.code}`);
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
          ← Back home
        </Link>
      </nav>

      <form className={styles.layout} onSubmit={createGameNight}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>A whole evening, one shared table</p>
          <h1>
            Build your
            <br />
            <em>dream teams.</em>
          </h1>
          <p className={styles.lead}>
            Start with the people, not the game. Your teams stay together as you move from one BoardForge original to
            the next—and every win shapes the night.
          </p>

          <div className={styles.nightPreview} aria-label="Game Night team preview" role="img">
            <div className={styles.previewTopline}>
              <span>Tonight&apos;s table</span>
              <b>{teams.length.toString().padStart(2, "0")} teams</b>
            </div>
            <div className={styles.previewTeams}>
              {teams.map((team, index) => (
                <div
                  className={styles.previewTeam}
                  key={team.id}
                  style={{ "--team-color": team.color } as CSSProperties}
                >
                  <i>{index + 1}</i>
                  <span>
                    <small>Team</small>
                    <strong>{team.name.trim() || "Name your team"}</strong>
                  </span>
                  <b>0</b>
                </div>
              ))}
            </div>
            <div className={styles.previewFooter}>
              <span>One invite code</span>
              <span>Scores all night</span>
              <span>Games chosen later</span>
            </div>
          </div>
        </section>

        <section className={styles.setupCard}>
          <div className={styles.cardHeading}>
            <span>Game Night setup</span>
            <b>About one minute</b>
            <h2>Who&apos;s bringing everyone together?</h2>
            <p>You will host the lobby and choose each game when the room is ready.</p>
          </div>

          <label className={styles.hostField}>
            <span>Your name</span>
            <input
              autoComplete="name"
              maxLength={24}
              onChange={(event) => setHostName(event.target.value)}
              placeholder="What should everyone call you?"
              value={hostName}
            />
          </label>

          <fieldset className={styles.teamsFieldset}>
            <legend>
              <span>Create the teams</span>
              <small>Two to four. Players will pick their own team after joining.</small>
            </legend>
            <div className={styles.teamList}>
              {teams.map((team, index) => (
                <div
                  className={styles.teamEditor}
                  key={team.id}
                  style={{ "--team-color": team.color } as CSSProperties}
                >
                  <div className={styles.teamEditorTop}>
                    <span>
                      <i /> Team {index + 1}
                    </span>
                    {teams.length > 2 ? (
                      <button aria-label={`Remove ${team.name}`} onClick={() => removeTeam(team.id)} type="button">
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <input
                    aria-label={`Team ${index + 1} name`}
                    maxLength={24}
                    onChange={(event) => updateTeam(team.id, { name: event.target.value })}
                    value={team.name}
                  />
                  <div className={styles.palette} aria-label={`Choose a color for ${team.name}`} role="group">
                    {palette.map((color) => {
                      const usedElsewhere = teams.some(
                        (candidate) => candidate.id !== team.id && candidate.color === color,
                      );
                      return (
                        <button
                          aria-label={`Use color ${color}`}
                          aria-pressed={team.color === color}
                          disabled={usedElsewhere}
                          key={color}
                          onClick={() => updateTeam(team.id, { color })}
                          style={{ backgroundColor: color }}
                          type="button"
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {teams.length < 4 ? (
              <button className={styles.addTeam} onClick={addTeam} type="button">
                <span>＋</span> Add another team
              </button>
            ) : null}
          </fieldset>

          <div className={styles.promise}>
            <i>✓</i>
            <span>
              <strong>No game choice yet.</strong>
              First everyone joins and picks a team. Then you choose what to play together.
            </span>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.submit} disabled={busy} type="submit">
            <span>
              <small>{busy ? "Opening your table" : "Everything looks good"}</small>
              <strong>{busy ? "Creating Game Night…" : "Create Game Night"}</strong>
            </span>
            <b>{busy ? "•••" : "→"}</b>
          </button>
        </section>
      </form>
    </main>
  );
}
