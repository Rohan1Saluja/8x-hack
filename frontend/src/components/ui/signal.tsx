import type { CSSProperties } from "react";

/** Decorative signal geometry, never a visualization of actual audio or AI activity. */
export function SignalMotif({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`signal-motif ${compact ? "signal-compact" : ""}`}
      aria-hidden="true"
    >
      <div className="signal-halo" />
      <div className="signal-object">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} style={{ "--ring": index } as CSSProperties} />
        ))}
      </div>
      <div className="signal-shadow" />
    </div>
  );
}

export function SignalIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4" />
    </svg>
  );
}

export function WorkspaceSkeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div
      className={`workspace-skeleton ${detail ? "skeleton-detail" : ""}`}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">
        {detail ? "Opening your meeting…" : "Loading your meetings…"}
      </span>
      {Array.from({ length: detail ? 2 : 3 }, (_, index) => (
        <div className="skeleton-row" key={index} aria-hidden="true">
          <span className="skeleton-block" />
          <div>
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}
