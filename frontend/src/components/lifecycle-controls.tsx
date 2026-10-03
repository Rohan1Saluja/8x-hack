"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { Button } from "@/components/ui/button";

export const lifecycleLabels: Record<Meeting["lifecycle_state"], string> = {
  not_started: "Not started",
  joining: "Joining",
  awaiting_admission: "Awaiting admission",
  recording: "Recording",
  recorded: "Recording saved",
  transcribing: "Transcribing",
  transcribed: "Transcript ready",
  summarizing: "Summarizing",
  ready: "Ready",
  failed: "Failed",
};
const stages = [
  "joining",
  "awaiting_admission",
  "recording",
  "transcribing",
  "summarizing",
  "ready",
] as const;
const automatic = new Set(["joining", "transcribing", "summarizing"]);

export function StatusBadge({ meeting }: { meeting: Meeting }) {
  return (
    <span
      className={`status-badge ${meeting.lifecycle_state === "failed" ? "status-failed" : ""}`}
    >
      <span
        className={
          meeting.lifecycle_state === "recording"
            ? "recording-dot"
            : "status-dot"
        }
      />
      {meeting.capture_mode === "demo" ? "Demo · " : ""}
      {lifecycleLabels[meeting.lifecycle_state]}
    </span>
  );
}

export function LifecycleControls({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: (meeting: Meeting) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (
      meeting.capture_mode !== "demo" ||
      !automatic.has(meeting.lifecycle_state)
    )
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const next = await api<Meeting>(
          `meetings/${meeting.id}/advance`,
          "POST",
          { expected_version: meeting.lifecycle_version },
        );
        if (active) {
          onChangeRef.current(next);
          if (next.lifecycle_version === meeting.lifecycle_version)
            timer = setTimeout(() => void tick(), 2500);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Progress could not be refreshed.",
          );
      }
    }
    timer = setTimeout(() => void tick(), 2500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    meeting.id,
    meeting.capture_mode,
    meeting.lifecycle_state,
    meeting.lifecycle_version,
  ]);

  async function act(action: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(action);
    setError("");
    try {
      const next = await api<Meeting>(
        `meetings/${meeting.id}/${action}`,
        "POST",
        { expected_version: meeting.lifecycle_version, consent },
      );
      onChange(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update the notetaker.",
      );
    } finally {
      locked.current = false;
      setBusy("");
    }
  }
  const canStart = meeting.lifecycle_state === "not_started";
  const canRetry =
    meeting.capture_mode === "demo" && meeting.lifecycle_state === "failed";
  if (!canStart && meeting.capture_mode !== "demo") return null;
  const current = stages.findIndex((s) => s === meeting.lifecycle_state);
  return (
    <section className="lifecycle-panel" aria-label="Notetaker lifecycle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          SIMULATED CAPTURE · {lifecycleLabels[meeting.lifecycle_state]}
        </p>
        <span className="text-xs text-muted">No live bot or media capture</span>
      </div>

      {meeting.capture_mode === "demo" && (
        <ol className="lifecycle-steps" aria-label="Capture progress">
          {stages.map((s, i) => (
            <li
              key={s}
              aria-current={s === meeting.lifecycle_state ? "step" : undefined}
              className={i <= current ? "step-complete" : ""}
            >
              <span>{i < current ? "✓" : i + 1}</span>
              {lifecycleLabels[s]}
            </li>
          ))}
        </ol>
      )}
      {(canStart || canRetry) && (
        <label className="mt-3 flex items-start gap-3 text-xs leading-relaxed text-muted">
          <input
            className="mt-0.5 accent-cyan-400"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I understand this is a simulation. Before any real recording, I will
          notify participants, obtain their consent, and respect host admission.
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {(canStart || canRetry) && (
          <Button
            disabled={!consent || !!busy}
            onClick={() => void act(canRetry ? "retry-capture" : "send")}
          >
            {busy
              ? "Sending…"
              : canRetry
                ? "Retry demo notetaker"
                : "Send notetaker"}
          </Button>
        )}
        {meeting.lifecycle_state === "awaiting_admission" && (
          <Button disabled={!!busy} onClick={() => void act("admit")}>
            Admit demo notetaker
          </Button>
        )}
        {["joining", "awaiting_admission", "recording"].includes(
          meeting.lifecycle_state,
        ) && (
          <Button
            variant="secondary"
            disabled={!!busy}
            onClick={() => void act("stop")}
          >
            {meeting.lifecycle_state === "recording"
              ? "Stop demo recording"
              : "Cancel demo capture"}
          </Button>
        )}
        <p className="text-xs text-muted" role="status">
          {meeting.lifecycle_state === "joining"
            ? "Connecting to the simulated waiting room…"
            : meeting.lifecycle_state === "awaiting_admission"
              ? "Waiting for your demo admission. Nothing is recorded."
              : meeting.lifecycle_state === "recording"
                ? "Simulated recording is active. Stop when you are ready."
                : ["transcribing", "summarizing"].includes(
                      meeting.lifecycle_state,
                    )
                  ? "Previewing processing stages. No provider calls are made."
                  : meeting.lifecycle_state === "ready"
                    ? "Demo complete. Add a real recording in a separate meeting for a transcript and notes."
                    : meeting.lifecycle_state === "failed"
                      ? "Demo capture was cancelled. You can retry safely."
                      : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className="error-notice mt-3">
          {error}{" "}
          <Button
            variant="text"
            onClick={() =>
              void api<Meeting>(`meetings/${meeting.id}`)
                .then(onChange)
                .then(() => setError(""))
                .catch(() => setError("Still unable to refresh. Try again."))
            }
          >
            Refresh progress
          </Button>
        </p>
      )}
    </section>
  );
}
