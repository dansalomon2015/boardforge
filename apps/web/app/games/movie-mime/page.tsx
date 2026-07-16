"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  gameThemeStyle,
  gameThemes,
  type GameThemeName,
} from "../../../components/game-ui";
import styles from "./page.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const themeIds = ["noir", "disco", "cosmic", "retro", "spooky", "cozy"] as const satisfies readonly GameThemeName[];
const filmCounts = [10, 20, 30, 40] as const;
const teamColors = ["#6c42f5", "#ff6b4a", "#22a699", "#e2a72e"] as const;

type TeamDraft = { id: string; name: string; color: string };

type PreparedGame = {
  blueprintId: string;
  releaseStatus: "release_ready" | "needs_review";
  source: "random" | "ai";
  filmCount: number;
};

export default function MovieMimeSetupPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<GameThemeName>("noir");
  const [filmCount, setFilmCount] = useState<(typeof filmCounts)[number]>(20);
  const [teams, setTeams] = useState<TeamDraft[]>([
    { id: "team-draft-1", name: "Les Projecteurs", color: teamColors[0] },
    { id: "team-draft-2", name: "Les Clapboards", color: teamColors[1] },
  ]);
  const [preferences, setPreferences] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTheme = gameThemes[theme];
  const previewStyle = useMemo(() => gameThemeStyle(theme) as CSSProperties, [theme]);

  function updateTeam(id: string, changes: Partial<Pick<TeamDraft, "name" | "color">>) {
    setTeams((current) => current.map((team) => team.id === id ? { ...team, ...changes } : team));
  }

  function addTeam() {
    setTeams((current) => current.length >= 4
      ? current
      : [...current, {
          id: crypto.randomUUID(),
          name: `Équipe ${current.length + 1}`,
          color: teamColors[current.length] ?? teamColors[0],
        }]);
  }

  function removeTeam(id: string) {
    setTeams((current) => current.length <= 2 ? current : current.filter((team) => team.id !== id));
  }

  async function prepareGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedNames = teams.map((team) => team.name.trim().toLocaleLowerCase("fr"));
      if (teams.some((team) => team.name.trim().length < 2)) throw new Error("Chaque équipe doit avoir un nom.");
      if (new Set(normalizedNames).size !== normalizedNames.length) throw new Error("Donnez un nom différent à chaque équipe.");
      const blueprintResponse = await fetch(`${apiUrl}/api/movie-mime/blueprints`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          themeId: theme,
          filmCount,
          teams: teams.map((team) => ({ name: team.name.trim(), color: team.color })),
          ...(preferences.trim() ? { preferences: preferences.trim() } : {}),
        }),
      });
      if (!blueprintResponse.ok) {
        const failure = (await blueprintResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "La sélection de films n’a pas pu être préparée.");
      }
      const prepared = await blueprintResponse.json() as PreparedGame;
      if (prepared.releaseStatus !== "release_ready") {
        throw new Error("Cette sélection n’a pas passé les vérifications de jouabilité.");
      }
      const roomResponse = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprintId: prepared.blueprintId }),
      });
      if (!roomResponse.ok) {
        const failure = (await roomResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "La room n’a pas pu être ouverte.");
      }
      const room = await roomResponse.json() as { code: string };
      router.push(`/room/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur inattendue est survenue.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/"><span>BF</span><b>BoardForge</b></Link>
        <Link className={styles.back} href="/">← Retour à la collection</Link>
      </nav>

      <form className={styles.layout} onSubmit={prepareGame}>
        <section className={styles.configuration}>
          <div className={styles.titleBlock}>
            <p>BoardForge Original Nº 01</p>
            <h1>Créez votre<br /><em>CinéMimes.</em></h1>
            <span>Les règles sont déjà parfaitement réglées. Vous ne choisissez que l’ambiance et la programmation.</span>
          </div>

          <fieldset className={styles.fieldset}>
            <legend><b>01</b><span>Direction artistique</span><small>Choisissez l’atmosphère de votre table</small></legend>
            <div className={styles.themeGrid}>
              {themeIds.map((themeId) => {
                const item = gameThemes[themeId];
                return (
                  <button
                    className={theme === themeId ? styles.selectedTheme : ""}
                    key={themeId}
                    onClick={() => setTheme(themeId)}
                    style={{ "--swatch-a": item.colors.primary, "--swatch-b": item.colors.secondary, "--swatch-c": item.colors.accent } as CSSProperties}
                    type="button"
                  >
                    <span><i /><i /><i /></span>
                    <b>{item.emoji}</b>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend><b>02</b><span>Vos équipes</span><small>De 2 à 4 équipes, nommées par vous</small></legend>
            <div className={styles.teamEditor}>
              {teams.map((team, index) => (
                <article className={styles.teamDraft} style={{ "--team-color": team.color } as CSSProperties} key={team.id}>
                  <div className={styles.teamNumber}><i />Équipe {index + 1}</div>
                  <input
                    aria-label={`Nom de l’équipe ${index + 1}`}
                    maxLength={24}
                    onChange={(event) => updateTeam(team.id, { name: event.target.value })}
                    value={team.name}
                  />
                  <div className={styles.teamPalette} aria-label={`Couleur de ${team.name}`}>
                    {teamColors.map((color) => (
                      <button
                        aria-label={`Choisir la couleur ${color}`}
                        className={team.color === color ? styles.selectedColor : ""}
                        key={color}
                        onClick={() => updateTeam(team.id, { color })}
                        style={{ background: color }}
                        type="button"
                      />
                    ))}
                  </div>
                  {teams.length > 2 ? <button className={styles.removeTeam} onClick={() => removeTeam(team.id)} type="button">Retirer</button> : null}
                </article>
              ))}
              {teams.length < 4 ? <button className={styles.addTeam} onClick={addTeam} type="button"><b>＋</b><span>Ajouter une équipe</span><small>Jusqu’à quatre équipes</small></button> : null}
            </div>
            <p className={styles.captainNote}><span>★</span> Les joueurs rejoindront leur équipe dans la room. L’hôte choisira ensuite un chef par équipe.</p>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend><b>03</b><span>Durée de la séance</span><small>Un film correspond à environ une minute</small></legend>
            <div className={styles.countGrid}>
              {filmCounts.map((count) => (
                <button className={filmCount === count ? styles.selectedCount : ""} key={count} onClick={() => setFilmCount(count)} type="button">
                  <strong>{count}</strong><span>films</span><small>~{Math.ceil(count * 1.2)} min</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend><b>04</b><span>Votre programmation</span><small>Facultatif · BoardForge choisit sinon au hasard</small></legend>
            <textarea
              maxLength={240}
              onChange={(event) => setPreferences(event.target.value)}
              placeholder="Ex. Comédies familiales des années 90, très connues et faciles à mimer…"
              rows={4}
              value={preferences}
            />
            <div className={styles.suggestions}>
              {["Films cultes", "Soirée famille", "Science-fiction", "Comédies françaises"].map((suggestion) => (
                <button key={suggestion} onClick={() => setPreferences(suggestion)} type="button">{suggestion}</button>
              ))}
              <span>{preferences.length}/240</span>
            </div>
          </fieldset>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.submit} disabled={busy} type="submit">
            <span>{busy ? "Préparation de votre séance…" : "Ouvrir la salle de projection"}</span><b>{busy ? "•••" : "↗"}</b>
          </button>
          <p className={styles.submitNote}>
            {preferences.trim() ? "GPT-5.6 sélectionnera uniquement des films du catalogue BoardForge." : "Sélection aléatoire instantanée, sans appel IA."}
          </p>
        </section>

        <aside className={styles.previewColumn}>
          <div className={styles.sticky}>
            <p className={styles.previewLabel}>Aperçu de votre édition</p>
            <div className={styles.gamePreview} style={previewStyle}>
              <div className={styles.previewGlow} />
              <div className={styles.previewTop}>
                <span>BoardForge Original</span><strong>{activeTheme.emoji}</strong>
              </div>
              <div className={styles.previewCenter}>
                <small>Jeu de mime cinéma</small>
                <h2>Ciné<br />Mimes</h2>
                <p>{preferences.trim() || "Une sélection surprise de films connus, variés et mémorables."}</p>
              </div>
              <div className={styles.previewStats}>
                <span><b>{filmCount}</b> films</span>
                <span><b>{teams.length}</b> équipes</span>
                <span><b>60</b> sec.</span>
              </div>
            </div>
            <div className={styles.previewDetails}>
              <div><span>Ambiance</span><b>{activeTheme.name}</b></div>
              <div><span>Sélection</span><b>{preferences.trim() ? "Personnalisée par IA" : "Surprise aléatoire"}</b></div>
              <div><span>Jouabilité</span><b>24 simulations validées</b></div>
            </div>
          </div>
        </aside>
      </form>

      {busy ? (
        <div className={styles.loading} aria-live="polite">
          <div className={styles.loadingMark}><span>BF</span><i /></div>
          <p>{preferences.trim() ? "Le programmateur compose votre sélection…" : "Les bobines sont en cours de préparation…"}</p>
          <small>Validation du paquet · préparation du moteur · ouverture de la room</small>
        </div>
      ) : null}
    </main>
  );
}
