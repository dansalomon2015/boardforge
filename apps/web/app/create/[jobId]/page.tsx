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
  "Mechanics are selected from the audited catalogue.",
  "No AI-generated code is ever executed.",
  "The engine verifies every action and condition.",
  "Virtual players explore several group sizes.",
  "The AI review looks for dead ends and balance issues.",
];

const statusLabels: Record<CompilationStatus, string> = {
  queued: "Queued",
  generating: "AI assembly",
  validating: "Strict validation",
  playtesting: "Virtual playtest",
  reviewing: "Review and balance",
  release_ready: "Ready to play",
  needs_review: "Review available",
  failed: "Compilation interrupted",
};

export default function CompilationPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const [job, setJob] = useState<CompilationJob | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [connectionNote, setConnectionNote] = useState("Connecting to the forge…");
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
          setLoadError(failure?.error ?? "This compilation could not be found.");
          return;
        }
        setLoadError("");
        handleJob(await response.json() as CompilationJob);
        setConnectionNote("Live updates active");
      } catch (error) {
        if (!cancelled) {
          setConnectionNote(error instanceof Error ? error.message : "Connection temporarily unavailable.");
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
        setConnectionNote("Invalid update received; periodic checks are active");
      }
    });
    eventSource.onopen = () => setConnectionNote("Live updates active");
    eventSource.onerror = () => {
      setConnectionNote("Backup periodic checks active");
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
        <a className="brand" href="/" aria-label="BoardForge home">
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

        <p className="eyebrow">{job ? statusLabels[job.status] : "Initializing"}</p>
        <h1>{failed ? "The forge has stopped." : "Your game is taking shape."}</h1>
        <p className="compilation-message">
          {failed ? loadError || job?.errorMessage || "The compilation could not be completed." : job?.message ?? "Preparing your idea…"}
        </p>

        <div className="compilation-progress" aria-label={`Progress ${progress}%`}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="compilation-progress-meta">
          <span>{failed ? job?.errorCode ?? "Error" : currentWaitingMessage}</span>
          <strong>{progress}%</strong>
        </div>

        {failed ? (
          <div className="compilation-error-actions">
            <button type="button" className="secondary-button" onClick={() => router.push("/")}>Edit my idea</button>
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
              <span>Check again</span><b>↻</b>
            </button>
          </div>
        ) : (
          <p className="compilation-footnote">You can leave this page open: the result is saved on the server.</p>
        )}
      </section>
    </main>
  );
}
