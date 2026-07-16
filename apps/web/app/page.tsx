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

type StructuredCritique = {
  schemaVersion: 1;
  sourceSpecId: string;
  verdict: "release_ready" | "revise";
  summary: string;
  strengths: string[];
  issues: Array<{
    code: string;
    severity: "low" | "medium" | "high";
    category: "flow" | "balance" | "clarity" | "privacy" | "pace" | "team_fairness" | "replayability";
    evidence: string;
    recommendation: string;
  }>;
};

type CompiledGame = {
  blueprintId: string;
  releaseStatus: "release_ready" | "needs_review";
  game: GameSummary;
  provider: string;
  preview: ComposedPreview;
  playtest: PlaytestReport;
  critique: StructuredCritique;
  balanceSuggestionAvailable: boolean;
};

type BalanceChange =
  | { kind: "set_duration"; minutes: number }
  | { kind: "set_timer_seconds"; componentId: string; seconds: number }
  | { kind: "set_effect_amount"; owner: string; ownerId: string; effectIndex: number; amount: number }
  | { kind: "set_draw_count"; owner: string; ownerId: string; effectIndex: number; count: number }
  | { kind: "set_resource_initial"; resourceId: string; initialValue: number };

type BalanceReview = {
  balancePatchId: string;
  status: "proposed" | "accepted" | "rejected";
  sourceBlueprintId: string;
  derivedBlueprintId: string;
  patch: {
    schemaVersion: 1;
    sourceSpecId: string;
    summary: string;
    changes: BalanceChange[];
  };
  before: PlaytestReport;
  beforeCritique: StructuredCritique;
  after: PlaytestReport;
  afterCritique: StructuredCritique;
  optimization: { patchSource: "precomputed_review" | "live_fallback" };
  derived: {
    game: GameSummary;
    preview: ComposedPreview;
    releaseStatus: "awaiting_acceptance" | "needs_review";
  };
};

