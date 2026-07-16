"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type CompilationStatus =
  | "queued"
  | "generating"
  | "validating"
  | "playtesting"
  | "reviewing"
  | "release_ready"
  | "needs_review"
  | "failed";

type CompilationJob = {
  id: string;
  status: CompilationStatus;
  progress: number;
  message: string;
  provider: string;
  attempts: number;
  errorCode?: string;
  errorMessage?: string;
  result?: { blueprintId: string };
};

const waitingMessages = [
  "Les mécaniques sont choisies dans le catalogue audité.",
  "Aucun code généré par l’IA n’est exécuté.",
  "Le moteur vérifie chaque action et chaque condition.",
  "Les agents explorent plusieurs tailles de groupe.",
  "La critique IA cherche les blocages et les déséquilibres.",
];

const statusLabels: Record<CompilationStatus, string> = {
  queued: "Dans la file",
  generating: "Assemblage IA",
  validating: "Validation stricte",
  playtesting: "Playtest virtuel",
  reviewing: "Critique et équilibre",
  release_ready: "Prêt à jouer",
  needs_review: "Révision disponible",
  failed: "Compilation interrompue",
};

export default function CompilationPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const [job, setJob] = useState<CompilationJob | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [connectionNote, setConnectionNote] = useState("Connexion à la forge…");
  const [loadError, setLoadError] = useState("");

  const terminal = job?.status === "release_ready" || job?.status === "needs_review" || job?.status === "failed";
  const currentWaitingMessage = useMemo(
    () => waitingMessages[messageIndex % waitingMessages.length],
    [messageIndex],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setMessageIndex((index) => index + 1), 4200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;

    const handleJob = (next: CompilationJob) => {
      if (cancelled) return;
      setJob(next);
      if ((next.status === "release_ready" || next.status === "needs_review") && next.result) {
        router.replace(`/?job=${encodeURIComponent(next.id)}`);
      }
    };

    const fetchStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/compilations/${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const failure = (await response.json().catch(() => null)) as { error?: string } | null;
          setLoadError(failure?.error ?? "La compilation est introuvable.");
          return;
        }
        setLoadError("");
        handleJob(await response.json() as CompilationJob);
        setConnectionNote("Suivi en temps réel actif");
      } catch (error) {
        if (!cancelled) {
          setConnectionNote(error instanceof Error ? error.message : "Connexion momentanément indisponible.");
        }
      }
    };

    void fetchStatus();
    eventSource = new EventSource(`${apiUrl}/api/compilations/${encodeURIComponent(jobId)}/events`);
    eventSource.addEventListener("status", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as CompilationJob;
        handleJob(next);
        if (next.status === "release_ready" || next.status === "needs_review") void fetchStatus();
      } catch {
        setConnectionNote("Mise à jour reçue invalide, suivi périodique actif");
      }
    });
    eventSource.onopen = () => setConnectionNote("Suivi en temps réel actif");
    eventSource.onerror = () => {
      setConnectionNote("Suivi périodique de secours actif");
      eventSource?.close();
      eventSource = null;
    };
    pollTimer = window.setInterval(() => {
      if (!terminal) void fetchStatus();
    }, 3500);

    return () => {
      cancelled = true;
      eventSource?.close();
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, [jobId, router, terminal]);

  const failed = job?.status === "failed" || Boolean(loadError);
  const progress = job?.progress ?? 3;

  return (
    <main className="compilation-shell">
      <nav className="topbar compilation-topbar">
        <a className="brand" href="/" aria-label="Accueil BoardForge">
          <span className="brand-mark">BF</span><span>BoardForge</span>
        </a>
        <span className="compilation-connection"><i /> {connectionNote}</span>
      </nav>

      <section className={`compilation-stage ${failed ? "has-failed" : ""}`} aria-live="polite">
        <div className="forge-orbit" aria-hidden="true">
          <span className="forge-core">BF</span>
          <i className="orbit-piece piece-one">◆</i>
          <i className="orbit-piece piece-two">●</i>
          <i className="orbit-piece piece-three">▲</i>
        </div>

        <p className="eyebrow">{job ? statusLabels[job.status] : "Initialisation"}</p>
        <h1>{failed ? "La forge s’est arrêtée." : "Votre jeu prend forme."}</h1>
        <p className="compilation-message">
          {failed ? loadError || job?.errorMessage || "La compilation n’a pas pu être terminée." : job?.message ?? "Préparation de votre idée…"}
        </p>

        <div className="compilation-progress" aria-label={`Progression ${progress}%`}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="compilation-progress-meta">
          <span>{failed ? job?.errorCode ?? "Erreur" : currentWaitingMessage}</span>
          <strong>{progress}%</strong>
        </div>

        {failed ? (
          <div className="compilation-error-actions">
            <button type="button" className="secondary-button" onClick={() => router.push("/")}>Modifier mon idée</button>
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              <span>Vérifier à nouveau</span><b>↻</b>
            </button>
          </div>
        ) : (
          <p className="compilation-footnote">Vous pouvez laisser cette page ouverte : le résultat est sauvegardé côté serveur.</p>
        )}
      </section>
    </main>
  );
}
