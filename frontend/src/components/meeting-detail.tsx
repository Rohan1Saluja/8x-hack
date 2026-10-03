"use client";

import {
  LifecycleControls,
  StatusBadge,
} from "@/components/lifecycle-controls";
import {
  EvidenceEmpty,
  EvidenceFact,
  SourceLinks,
  timestamp as time,
} from "@/components/meeting-evidence";
import { IntelligenceRail } from "@/components/intelligence-rail";
import { SignalIcon, SignalMotif } from "@/components/ui/signal";
import { Button } from "@/components/ui/button";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "@/lib/api";
import type { ActionItem, Meeting, MeetingEvidence } from "@/lib/types";

export function MeetingDetail({
  initial,
  onChanged,
}: {
  initial: Meeting;
  onChanged: () => Promise<void>;
}) {
  const [meeting, setMeeting] = useState(initial);
  const [evidence, setEvidence] = useState<MeetingEvidence | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"summary" | "transcript" | "questions">(
    "summary",
  );
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [playback, setPlayback] = useState("");
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const operationLock = useRef(false);
  const playbackLock = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const questionId = useRef<string | null>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const id = initial.id;
  const refresh = useCallback(async () => {
    const [freshMeeting, freshEvidence] = await Promise.all([
      api<Meeting>(`meetings/${id}`),
      api<MeetingEvidence>(`meetings/${id}/evidence`),
    ]);
    setMeeting(freshMeeting);
    setEvidence(freshEvidence);
  }, [id]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [m, e] = await Promise.all([
          api<Meeting>(`meetings/${id}`),
          api<MeetingEvidence>(`meetings/${id}/evidence`),
        ]);
        if (active) {
          setMeeting(m);
          setEvidence(e);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load meeting.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id]);
  const running = evidence?.jobs.some((j) => j.status === "running") || false;
  const processing = busy === "transcribe" || busy === "summarize" || running;
  const hasTranscript = !!evidence?.segments.length;
  const interrupted = evidence?.jobs.some((j) => j.interrupted) || false;
  const selectedSegment = evidence?.segments.find(
    (s) => s.id === activeSegment,
  );
  useEffect(() => {
    if (tab !== "transcript" || !activeSegment) return;
    document
      .getElementById(`segment-${activeSegment}`)
      ?.focus({ preventScroll: true });
    document
      .getElementById(`segment-${activeSegment}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [tab, activeSegment]);
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(() => {
      void refresh().catch(() =>
        setError("Progress refresh failed. Try Refresh details."),
      );
    }, 10000);
    return () => clearInterval(interval);
  }, [processing, refresh]);
  async function action(stage: string) {
    if (operationLock.current) return;
    operationLock.current = true;
    setNotice("");
    setBusy(stage);
    setError("");
    try {
      await api(`meetings/${id}/${stage}`, "POST");
      if (stage === "transcribe") setTab("transcript");
      if (stage === "summarize") setTab("summary");
      setNotice(
        stage === "recover"
          ? "Interrupted work recovered. You can retry the unfinished stage."
          : stage === "transcribe"
            ? "Transcript saved. You can now generate a summary."
            : "Summary saved. Review its linked evidence below.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      try {
        await refresh();
        await onChanged();
      } catch {
        setError("Unable to refresh saved progress. Try again.");
      }
      operationLock.current = false;
      setBusy("");
    }
  }
  async function authorizePlayback(at?: number) {
    if (!meeting.recording_ready) return;
    pendingSeek.current = at ?? player.current?.currentTime ?? 0;
    if (playbackLock.current) return;
    playbackLock.current = true;
    setPlaybackBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`meetings/${id}/playback`);
      setPlayback(result.url);
      if (
        result.url === playback &&
        player.current &&
        player.current.readyState >= 1
      ) {
        player.current.currentTime = pendingSeek.current ?? 0;
        pendingSeek.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback unavailable.");
    } finally {
      playbackLock.current = false;
      setPlaybackBusy(false);
    }
  }
  function seek(segmentId: string) {
    const segment = evidence?.segments.find((s) => s.id === segmentId);
    if (!segment) return;
    setActiveSegment(segmentId);
    if (!meeting.recording_ready) return;
    if (player.current && playback && player.current.readyState >= 1) {
      player.current.currentTime = segment.start_seconds;
    } else {
      void authorizePlayback(segment.start_seconds);
    }
  }
  function openEvidence(segmentId: string) {
    setTranscriptQuery("");
    setTab("transcript");
    seek(segmentId);
  }
  const sources = (ids: string[]) => (
    <SourceLinks
      ids={ids}
      segments={evidence?.segments || []}
      onOpen={openEvidence}
    />
  );
  async function saveAction(
    item: ActionItem,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true;
    const data = new FormData(event.currentTarget);
    setBusy(item.id);
    setError("");
    try {
      await api(`meetings/${id}/actions/${item.id}`, "PATCH", {
        text: data.get("text"),
        owner: data.get("owner") || null,
        due_date: data.get("due_date") || null,
        completed: data.get("completed") === "on",
      });
      await refresh();
      setNotice("Action item saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action update failed.");
    } finally {
      operationLock.current = false;
      setBusy("");
    }
  }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true;
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy("question");
    setError("");
    questionId.current ??= crypto.randomUUID();
    try {
      await api(`meetings/${id}/questions`, "POST", {
        question: data.get("question"),
        request_id: questionId.current,
      });
      questionId.current = null;
      form.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Question failed.");
    } finally {
      operationLock.current = false;
      setBusy("");
    }
  }
  async function remove() {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy("delete");
    setError("");
    try {
      await api(`meetings/${id}`, "DELETE");
      setDeleted(true);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete meeting.");
    } finally {
      operationLock.current = false;
      setBusy("");
    }
  }
  if (deleted)
    return (
      <div className="px-7 py-[58px] text-center text-muted">
        <h3 className="mb-2 text-base font-semibold text-ink">
          Meeting deleted
        </h3>
        <p className="m-auto max-w-[320px] text-xs">
          Select another meeting from the library.
        </p>
      </div>
    );
  const transcriptBusy =
    busy === "transcribe" || meeting.transcription_state === "running";
  const summaryBusy =
    busy === "summarize" || meeting.summary_state === "running";
  const filteredSegments =
    evidence?.segments.filter((s) =>
      s.text.toLowerCase().includes(transcriptQuery.toLowerCase()),
    ) || [];
  const stageBlocked = !!busy || running || !evidence;
  return (
    <div className="meeting-intelligence">
      <header className="meeting-header">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2">
            <SignalIcon /> MEETING INTELLIGENCE
          </p>
          <h1>{meeting.title}</h1>
          <div className="meeting-meta">
            <time dateTime={meeting.created_at}>
              {new Date(meeting.created_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            <span>
              {meeting.capture_mode === "demo"
                ? "Simulated capture"
                : meeting.recording_ready
                  ? "Imported recording"
                  : "Meeting link"}
            </span>
            {meeting.duration_seconds !== null && (
              <span>{time(meeting.duration_seconds)} duration</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status">
            <StatusBadge meeting={meeting} />
          </span>
          <Button
            variant="text"
            disabled={!!busy}
            onClick={() =>
              void refresh()
                .then(() => {
                  setError("");
                  setNotice("Meeting details refreshed.");
                })
                .catch((e) => setError(e.message))
            }
          >
            Refresh details
          </Button>
        </div>
      </header>
      <LifecycleControls
        meeting={meeting}
        onChange={(next) => {
          setMeeting((current) =>
            next.lifecycle_version >= current.lifecycle_version
              ? next
              : current,
          );
        }}
      />
      {error && (
        <p className="error-notice mb-4" role="alert">
          {error}
        </p>
      )}
      {meeting.failure_code && (
        <p className="error-notice mb-4">
          Last failure: {meeting.failure_code.replaceAll("_", " ")}. Completed
          stages are saved. Refresh before retrying; quota failures require
          reviewing the available free allowance.
        </p>
      )}
      <p className="sr-only" role="status">
        {notice}
      </p>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="recording-surface" aria-label="Meeting recording">
            <div className="recording-toolbar">
              <span className="eyebrow">ORIGINAL RECORDING</span>
              <span>
                {meeting.recording_ready
                  ? "Private playback"
                  : "No media attached"}
              </span>
            </div>
            {meeting.recording_ready ? (
              playback ? (
                <video
                  className="recording-player"
                  ref={player}
                  src={playback}
                  controls
                  preload="metadata"
                  aria-label="Private meeting recording"
                  onLoadedMetadata={() => {
                    if (player.current && pendingSeek.current !== null) {
                      player.current.currentTime = pendingSeek.current;
                      pendingSeek.current = null;
                    }
                  }}
                  onError={() =>
                    setError(
                      "Playback link may have expired. Choose Refresh playback link.",
                    )
                  }
                />
              ) : (
                <div className="player-empty has-recording">
                  <SignalMotif compact />
                  <div className="recording-invitation">
                    <h2>Your source of truth</h2>
                    <p>
                      The original recording stays private. Open it to review
                      the moments behind your notes.
                    </p>
                    <Button
                      disabled={playbackBusy}
                      onClick={() => void authorizePlayback()}
                    >
                      {playbackBusy
                        ? "Authorizing playback…"
                        : "Load private recording"}
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="player-empty">
                <SignalMotif compact />
                <h2>
                  {meeting.capture_mode === "demo"
                    ? "A walkthrough, without the recording"
                    : "Start with the original conversation"}
                </h2>
                <p>
                  {meeting.capture_mode === "demo"
                    ? "Capture is simulated. No bot joins, no audio is captured, and no transcript or AI notes are created."
                    : "A real recording must be imported before transcription. This workspace does not capture live meeting audio."}
                </p>
                <details className="import-help">
                  <summary>How to add a real recording</summary>
                  <p>
                    Create a new meeting and ask your workspace operator to
                    import a complete PCM WAV recording (up to 3 minutes / 24
                    MB), then select Refresh details. Notify participants and
                    obtain consent before recording. Upload is not available in
                    this interface.
                  </p>
                </details>
              </div>
            )}
            {playback && (
              <div className="px-5 pb-3">
                <Button
                  variant="text"
                  disabled={playbackBusy}
                  onClick={() => void authorizePlayback()}
                >
                  {playbackBusy
                    ? "Refreshing playback…"
                    : "Refresh playback link"}
                </Button>
              </div>
            )}
          </section>
          <section
            className="processing-rail"
            aria-label="Recording processing"
          >
            <div className="processing-step">
              <span
                className={`pipeline-number ${meeting.recording_ready ? "is-ready" : ""}`}
              >
                {meeting.recording_ready ? "✓" : "1"}
              </span>
              <div>
                <strong>Recording</strong>
                <p>
                  {meeting.recording_ready
                    ? "Attached privately"
                    : "Awaiting real media"}
                </p>
              </div>
            </div>
            <div className="processing-step" data-active={transcriptBusy}>
              <span
                className={`pipeline-number ${hasTranscript ? "is-ready" : ""}`}
              >
                {hasTranscript ? "✓" : "2"}
              </span>
              <div>
                <strong>Transcript</strong>
                <p>
                  {transcriptBusy
                    ? "Transcribing recording…"
                    : hasTranscript
                      ? `${evidence?.segments.length} stored segments`
                      : "Timestamped evidence"}
                </p>
                <Button
                  variant="text"
                  disabled={
                    stageBlocked ||
                    !meeting.recording_ready ||
                    meeting.transcription_state === "ready"
                  }
                  onClick={() => void action("transcribe")}
                >
                  {transcriptBusy
                    ? "Transcribing…"
                    : hasTranscript
                      ? "Transcript saved"
                      : meeting.transcription_state === "failed"
                        ? "Retry transcription"
                        : "Generate transcript"}
                </Button>
              </div>
            </div>
            <div className="processing-step ai-step" data-active={summaryBusy}>
              <span
                className={`pipeline-number ${evidence?.summary ? "is-ready" : ""}`}
              >
                {evidence?.summary ? "✓" : "3"}
              </span>
              <div>
                <strong>Intelligence</strong>
                <p>
                  {summaryBusy
                    ? "Summarizing evidence…"
                    : evidence?.summary
                      ? "Summary saved"
                      : "Grounded in transcript"}
                </p>
                <Button
                  variant="text"
                  disabled={
                    stageBlocked ||
                    !hasTranscript ||
                    meeting.transcription_state !== "ready" ||
                    meeting.summary_state === "ready"
                  }
                  onClick={() => void action("summarize")}
                >
                  {summaryBusy
                    ? "Summarizing…"
                    : evidence?.summary
                      ? "Summary saved"
                      : meeting.summary_state === "failed"
                        ? "Retry summary"
                        : "Generate summary"}
                </Button>
              </div>
            </div>
          </section>
          {processing && (
            <p className="processing-notice" role="status">
              {interrupted
                ? "Processing was interrupted. Recover the unfinished work before retrying."
                : "Processing is in progress. Saved results will appear here; you can return after a refresh."}
            </p>
          )}
          {interrupted && (
            <Button
              variant="secondary"
              size="compact"
              disabled={!!busy}
              onClick={() => void action("recover")}
            >
              Recover interrupted work
            </Button>
          )}
          {!!evidence?.jobs.length && (
            <details className="processing-details">
              <summary>Processing history</summary>
              <ul>
                {evidence.jobs.map((job) => (
                  <li key={job.job_key}>
                    {job.stage}: {job.status} · {job.attempts}/3 attempts
                    {job.error_code
                      ? ` · ${job.error_code.replaceAll("_", " ")}`
                      : ""}
                    {job.retry_after && (
                      <>
                        {" "}
                        · Retry after{" "}
                        {new Date(job.retry_after).toLocaleTimeString()}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div
            className="meeting-tabs"
            role="tablist"
            aria-label="Meeting content"
          >
            {(["summary", "transcript", "questions"] as const).map((t) => (
              <button
                role="tab"
                id={`tab-${t}`}
                tabIndex={tab === t ? 0 : -1}
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                key={t}
                onKeyDown={(event) => {
                  const tabs = ["summary", "transcript", "questions"] as const;
                  const index = tabs.indexOf(t);
                  const next =
                    event.key === "ArrowRight"
                      ? tabs[(index + 1) % 3]
                      : event.key === "ArrowLeft"
                        ? tabs[(index + 2) % 3]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs[2]
                            : null;
                  if (next) {
                    event.preventDefault();
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab(t)}
              >
                {t === "questions"
                  ? "Ask AI"
                  : t === "summary"
                    ? "Summary"
                    : "Transcript"}
                {t === "transcript" && hasTranscript && (
                  <span>{evidence?.segments.length}</span>
                )}
              </button>
            ))}
          </div>
          <div
            className="meeting-panel"
            key={tab}
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
          >
            {!evidence ? (
              <EvidenceEmpty title="Loading meeting evidence">
                Retrieving saved transcript, notes, and sources.
              </EvidenceEmpty>
            ) : (
              <>
                {tab === "summary" &&
                  (evidence.summary ? (
                    <div className="summary-content">
                      <section className="prism-surface summary-prism">
                        <div className="summary-symbol" aria-hidden="true">
                          <SignalIcon />
                        </div>
                        <p className="eyebrow ai-label">
                          AI SYNTHESIS · LINKED TO EVIDENCE
                        </p>
                        <h2>The conversation, distilled.</h2>
                        <EvidenceFact
                          item={evidence.summary.overview}
                          segments={evidence.segments}
                          onOpen={openEvidence}
                        />
                      </section>
                      <div
                        className="summary-index"
                        aria-label="Summary contents"
                      >
                        <span>
                          <strong>{evidence.summary.topics.length}</strong> key
                          topics
                        </span>
                        <span>
                          <strong>{evidence.summary.decisions.length}</strong>{" "}
                          decisions
                        </span>
                        <span>
                          <strong>{evidence.actions.length}</strong> action
                          items
                        </span>
                      </div>
                      <div className="section-heading">
                        <h3>Key topics</h3>
                        <span>{evidence.summary.topics.length} topics</span>
                      </div>
                      {evidence.summary.topics.length ? (
                        <ol className="topic-list">
                          {evidence.summary.topics.map((item, index) => (
                            <li key={index}>
                              <span className="topic-index">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <EvidenceFact
                                item={item}
                                segments={evidence.segments}
                                onOpen={openEvidence}
                              />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="rail-empty">
                          No topics were identified in the saved summary.
                        </p>
                      )}
                      <p className="evidence-footnote">
                        AI notes can miss nuance. Open a timestamp to check the
                        original evidence.
                      </p>
                    </div>
                  ) : (
                    <EvidenceEmpty
                      title={
                        summaryBusy
                          ? "Connecting the key points"
                          : hasTranscript
                            ? "Your transcript is ready for synthesis"
                            : "Every insight starts with evidence"
                      }
                      processing={summaryBusy}
                    >
                      {summaryBusy
                        ? "Generating a structured overview, topics, decisions, and actions from your stored transcript."
                        : hasTranscript
                          ? "Select Generate summary above to turn the stored transcript into notes with source links."
                          : "Import a real recording, generate its transcript, then create a summary. Demo capture never creates AI content."}
                    </EvidenceEmpty>
                  ))}
                {tab === "transcript" &&
                  (hasTranscript ? (
                    <div>
                      <div className="section-heading">
                        <h2>Conversation timeline</h2>
                        <span>{evidence.segments.length} segments</span>
                      </div>
                      <label className="field-label mb-5">
                        Search transcript
                        <input
                          className="field"
                          type="search"
                          value={transcriptQuery}
                          onChange={(e) => setTranscriptQuery(e.target.value)}
                          placeholder="Find a word or a moment…"
                        />
                      </label>
                      {!meeting.recording_ready && (
                        <p className="evidence-footnote">
                          Transcript evidence is available. No recording is
                          attached for playback.
                        </p>
                      )}
                      {!filteredSegments.length && (
                        <p className="rail-empty" role="status">
                          No matching transcript segments.
                        </p>
                      )}
                      <ol className="transcript-timeline">
                        {filteredSegments.map((segment) => (
                          <li
                            id={`segment-${segment.id}`}
                            tabIndex={-1}
                            className={
                              activeSegment === segment.id
                                ? "segment-active"
                                : ""
                            }
                            key={segment.id}
                          >
                            <button
                              className="timeline-time"
                              type="button"
                              onClick={() => seek(segment.id)}
                              aria-label={`${meeting.recording_ready ? "Seek recording" : "Select evidence"} at ${time(segment.start_seconds)}`}
                            >
                              {time(segment.start_seconds)}
                            </button>
                            <div>
                              {segment.speaker && (
                                <p className="speaker-label">
                                  {segment.speaker}
                                </p>
                              )}
                              <p>
                                <TranscriptText
                                  text={segment.text}
                                  query={transcriptQuery}
                                />
                              </p>
                              {activeSegment === segment.id && (
                                <span className="selected-evidence-label">
                                  Selected evidence
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <EvidenceEmpty
                      title={
                        transcriptBusy
                          ? "Listening for the details"
                          : "The conversation belongs here"
                      }
                      processing={transcriptBusy}
                    >
                      {transcriptBusy
                        ? "Transcribing your real recording. Timestamps will appear with the saved segments."
                        : meeting.recording_ready
                          ? "Select Generate transcript above to transcribe your attached recording."
                          : "Attach a real recording first. Timestamps and speaker labels are shown only when present in stored evidence."}
                    </EvidenceEmpty>
                  ))}
                {tab === "questions" && (
                  <div className="ask-workspace">
                    <div className="ask-intro">
                      <SignalMotif compact />
                      <div>
                        <p className="eyebrow ai-label">EVIDENCE ASSISTANT</p>
                        <h2>Ask the conversation.</h2>
                        <p>
                          Answers use only this meeting. Every supported answer
                          links back to stored evidence.
                        </p>
                      </div>
                    </div>
                    {!hasTranscript && (
                      <p className="processing-notice">
                        No transcript evidence yet. Generate a transcript from a
                        real recording to ask questions.
                      </p>
                    )}
                    <div
                      className="suggested-questions"
                      aria-label="Suggested questions"
                    >
                      {[
                        "What did we decide?",
                        "What are the next steps?",
                        "What is still unresolved?",
                      ].map((question) => (
                        <button
                          type="button"
                          key={question}
                          disabled={!hasTranscript || !!busy || running}
                          onClick={() => {
                            if (!questionInput.current) return;
                            questionInput.current.value = question;
                            questionId.current = null;
                            questionInput.current.focus();
                          }}
                        >
                          {question}
                          <span aria-hidden="true">↗</span>
                        </button>
                      ))}
                    </div>
                    <form
                      className="question-composer"
                      onSubmit={(e) => void ask(e)}
                    >
                      <label className="field-label">
                        Ask about this meeting
                        <textarea
                          className="field"
                          name="question"
                          ref={questionInput}
                          required
                          maxLength={2000}
                          disabled={!hasTranscript || !!busy || running}
                          onChange={() => {
                            questionId.current = null;
                          }}
                          placeholder="What did we decide, and what is still unresolved?"
                        />
                      </label>
                      <div className="composer-footer">
                        <span>
                          {hasTranscript
                            ? `${evidence.segments.length} source segments available`
                            : "Waiting for evidence"}
                        </span>
                        <Button
                          disabled={
                            !!busy ||
                            running ||
                            !hasTranscript ||
                            meeting.transcription_state !== "ready"
                          }
                        >
                          {busy === "question"
                            ? "Finding evidence…"
                            : "Ask meeting"}
                        </Button>
                      </div>
                    </form>
                    {busy === "question" && (
                      <div className="thinking-state" role="status">
                        <span className="thinking-dots" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <div>
                          <strong>Following the evidence</strong>
                          <p>Finding an answer in this meeting’s evidence…</p>
                        </div>
                      </div>
                    )}
                    <div className="answers-list">
                      {evidence.questions.map((q) => (
                        <article className="answer-card" key={q.id}>
                          <p className="eyebrow mb-2">YOU ASKED</p>
                          <h3>{q.question}</h3>
                          <p
                            className={`answer-support ${q.answer.supported ? "ai-label" : "text-muted"}`}
                          >
                            {q.answer.supported
                              ? "Answer with sources"
                              : "Insufficient meeting evidence"}
                          </p>
                          <p className="answer-text">{q.answer.answer}</p>
                          {sources(q.answer.source_segment_ids)}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="meeting-footer">
            {confirmDelete ? (
              <>
                <p>
                  Delete this meeting, its recording, transcript, and notes?
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="danger"
                    size="small"
                    disabled={!!busy}
                    onClick={() => void remove()}
                  >
                    Delete meeting
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="text" onClick={() => setConfirmDelete(true)}>
                Delete meeting…
              </Button>
            )}
          </div>
        </div>
        <IntelligenceRail
          evidence={evidence}
          busy={busy}
          onSave={saveAction}
          onOpen={openEvidence}
          selectedSegment={selectedSegment}
          meeting={meeting}
        />
      </div>
    </div>
  );
}

function TranscriptText({ text, query }: { text: string; query: string }) {
  const term = query.toLowerCase();
  if (!term) return text;
  const result = [];
  const lower = text.toLowerCase();
  let cursor = 0;
  let found = lower.indexOf(term);
  while (found !== -1) {
    result.push(text.slice(cursor, found));
    result.push(
      <mark key={found}>{text.slice(found, found + term.length)}</mark>,
    );
    cursor = found + term.length;
    found = lower.indexOf(term, cursor);
  }
  result.push(text.slice(cursor));
  return <>{result}</>;
}