type RevisionEntry = {
  revision: number;
  blueprintId: string;
  parentBlueprintId?: string;
  patch?: {
    id: string;
    status: "proposed" | "accepted" | "rejected";
    summary: string;
    changes: BalanceChange[];
  };
  releaseStatus: "draft" | "validating" | "playtesting" | "release_ready" | "needs_review";
  canSelect: boolean;
  game: GameSummary;
  preview: ComposedPreview;
  playtest?: PlaytestReport;
  critique?: StructuredCritique;
  balanceSuggestionAvailable: boolean;
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

const critiqueCategoryLabels: Record<StructuredCritique["issues"][number]["category"], string> = {
  flow: "Déroulement",
  balance: "Équilibre",
  clarity: "Clarté",
  privacy: "Informations privées",
  pace: "Rythme",
  team_fairness: "Équité des équipes",
  replayability: "Rejouabilité",
};

function balanceChangeLabel(change: BalanceChange): string {
  if (change.kind === "set_duration") return `Durée annoncée → ${change.minutes} min`;
  if (change.kind === "set_timer_seconds") return `Chronomètre ${change.componentId} → ${change.seconds} s`;
  if (change.kind === "set_effect_amount") return `Effet ${change.ownerId} #${change.effectIndex + 1} → ${change.amount}`;
  if (change.kind === "set_draw_count") return `Pioche ${change.ownerId} #${change.effectIndex + 1} → ${change.count} carte(s)`;
  return `Ressource ${change.resourceId} → valeur initiale ${change.initialValue}`;
}

export default function HomePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(promptIdeas[0]!.prompt);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Prêt à compiler");
  const [error, setError] = useState("");
  const [compiled, setCompiled] = useState<CompiledGame | null>(null);
  const [balance, setBalance] = useState<BalanceReview | null>(null);
  const [history, setHistory] = useState<RevisionEntry[]>([]);
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
    setBalance(null);
    setHistory([]);
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
      void loadHistory(result.blueprintId);
      setStage(result.releaseStatus === "release_ready" ? "Jeu validé pour la release" : "Révision nécessaire");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
      setStage("Prêt à compiler");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory(blueprintId: string) {
    try {
      const response = await fetch(`${apiUrl}/api/blueprints/${encodeURIComponent(blueprintId)}/history`);
      if (!response.ok) return;
      const result = (await response.json()) as { revisions: RevisionEntry[] };
      setHistory(result.revisions);
    } catch {
      // History is supplementary; compilation and room creation remain usable.
    }
  }

  async function testBalance() {
    if (!compiled) return;
    setBusy(true);
    setError("");
    setStage(compiled.balanceSuggestionAvailable ? "Application de la suggestion préparée" : "L’IA prépare un patch borné");
    try {
      const response = await fetch(`${apiUrl}/api/blueprints/${encodeURIComponent(compiled.blueprintId)}/balance`, {
        method: "POST",
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "Le patch d’équilibrage n’a pas pu être testé.");
      }
      const result = (await response.json()) as BalanceReview;
      setBalance(result);
      void loadHistory(result.sourceBlueprintId);
      setStage(result.after.status === "passed" ? "Patch vérifié, décision requise" : "Patch rejeté par les agents");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
      setStage("Jeu compilé");
    } finally {
      setBusy(false);
    }
  }

  async function acceptBalance() {
    if (!compiled || !balance) return;
    setBusy(true);
    setError("");
    setStage("Publication de la révision");
    try {
      const response = await fetch(`${apiUrl}/api/balance-patches/${balance.balancePatchId}/accept`, {
        method: "POST",
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "La révision n’a pas pu être acceptée.");
      }
      const result = (await response.json()) as {
        blueprintId: string;
        releaseStatus: "release_ready";
        game: GameSummary;
        preview: ComposedPreview;
        playtest: PlaytestReport;
        critique: StructuredCritique;
        balanceSuggestionAvailable: boolean;
      };
      setCompiled({
        ...compiled,
        blueprintId: result.blueprintId,
        releaseStatus: result.releaseStatus,
        game: result.game,
        preview: result.preview,
        playtest: result.playtest,
        critique: result.critique,
        balanceSuggestionAvailable: result.balanceSuggestionAvailable,
      });
      setBalance({ ...balance, status: "accepted" });
      void loadHistory(result.blueprintId);
      setStage("Révision équilibrée release ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectBalance() {
    if (!balance) return;
    setBusy(true);
    setError("");
    setStage("Rejet de la révision");
    try {
      const response = await fetch(`${apiUrl}/api/balance-patches/${balance.balancePatchId}/reject`, {
        method: "POST",
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(failure?.error ?? "La révision n’a pas pu être rejetée.");
      }
      setBalance({ ...balance, status: "rejected" });
      void loadHistory(balance.sourceBlueprintId);
      setStage("Révision rejetée, version initiale conservée");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Erreur inattendue.");
    } finally {
      setBusy(false);
    }
  }

  function selectRevision(revision: RevisionEntry) {
    if (!compiled || !revision.canSelect || !revision.playtest || !revision.critique) {
      setError("Cette révision ne possède pas tous les contrôles nécessaires pour être sélectionnée.");
      return;
    }
    setCompiled({
      ...compiled,
      blueprintId: revision.blueprintId,
      releaseStatus: "release_ready",
      game: revision.game,
      preview: revision.preview,
      playtest: revision.playtest,
      critique: revision.critique,
      balanceSuggestionAvailable: revision.balanceSuggestionAvailable,
    });
    setBalance(null);
    setError("");
    setStage(`Révision ${revision.revision} sélectionnée`);
    void loadHistory(revision.blueprintId);
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

          <div className={`structured-critique ${compiled.critique.verdict}`}>
            <div className="structured-critique-heading">
              <div>
                <p className="preview-label">Critique IA structurée</p>
                <h3>{compiled.critique.summary}</h3>
              </div>
              <span>{compiled.critique.verdict === "release_ready" ? "Avis favorable" : "Révision demandée"}</span>
            </div>
            <div className="critique-columns">
              <div>
                <strong>Points solides</strong>
                <ul>{compiled.critique.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul>
              </div>
              <div>
                <strong>Points de vigilance</strong>
                <ul className="critique-issues">
                  {compiled.critique.issues.length > 0 ? compiled.critique.issues.map((issue) => (
                    <li key={issue.code} className={`severity-${issue.severity}`}>
                      <span>{critiqueCategoryLabels[issue.category]}</span>
                      <b>{issue.recommendation}</b>
                      <small>{issue.evidence}</small>
                    </li>
                  )) : <li className="critique-empty">Aucun problème structurel identifié.</li>}
                </ul>
              </div>
            </div>
          </div>

          {balance ? (
            <div className={`balance-review ${balance.after.status === "passed" ? "balance-passed" : "balance-failed"}`}>
              <div className="balance-review-heading">
                <div>
                  <p className="preview-label">Révision d’équilibrage IA</p>
                  <h3>{balance.patch.summary}</h3>
                </div>
                <span>{balance.status === "accepted" ? "Acceptée" : balance.status === "rejected" ? "Rejetée" : balance.after.status === "passed" ? "À confirmer" : "Bloquée"}</span>
              </div>
              <small className="balance-optimization-note">
                {balance.optimization.patchSource === "precomputed_review"
                  ? "Patch réutilisé depuis le ReviewBundle · aucun appel IA supplémentaire"
                  : "Patch généré à la demande pour une ancienne révision compatible"}
              </small>
              <div className="balance-comparison">
                <div><small>Avant</small><strong>{Math.round(balance.before.completionRate * 100)}%</strong><span>{balance.before.averageActions} actions moy.</span></div>
                <b>→</b>
                <div><small>Après</small><strong>{Math.round(balance.after.completionRate * 100)}%</strong><span>{balance.after.averageActions} actions moy.</span></div>
                <ul>{balance.patch.changes.map((change, index) => <li key={`${change.kind}-${index}`}>{balanceChangeLabel(change)}</li>)}</ul>
              </div>
              <p className="balance-critique-result"><b>Nouvel avis IA :</b> {balance.afterCritique.summary}</p>
              {balance.status === "proposed" && balance.after.status === "passed" ? (
                <div className="balance-decision-actions">
                  <button className="balance-reject-button" onClick={() => void rejectBalance()} disabled={busy}>Rejeter</button>
                  <button className="balance-accept-button" onClick={() => void acceptBalance()} disabled={busy}>
                    Accepter cette révision vérifiée <b>→</b>
                  </button>
                </div>
              ) : null}
              {balance.after.status === "failed" ? <p className="balance-warning">Cette révision reste bloquée : les agents n’ont pas validé la nouvelle version.</p> : null}
            </div>
          ) : (
            <div className="balance-callout">
              <div>
                <strong>{compiled.balanceSuggestionAvailable ? "Suggestion IA déjà préparée" : "Tester une variante d’équilibrage"}</strong>
                <span>{compiled.balanceSuggestionAvailable ? "La critique et le patch ont été produits ensemble : aucun nouvel appel IA n’est nécessaire pour lancer ce test." : "L’IA ne peut modifier que des paramètres audités, puis les agents rejouent le jeu avant toute décision."}</span>
              </div>
              <button onClick={() => void testBalance()} disabled={busy}>{compiled.balanceSuggestionAvailable ? "Appliquer et tester" : "Proposer et tester"}</button>
            </div>
          )}

          {history.length > 0 ? (
            <div className="revision-history">
              <div className="revision-history-heading">
                <div><p className="preview-label">Historique immuable</p><h3>{history.length} version{history.length > 1 ? "s" : ""}</h3></div>
                <span>Aucune version n’est écrasée</span>
              </div>
              <div className="revision-list">
                {history.map((revision) => {
                  const selected = revision.blueprintId === compiled.blueprintId;
                  return (
                    <article className={`revision-card ${selected ? "is-selected" : ""}`} key={revision.blueprintId}>
                      <div className="revision-card-top">
                        <strong>V{revision.revision}</strong>
                        <span className={`revision-status status-${revision.patch?.status ?? revision.releaseStatus}`}>
                          {selected ? "Active" : revision.patch?.status === "accepted" ? "Acceptée" : revision.patch?.status === "rejected" ? "Rejetée" : revision.patch?.status === "proposed" ? "Proposée" : revision.releaseStatus === "release_ready" ? "Validée" : "Bloquée"}
                        </span>
                      </div>
                      <h4>{revision.game.title}</h4>
                      <p>{revision.patch?.summary ?? "Version compilée depuis le prompt initial."}</p>
                      <dl>
                        <div><dt>Complétion</dt><dd>{revision.playtest ? `${Math.round(revision.playtest.completionRate * 100)}%` : "—"}</dd></div>
                        <div><dt>Actions moy.</dt><dd>{revision.playtest?.averageActions ?? "—"}</dd></div>
                        <div><dt>Avis IA</dt><dd>{revision.critique?.verdict === "release_ready" ? "Favorable" : revision.critique ? "À revoir" : "—"}</dd></div>
                      </dl>
                      {revision.canSelect && !selected ? <button onClick={() => selectRevision(revision)}>Utiliser cette version</button> : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="compiled-actions">
            <button className="secondary-button" onClick={() => { setCompiled(null); setBalance(null); setHistory([]); }} disabled={busy}>Modifier l’idée</button>
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
