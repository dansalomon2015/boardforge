"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GameSummary } from "@boardforge/shared";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type DemoGame = GameSummary & { id: string };

type ComposedPreview = {
  kind: "composed";
  theme: string | { id: "custom"; name: string };
  phases: Array<{ id: string; title: string }>;
  components: string[];
  actions: Array<{ id: string; label: string; kind: string }>;
};

type PlaytestReport = {
  status: "passed" | "failed";
  simulations: number;
  completedSimulations: number;
  completionRate: number;
  averageActions: number;
  testedPlayerCounts: number[];
  testedTeamSizes: number[][];
  failures: Array<{ code: string; evidence: string }>;
};

type CompiledGame = {
  blueprintId: string;
  releaseStatus: "release_ready" | "needs_review";
  game: GameSummary;
  provider: string;
  preview: ComposedPreview;
  playtest: PlaytestReport;
  critique: { summary: string; issues: Array<{ code: string; severity: string; evidence: string }> };
};

const promptIdeas = [
  { label: "Mime en équipes", prompt: "Deux équipes miment des films cultes dans une ambiance disco" },
  { label: "Devine l’animal", prompt: "Un jeu familial où l'on fait deviner des animaux sans prononcer leur nom" },
  { label: "Défi coopératif", prompt: "Un défi coopératif de questions rapides dans une station spatiale" },
];

