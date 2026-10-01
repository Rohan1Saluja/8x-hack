"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "@/lib/api";
import type {
  ActionItem,
  Evidence,
  Meeting,
  MeetingEvidence,
} from "@/lib/types";

function time(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

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
  const [playback, setPlayback] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const questionId = useRef<string | null>(null);
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
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      void refresh().catch(() =>
        setError("Progress refresh failed. Try Refresh details."),
      );
    }, 10000);
    return () => clearInterval(interval);
  }, [running, refresh]);
  async function action(stage: string) {
    if (busy) return;
    setBusy(stage);
    setError("");
    try {
      await api(`meetings/${id}/${stage}`, "POST");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      try {
        await refresh();
        await onChanged();
      } catch {
        setError("Unable to refresh saved progress. Try again.");
      }
      setBusy("");
    }
  }
  async function authorizePlayback(at?: number) {
    setError("");
    try {
      pendingSeek.current = at ?? player.current?.currentTime ?? 0;
      const result = await api<{ url: string }>(`meetings/${id}/playback`);
      setPlayback(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback unavailable.");
    }
  }
  function seek(segmentId: string) {
    const segment = evidence?.segments.find((s) => s.id === segmentId);
    if (!segment) return;
    if (player.current && playback) {
      player.current.currentTime = segment.start_seconds;
      void player.current.play().catch(() => {});
    } else {
      void authorizePlayback(segment.start_seconds);
    }
  }
  function sources(ids: string[]) {
    return (
      <span className="sources">
        {ids.map((sourceId) => {
          const segment = evidence?.segments.find((s) => s.id === sourceId);
          return segment ? (
            <button
              type="button"
              key={sourceId}
              onClick={() => seek(sourceId)}
              aria-label={`Play source at ${time(segment.start_seconds)}`}
            >
              {time(segment.start_seconds)}
            </button>
          ) : null;
        })}
      </span>
    );
  }
  const fact = (item: Evidence, key: number | string) => (
    <li key={key}>
      <p>{item.text}</p>
      {sources(item.source_segment_ids)}
    </li>
  );
  async function saveAction(
    item: ActionItem,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (busy) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action update failed.");
    } finally {
      setBusy("");
    }
  }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
      setBusy("");
    }
  }
  async function remove() {
    setBusy("delete");
    setError("");
    try {
      await api(`meetings/${id}`, "DELETE");
      setDeleted(true);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete meeting.");
    } finally {
      setBusy("");
    }
  }
  if (deleted)
    return (
      <div className="empty">
        <h3>Meeting deleted</h3>
        <p>Select another meeting from the library.</p>
      </div>
    );
  return (
    <div className="detail-content">
      <p className="fine">{meeting.meeting_url}</p>
      <div className="stage-list">
        <span>
          Capture <strong>{meeting.capture_state.replaceAll("_", " ")}</strong>
        </span>
        <span>
          Transcript <strong>{meeting.transcription_state}</strong>
        </span>
        <span>
          Summary <strong>{meeting.summary_state}</strong>
        </span>
      </div>
      <div className="toolbar">
        <button disabled>Send notetaker</button>
        <button className="secondary" disabled>
          Stop bot
        </button>
        <button
          className="secondary"
          disabled={!!busy}
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          Refresh details
        </button>
      </div>
      <p className="fine">
        Capture is pending free account verification. Before recording, notify
        all participants and admit the clearly named notetaker.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {meeting.failure_code && (
        <p className="error">
          Last processing failure: {meeting.failure_code.replaceAll("_", " ")}.
          Completed stages are saved.
        </p>
      )}
      {meeting.recording_ready && (
        <div className="recording">
          {playback ? (
            <video
              ref={player}
              src={playback}
              controls
              preload="metadata"
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
            <button
              className="secondary"
              onClick={() => void authorizePlayback()}
            >
              Load private recording
            </button>
          )}
          {playback && (
            <button
              className="text-button"
              onClick={() => void authorizePlayback()}
            >
              Refresh playback link
            </button>
          )}
        </div>
      )}
      <div className="toolbar">
        <button
          className="secondary"
          disabled={
            !!busy ||
            !meeting.recording_ready ||
            meeting.transcription_state === "ready" ||
            (running && !evidence?.jobs.some((j) => j.interrupted))
          }
          onClick={() => void action("transcribe")}
        >
          {busy === "transcribe" ? "Transcribing…" : "Generate transcript"}
        </button>
        <button
          className="secondary"
          disabled={
            !!busy ||
            meeting.transcription_state !== "ready" ||
            meeting.summary_state === "ready" ||
            (running && !evidence?.jobs.some((j) => j.interrupted))
          }
          onClick={() => void action("summarize")}
        >
          {busy === "summarize" ? "Summarizing…" : "Generate summary"}
        </button>
        {evidence?.jobs.some((j) => j.interrupted) && (
          <button
            className="secondary"
            disabled={!!busy}
            onClick={() => void action("recover")}
          >
            Recover interrupted work
          </button>
        )}
      </div>
      {evidence?.jobs.length ? (
        <p className="fine">
          {evidence.jobs
            .filter((j) => j.stage !== "question")
            .map((j) => `${j.stage}: ${j.attempts}/3 attempts`)
            .join(" · ")}
        </p>
      ) : null}
      <div className="tabs" role="tablist" aria-label="Meeting content">
        {(["summary", "transcript", "questions"] as const).map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "questions" ? "Ask meeting" : t}
          </button>
        ))}
      </div>
      {!evidence ? (
        <p role="status">Loading meeting evidence…</p>
      ) : (
        <div role="tabpanel" id={`panel-${tab}`}>
          {tab === "summary" &&
            (evidence.summary ? (
              <>
                <h3>Overview</h3>
                <ul className="facts">
                  {fact(evidence.summary.overview, "overview")}
                </ul>
                <h3>Topics</h3>
                <ul className="facts">{evidence.summary.topics.map(fact)}</ul>
                <h3>Decisions</h3>
                {evidence.summary.decisions.length ? (
                  <ul className="facts">
                    {evidence.summary.decisions.map(fact)}
                  </ul>
                ) : (
                  <p className="fine">No explicit decisions found.</p>
                )}
                <h3>Action items</h3>
                {evidence.actions.length ? (
                  evidence.actions.map((item) => (
                    <form
                      className="action-form"
                      key={item.id}
                      onSubmit={(e) => void saveAction(item, e)}
                    >
                      <label>
                        Task
                        <input
                          name="text"
                          required
                          maxLength={1000}
                          defaultValue={item.text}
                        />
                      </label>
                      <div className="action-meta">
                        <label>
                          Owner
                          <input
                            name="owner"
                            maxLength={160}
                            defaultValue={item.owner || ""}
                            placeholder="Not stated"
                          />
                        </label>
                        <label>
                          Deadline as stated
                          <input
                            name="due_date"
                            maxLength={160}
                            defaultValue={item.due_date || ""}
                            placeholder="Not stated"
                          />
                        </label>
                      </div>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          name="completed"
                          defaultChecked={item.completed}
                        />
                        Completed
                      </label>
                      {sources(item.source_segment_ids)}
                      <button
                        className="secondary"
                        disabled={!!busy}
                        type="submit"
                      >
                        Save action
                      </button>
                    </form>
                  ))
                ) : (
                  <p className="fine">No explicit action items found.</p>
                )}
              </>
            ) : (
              <p className="empty">
                Your summary will appear after a recording is transcribed and
                summarized.
              </p>
            ))}
          {tab === "transcript" &&
            (evidence.segments.length ? (
              <ol className="transcript">
                {evidence.segments.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => seek(s.id)}
                      aria-label={`Play transcript at ${time(s.start_seconds)}`}
                    >
                      {time(s.start_seconds)}
                    </button>
                    <div>
                      {s.speaker && <strong>{s.speaker}</strong>}
                      <p>{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">
                No transcript yet. Speaker identities will remain blank unless
                verified.
              </p>
            ))}
          {tab === "questions" && (
            <>
              <p className="fine">
                Answers use this meeting only. Sources open the original
                recording moment.
              </p>
              {evidence.questions.map((q) => (
                <article className="answer" key={q.id}>
                  <h3>{q.question}</h3>
                  <p>{q.answer.answer}</p>
                  {sources(q.answer.source_segment_ids)}
                </article>
              ))}
              <form onSubmit={(e) => void ask(e)} className="question-form">
                <label>
                  Ask about this meeting
                  <textarea
                    name="question"
                    required
                    maxLength={2000}
                    onChange={() => {
                      questionId.current = null;
                    }}
                    placeholder="What did we decide, and who is doing what?"
                  />
                </label>
                <button
                  disabled={
                    !!busy || running || meeting.transcription_state !== "ready"
                  }
                >
                  {busy === "question" ? "Finding evidence…" : "Ask meeting"}
                </button>
              </form>
            </>
          )}
        </div>
      )}
      <div className="delete-area">
        {confirmDelete ? (
          <>
            <p>Delete this meeting, its recording, transcript, and notes?</p>
            <button
              className="danger"
              disabled={!!busy}
              onClick={() => void remove()}
            >
              Delete meeting
            </button>
            <button
              className="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="text-button"
            onClick={() => setConfirmDelete(true)}
          >
            Delete meeting…
          </button>
        )}
      </div>
    </div>
  );
}
