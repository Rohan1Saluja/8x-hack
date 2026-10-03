import type { ReactNode } from "react";
import type { Evidence, Segment } from "@/lib/types";

export function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function SourceLinks({
  ids,
  segments,
  onOpen,
}: {
  ids: string[];
  segments: Segment[];
  onOpen: (id: string) => void;
}) {
  return (
    <span className="source-links">
      {Array.from(new Set(ids)).map((id) => {
        const segment = segments.find((s) => s.id === id);
        return segment ? (
          <button
            type="button"
            className="source-chip"
            key={id}
            onClick={() => onOpen(id)}
            aria-label={`Open evidence at ${timestamp(segment.start_seconds)}`}
          >
            <span aria-hidden="true">↗</span> {timestamp(segment.start_seconds)}
          </button>
        ) : null;
      })}
    </span>
  );
}

export function EvidenceFact({
  item,
  segments,
  onOpen,
}: {
  item: Evidence;
  segments: Segment[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="evidence-fact">
      <p>{item.text}</p>
      <SourceLinks
        ids={item.source_segment_ids}
        segments={segments}
        onOpen={onOpen}
      />
    </div>
  );
}

export function EvidenceEmpty({
  title,
  children,
  processing = false,
}: {
  title: string;
  children: ReactNode;
  processing?: boolean;
}) {
  return (
    <div
      className={`evidence-empty ${processing ? "is-processing" : ""}`}
      role="status"
    >
      <span className="intelligence-mark" aria-hidden="true">
        ◇
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