const componentLabels: Record<string, string> = {
  header: "En-tête", prompt: "Consigne", deck: "Pioche", choices: "Choix", text_input: "Réponse libre",
  drawing: "Dessin", timer: "Chronomètre", turn: "Tours", round: "Manches", teams: "Équipes",
  players: "Joueurs", scores: "Scores", clues: "Indices", challenge: "Défis", reveal: "Révélations",
  outcome: "Résultat", board: "Plateau", card_zone: "Main de cartes", resources: "Ressources",
  randomizer: "Hasard", buzzer: "Buzzer", ordering: "Classement", matching: "Associations", media: "Média",
};

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(promptIdeas[0]!.prompt);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Prêt à compiler");
  const [error, setError] = useState("");
  const [compiled, setCompiled] = useState<CompiledGame | null>(null);
  const [provider, setProvider] = useState("connexion");
  const [demo, setDemo] = useState<DemoGame | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/games`)
      .then((response) => response.json())
      .then((data: { games: DemoGame[]; provider: string }) => {
        setDemo(data.games[0] ?? null);
        setProvider(data.provider);
      })
      .catch(() => setError("Le serveur local n’est pas encore accessible."));
  }, []);

  async function compileGame(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim().length < 8) return;
    setBusy(true);
    setError("");
    setCompiled(null);
    setStage("L’IA assemble la GameSpec");
    try {
      const response = await fetch(`${apiUrl}/api/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "Le jeu n’a pas pu être compilé.");
      }
      const result = (await response.json()) as CompiledGame;
      setProvider(result.provider);
      setCompiled(result);
      setStage(result.releaseStatus === "release_ready" ? "Jeu validé pour la release" : "Révision nécessaire");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
      setStage("Prêt à compiler");
    } finally {
      setBusy(false);
    }
  }

  async function openRoom(blueprintId: string) {
    setBusy(true);
    setError("");
    setStage("Ouverture de la room");
    try {
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blueprintId }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "La room n’a pas pu être créée.");
      }
      const room = (await response.json()) as { code: string };
      router.push(`/room/${room.code}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
      setBusy(false);
    }
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length === 6) router.push(`/room/${code}`);
  }

  const themeName = compiled
    ? typeof compiled.preview.theme === "string" ? compiled.preview.theme : compiled.preview.theme.name
    : "";

  return (
    <main className="shell landing-shell clean-landing">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Accueil BoardForge"><span className="brand-mark">BF</span><span>BoardForge</span></a>
        <div className="topbar-actions">
          <a className="clean-nav-link" href="#join">Rejoindre</a>
          <span className={`status-chip ${provider.startsWith("openai:") ? "ai-configured" : ""}`}>
            <i /> {provider.startsWith("openai:") ? `GPT configuré · ${provider.slice(7)}` : "Mode local"}
          </span>
        </div>
      </nav>

      <section className="hero clean-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Playable game compiler</p>
          <h1>Une idée.<br /><span>Un jeu jouable.</span></h1>
          <p className="hero-lead">Décrivez l’expérience que vous imaginez. BoardForge assemble les mécaniques, vérifie les règles et fait tester le jeu par des agents virtuels avant de l’ouvrir à vos proches.</p>
          <div className="clean-proof-row">
            <span><b>01</b> GameSpec stricte</span>
            <span><b>02</b> Agents virtuels</span>
            <span><b>03</b> Room multijoueur</span>
          </div>
        </div>

        <form className="forge-card clean-forge-card" onSubmit={compileGame}>
          <div className="card-heading">
            <div><span className="step-index">✦</span><h2>Quel jeu voulez-vous créer ?</h2></div>
          </div>
          <label className="field-label" htmlFor="game-brief">Votre idée, avec vos propres mots</label>
          <textarea id="game-brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={500} rows={6} placeholder="Ex. Un jeu drôle où deux équipes doivent faire deviner des films…" />
          <div className="prompt-ideas" aria-label="Exemples de prompts">
            {promptIdeas.map((idea) => <button type="button" onClick={() => setPrompt(idea.prompt)} key={idea.label}>{idea.label}</button>)}
          </div>
          <button className="primary-button clean-compile-button" disabled={busy || prompt.trim().length < 8}>
            <span>{busy ? stage : "Compiler et tester le jeu"}</span><b>↗</b>
          </button>
          <p className="provider-note">Génération structurée · validation stricte · 24 simulations</p>
        </form>
      </section>

      {error ? <div className="error-banner clean-error" role="alert">{error}</div> : null}

      {compiled ? (
        <section className={`compiled-section clean-compiled ${compiled.releaseStatus === "release_ready" ? "is-ready" : "needs-review"}`} aria-live="polite">
          <div className="compiled-heading">
            <div>
              <p className="eyebrow">GameSpec v2 · ambiance {themeName}</p>
              <h2>{compiled.game.title}</h2>
              <p>{compiled.game.description}</p>
            </div>
            <div className="release-badge">
              <strong>{compiled.releaseStatus === "release_ready" ? "✓" : "!"}</strong>
              <span>{compiled.releaseStatus === "release_ready" ? "Release ready" : "À réviser"}</span>
            </div>
          </div>

          <div className="compiled-meta clean-meta">
            <span>{compiled.game.minPlayers}–{compiled.game.maxPlayers} joueurs</span>
            <span>~{compiled.game.durationMinutes} min</span>
            <span>{compiled.preview.phases.length} phases</span>
          </div>

          <div className="compiled-insights">
            <div className="spec-overview">
              <p className="preview-label">Déroulement compilé</p>
              <ol>{compiled.preview.phases.map((phase, index) => <li key={phase.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{phase.title}</span></li>)}</ol>
              <p className="preview-label component-label">Composants sélectionnés</p>
              <div className="component-pills">{compiled.preview.components.map((component) => <span key={component}>{componentLabels[component] ?? component}</span>)}</div>
            </div>

            <div className={`agent-report ${compiled.playtest.status}`}>
              <div className="agent-report-heading"><span>Agents virtuels</span><strong>{compiled.playtest.completedSimulations}/{compiled.playtest.simulations}</strong></div>
              <div className="simulation-meter"><i style={{ width: `${compiled.playtest.completionRate * 100}%` }} /></div>
              <dl>
                <div><dt>Configurations</dt><dd>{compiled.playtest.testedPlayerCounts.join(" · ")} joueurs</dd></div>
                <div><dt>Équipes testées</dt><dd>{compiled.playtest.testedTeamSizes.map((sizes) => sizes.join(" vs ")).join(" · ") || "Jeu individuel"}</dd></div>
                <div><dt>Actions moyennes</dt><dd>{compiled.playtest.averageActions}</dd></div>
              </dl>
              <p>{compiled.critique.summary}</p>
            </div>
          </div>

          <div className="compiled-actions">
            <button className="secondary-button" onClick={() => setCompiled(null)} disabled={busy}>Modifier l’idée</button>
            <button className="primary-button" onClick={() => void openRoom(compiled.blueprintId)} disabled={busy || compiled.releaseStatus !== "release_ready"}>
              <span>{compiled.releaseStatus === "release_ready" ? "Ouvrir la room" : "Release bloquée"}</span><b>→</b>
            </button>
          </div>
        </section>
      ) : null}

      <section className="clean-lower-section" id="join">
        <div className="clean-lower-copy">
          <p className="eyebrow">Pensé pour jouer, pas seulement pour écrire des règles</p>
          <h2>Chaque jeu doit survivre à la table.</h2>
          <p>Les agents utilisent les mêmes vues privées et les mêmes actions que les vrais joueurs. Un jeu bloqué, injuste ou indiscret n’atteint jamais la release.</p>
        </div>
        <div className="join-clean-card">
          <span>Vous avez déjà un code ?</span>
          <form onSubmit={joinRoom}>
            <input aria-label="Code de room" placeholder="ABC123" maxLength={6} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
            <button disabled={joinCode.trim().length !== 6}>Rejoindre</button>
          </form>
          {demo ? <button className="demo-clean-link" disabled={busy} onClick={() => void openRoom(demo.id)}>Ou tester « {demo.title} » <b>→</b></button> : null}
        </div>
      </section>
    </main>
  );
}
