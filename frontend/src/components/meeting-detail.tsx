"use client";

import { Button } from "@/components/ui/button";

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
      <span className="inline-flex flex-wrap gap-[5px]">
        {ids.map((sourceId) => {
          const segment = evidence?.segments.find((s) => s.id === sourceId);
          return segment ? (
            <button
              className="inline-flex cursor-pointer touch-manipulation items-center justify-center rounded border-0 bg-[#eeeafa] px-[7px] py-[3px] text-[10px] font-semibold text-purple focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] enabled:hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-48"
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
    <li className="pb-3" key={key}>
      <p className="mb-[3px] text-[13px]">{item.text}</p>
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
      <div className="px-7 py-[58px] text-center text-muted">
        <h3 className="mb-2 text-base font-semibold text-ink">
          Meeting deleted
        </h3>
        <p className="m-auto max-w-[320px] text-xs">
          Select another meeting from the library.
        </p>
      </div>
    );
  return (
    <div className="p-[22px]">
      <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
        {meeting.meeting_url}
      </p>
      <div className="my-5 flex flex-wrap gap-3.5 text-[10px] text-muted">
        <span>
          Capture{" "}
          <strong className="block text-xs font-semibold text-ink">
            {meeting.capture_state.replaceAll("_", " ")}
          </strong>
        </span>
        <span>
          Transcript{" "}
          <strong className="block text-xs font-semibold text-ink">
            {meeting.transcription_state}
          </strong>
        </span>
        <span>
          Summary{" "}
          <strong className="block text-xs font-semibold text-ink">
            {meeting.summary_state}
          </strong>
        </span>
      </div>
      <div className="my-[15px] flex flex-wrap gap-2">
        <Button size="compact" disabled>
          Send notetaker
        </Button>
        <Button variant="secondary" size="compact" disabled>
          Stop bot
        </Button>
        <Button
          variant="secondary"
          size="compact"
          disabled={!!busy}
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          Refresh details
        </Button>
      </div>
      <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
        Capture is pending free account verification. Before recording, notify
        all participants and admit the clearly named notetaker.
      </p>
      {error && (
        <p
          className="mb-3 rounded-[7px] border border-[#f3c7c7] bg-[#fff1f1] p-3 text-[#8f2525]"
          role="alert"
        >
          {error}
        </p>
      )}
      {meeting.failure_code && (
        <p className="mb-3 rounded-[7px] border border-[#f3c7c7] bg-[#fff1f1] p-3 text-[#8f2525]">
          Last processing failure: {meeting.failure_code.replaceAll("_", " ")}.
          Completed stages are saved.
        </p>
      )}
      {meeting.recording_ready && (
        <div>
          {playback ? (
            <video
              className="block max-h-[300px] w-full rounded-lg bg-[#191822]"
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
            <Button
              variant="secondary"
              onClick={() => void authorizePlayback()}
            >
              Load private recording
            </Button>
          )}
          {playback && (
            <Button variant="text" onClick={() => void authorizePlayback()}>
              Refresh playback link
            </Button>
          )}
        </div>
      )}
      <div className="my-[15px] flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="compact"
          disabled={
            !!busy ||
            !meeting.recording_ready ||
            meeting.transcription_state === "ready" ||
            (running && !evidence?.jobs.some((j) => j.interrupted))
          }
          onClick={() => void action("transcribe")}
        >
          {busy === "transcribe" ? "Transcribing…" : "Generate transcript"}
        </Button>
        <Button
          variant="secondary"
          size="compact"
          disabled={
            !!busy ||
            meeting.transcription_state !== "ready" ||
            meeting.summary_state === "ready" ||
            (running && !evidence?.jobs.some((j) => j.interrupted))
          }
          onClick={() => void action("summarize")}
        >
          {busy === "summarize" ? "Summarizing…" : "Generate summary"}
        </Button>
        {evidence?.jobs.some((j) => j.interrupted) && (
          <Button
            variant="secondary"
            size="compact"
            disabled={!!busy}
            onClick={() => void action("recover")}
          >
            Recover interrupted work
          </Button>
        )}
      </div>
      {evidence?.jobs.length ? (
        <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
          {evidence.jobs
            .filter((j) => j.stage !== "question")
            .map((j) => `${j.stage}: ${j.attempts}/3 attempts`)
            .join(" · ")}
        </p>
      ) : null}
      <div
        className="my-[25px] flex gap-5 border-b border-line"
        role="tablist"
        aria-label="Meeting content"
      >
        {(["summary", "transcript", "questions"] as const).map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            key={t}
            className={`inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-none border-x-0 border-t-0 border-b-2 bg-transparent px-0 py-2.5 text-xs font-semibold capitalize focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] enabled:hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-48 ${tab === t ? "border-purple text-purple" : "border-transparent text-muted"}`}
            onClick={() => setTab(t)}
          >
            {t === "questions" ? "Ask meeting" : t}
          </button>
        ))}
      </div>
      {!evidence ? (
        <p className="mb-3" role="status">
          Loading meeting evidence…
        </p>
      ) : (
        <div role="tabpanel" id={`panel-${tab}`}>
          {tab === "summary" &&
            (evidence.summary ? (
              <>
                <h3 className="mb-2 text-base font-semibold">Overview</h3>
                <ul className="m-0 mb-6 list-none p-0">
                  {fact(evidence.summary.overview, "overview")}
                </ul>
                <h3 className="mb-2 text-base font-semibold">Topics</h3>
                <ul className="m-0 mb-6 list-none p-0">
                  {evidence.summary.topics.map(fact)}
                </ul>
                <h3 className="mb-2 text-base font-semibold">Decisions</h3>
                {evidence.summary.decisions.length ? (
                  <ul className="m-0 mb-6 list-none p-0">
                    {evidence.summary.decisions.map(fact)}
                  </ul>
                ) : (
                  <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
                    No explicit decisions found.
                  </p>
                )}
                <h3 className="mb-2 text-base font-semibold">Action items</h3>
                {evidence.actions.length ? (
                  evidence.actions.map((item) => (
                    <form
                      className="mb-3 rounded-lg border border-line p-[15px]"
                      key={item.id}
                      onSubmit={(e) => void saveAction(item, e)}
                    >
                      <label className="block text-[11px] text-muted">
                        Task
                        <input
                          className="w-full touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white p-[7px] text-xs text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
                          name="text"
                          required
                          maxLength={1000}
                          defaultValue={item.text}
                        />
                      </label>
                      <div className="my-2.5 grid grid-cols-2 gap-2.5">
                        <label className="block text-[11px] text-muted">
                          Owner
                          <input
                            className="w-full touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white p-[7px] text-xs text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
                            name="owner"
                            maxLength={160}
                            defaultValue={item.owner || ""}
                            placeholder="Not stated"
                          />
                        </label>
                        <label className="block text-[11px] text-muted">
                          Deadline as stated
                          <input
                            className="w-full touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white p-[7px] text-xs text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
                            name="due_date"
                            maxLength={160}
                            defaultValue={item.due_date || ""}
                            placeholder="Not stated"
                          />
                        </label>
                      </div>
                      <label className="mb-2 flex items-center gap-2 text-[11px] text-muted">
                        <input
                          className="w-auto touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white p-[7px] text-xs text-ink accent-purple placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
                          type="checkbox"
                          name="completed"
                          defaultChecked={item.completed}
                        />
                        Completed
                      </label>
                      {sources(item.source_segment_ids)}
                      <div className="mt-2.5">
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={!!busy}
                          type="submit"
                        >
                          Save action
                        </Button>
                      </div>
                    </form>
                  ))
                ) : (
                  <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
                    No explicit action items found.
                  </p>
                )}
              </>
            ) : (
              <p className="mb-3 px-7 py-[58px] text-center text-muted">
                Your summary will appear after a recording is transcribed and
                summarized.
              </p>
            ))}
          {tab === "transcript" &&
            (evidence.segments.length ? (
              <ol className="m-0 list-none p-0">
                {evidence.segments.map((s) => (
                  <li className="mb-4 flex items-start gap-3" key={s.id}>
                    <button
                      className="mt-[3px] inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded border-0 bg-[#eeeafa] px-[7px] py-[3px] text-[10px] font-semibold text-purple focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] enabled:hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-48"
                      onClick={() => seek(s.id)}
                      aria-label={`Play transcript at ${time(s.start_seconds)}`}
                    >
                      {time(s.start_seconds)}
                    </button>
                    <div>
                      {s.speaker && <strong>{s.speaker}</strong>}
                      <p className="m-0 text-xs">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mb-3 px-7 py-[58px] text-center text-muted">
                No transcript yet. Speaker identities will remain blank unless
                verified.
              </p>
            ))}
          {tab === "questions" && (
            <>
              <p className="mb-3 text-xs [overflow-wrap:anywhere] text-muted">
                Answers use this meeting only. Sources open the original
                recording moment.
              </p>
              {evidence.questions.map((q) => (
                <article
                  className="mb-5 border-b border-line py-[15px]"
                  key={q.id}
                >
                  <h3 className="mb-2 text-[13px] font-semibold">
                    {q.question}
                  </h3>
                  <p className="mb-3 text-xs">{q.answer.answer}</p>
                  {sources(q.answer.source_segment_ids)}
                </article>
              ))}
              <form onSubmit={(e) => void ask(e)}>
                <label className="block text-[11px] text-muted">
                  Ask about this meeting
                  <textarea
                    className="mt-2 mb-3 block min-h-[90px] w-full touch-manipulation resize-y rounded-[7px] border border-[#d9dbe5] bg-white px-3 py-[11px] text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
                    name="question"
                    required
                    maxLength={2000}
                    onChange={() => {
                      questionId.current = null;
                    }}
                    placeholder="What did we decide, and who is doing what?"
                  />
                </label>
                <Button
                  disabled={
                    !!busy || running || meeting.transcription_state !== "ready"
                  }
                >
                  {busy === "question" ? "Finding evidence…" : "Ask meeting"}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      <div className="mt-[30px] border-t border-line pt-[15px] text-xs">
        {confirmDelete ? (
          <>
            <p className="mb-3">
              Delete this meeting, its recording, transcript, and notes?
            </p>
            <Button
              className="mr-2 text-[11px]"
              variant="danger"
              disabled={!!busy}
              onClick={() => void remove()}
            >
              Delete meeting
            </Button>
            <Button
              className="mr-2 text-[11px]"
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            className="mr-2 text-[11px]"
            variant="text"
            onClick={() => setConfirmDelete(true)}
          >
            Delete meeting…
          </Button>
        )}
      </div>
    </div>
  );
}
