import { SignalIcon } from "@/components/ui/signal";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  EvidenceFact,
  SourceLinks,
  timestamp,
} from "@/components/meeting-evidence";
import type {
  ActionItem,
  Meeting,
  MeetingEvidence,
  Segment,
} from "@/lib/types";

export function IntelligenceRail({
  evidence,
  busy,
  onSave,
  onOpen,
  selectedSegment,
  meeting,
  onRemoveHighlight,
  onCopyLink,
}: {
  evidence: MeetingEvidence | null;
  busy: string;
  onSave: (
    item: ActionItem,
    event: FormEvent<HTMLFormElement>,
  ) => Promise<void>;
  onOpen: (id: string) => void;
  selectedSegment?: Segment;
  meeting: Meeting;
  onRemoveHighlight: (id: string) => Promise<void>;
  onCopyLink: (segmentId?: string) => Promise<void>;
}) {
  return (
    <aside className="intelligence-rail" aria-label="Meeting intelligence">
      <div className="intelligence-heading">
        <span className="intelligence-mark" aria-hidden="true">
          <SignalIcon />
        </span>
        <div>
          <h2>Intelligence</h2>
          <p>From conversation to next steps</p>
        </div>
      </div>
      <section className="rail-section">
        <div className="section-heading">
          <h3>Decisions</h3>
          <span>{evidence?.summary?.decisions.length ?? "—"}</span>
        </div>
        {!evidence ? (
          <p className="rail-empty" role="status">
            Loading decisions…
          </p>
        ) : evidence.summary?.decisions.length ? (
          <ul className="decision-list">
            {evidence.summary.decisions.map((item, index) => (
              <li key={index}>
                <EvidenceFact
                  item={item}
                  segments={evidence.segments}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rail-empty">
            {evidence.summary
              ? "No explicit decisions found in the summary."
              : "Decisions will appear after a real transcript is summarized."}
          </p>
        )}
      </section>
      <section className="rail-section">
        <div className="section-heading">
          <h3>Action items</h3>
          <span>
            {evidence
              ? `${evidence.actions.filter((a) => a.completed).length}/${evidence.actions.length}`
              : "—"}
          </span>
        </div>
        {!evidence ? (
          <p className="rail-empty" role="status">
            Loading action items…
          </p>
        ) : evidence.actions.length ? (
          evidence.actions.map((item) => (
            <details className="action-disclosure" key={item.id}>
              <summary>
                <span
                  className={`task-check ${item.completed ? "task-complete" : ""}`}
                  aria-hidden="true"
                >
                  {item.completed ? "✓" : ""}
                </span>
                <span>
                  <span
                    className={item.completed ? "line-through text-muted" : ""}
                  >
                    {item.text}
                  </span>
                  <small>
                    {item.completed ? "Completed" : "Open"} ·{" "}
                    {item.owner || "Owner not stated"}
                  </small>
                </span>
                <span className="disclosure-chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <form
                className="action-editor"
                onSubmit={(event) => void onSave(item, event)}
              >
                <label className="field-label">
                  Task
                  <textarea
                    className="field"
                    name="text"
                    required
                    maxLength={1000}
                    defaultValue={item.text}
                  />
                </label>
                <label className="field-label">
                  Owner
                  <input
                    className="field"
                    name="owner"
                    maxLength={160}
                    defaultValue={item.owner || ""}
                    placeholder="Not stated"
                  />
                </label>
                <label className="field-label">
                  Deadline (stated or manually entered)
                  <input
                    className="field"
                    name="due_date"
                    maxLength={160}
                    defaultValue={item.due_date || ""}
                    placeholder="Not stated"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    className="accent-cyan-400"
                    type="checkbox"
                    name="completed"
                    defaultChecked={item.completed}
                  />
                  Completed
                </label>
                <SourceLinks
                  ids={item.source_segment_ids}
                  segments={evidence.segments}
                  onOpen={onOpen}
                />
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!!busy}
                  type="submit"
                >
                  {busy === item.id ? "Saving…" : "Save action"}
                </Button>
              </form>
            </details>
          ))
        ) : (
          <p className="rail-empty">
            {evidence.summary
              ? "No explicit action items found."
              : "Evidence-backed tasks will appear after summarization. Owners and deadlines remain unknown unless stated."}
          </p>
        )}
      </section>
      <section
        className="rail-section source-preview"
        aria-label="Selected evidence"
      >
        <div className="section-heading">
          <h3>Evidence</h3>
          <span>{evidence?.segments.length ?? "—"} segments</span>
        </div>
        {selectedSegment ? (
          <>
            <p className="evidence-quote">“{selectedSegment.text}”</p>
            <button
              className="source-chip mt-3"
              onClick={() => onOpen(selectedSegment.id)}
            >
              ↗ {timestamp(selectedSegment.start_seconds)} · Open source
            </button>
          </>
        ) : (
          <p className="rail-empty">
            Select a timestamp in the notes or transcript to inspect the source
            here.
          </p>
        )}
      </section>
      <section className="rail-section" aria-label="Saved highlights">
        <div className="section-heading">
          <h3>Highlights</h3>
          <span>{evidence?.highlights?.length ?? 0}</span>
        </div>
        {evidence?.highlights?.length ? (
          evidence.highlights.map((h) => (
            <article className="highlight-item" key={h.id}>
              <button
                className="source-chip"
                onClick={() => onOpen(h.segment_id)}
              >
                ◆ {timestamp(h.start_seconds)} · Open moment
              </button>
              <p>{h.text}</p>
              <div className="highlight-actions">
                <button
                  className="text-link"
                  onClick={() => void onCopyLink(h.segment_id)}
                >
                  Copy moment link ↗
                </button>
                <button
                  className="text-link"
                  disabled={!!busy}
                  aria-label={`Remove highlight at ${timestamp(h.start_seconds)}`}
                  onClick={() => void onRemoveHighlight(h.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="rail-empty">
            Keep a moment close. Open Transcript and choose Save highlight.
          </p>
        )}
      </section>
      <section className="rail-section">
        <div className="section-heading">
          <h3>Workspace link</h3>
          <span>OWNER ONLY</span>
        </div>
        <p className="rail-empty">
          A shortcut back to this meeting. The link does not grant anyone access
          or expose the recording.
        </p>
        <Button
          variant="secondary"
          size="small"
          className="mt-3"
          onClick={() => void onCopyLink()}
        >
          Copy meeting link ↗
        </Button>
      </section>
      <details className="meeting-source">
        <summary>Meeting source</summary>
        <p>
          {meeting.meeting_url ||
            (meeting.capture_mode === "demo"
              ? "Demo meeting · no external link"
              : "Imported recording · no external link")}
        </p>
        <p>
          Transcript: {meeting.transcription_state}
          <br />
          Summary: {meeting.summary_state}
        </p>
      </details>
    </aside>
  );
}
