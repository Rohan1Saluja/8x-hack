"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MeetingDetail } from "@/components/meeting-detail";
import {
  SignalIcon,
  SignalMotif,
  WorkspaceSkeleton,
} from "@/components/ui/signal";
import { StatusBadge } from "@/components/lifecycle-controls";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";

function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Workspace({ name }: { name: string }) {
  const router = useRouter();
  const selectedId = useSearchParams().get("meeting");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const requestId = useRef<string | null>(null);
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    const rows = await api<Meeting[]>("meetings");
    setMeetings(rows);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected(null);
    void Promise.all([
      api<Meeting[]>("meetings"),
      selectedId
        ? api<Meeting>(`meetings/${selectedId}`)
        : Promise.resolve(null),
    ])
      .then(([rows, meeting]) => {
        if (active) {
          setMeetings(rows);
          setSelected(meeting);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load your meetings.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const meeting = await api<Meeting>("meetings", "POST", {
        title: data.get("title"),
        meeting_url: demo ? null : data.get("url"),
        demo,
        request_id: requestId.current,
      });
      requestId.current = null;
      setShowCreate(false);
      router.push(`/workspace?meeting=${meeting.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save meeting.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const visible = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "active"
          ? [
              "joining",
              "awaiting_admission",
              "recording",
              "transcribing",
              "summarizing",
            ].includes(m.lifecycle_state)
          : m.lifecycle_state === "ready")),
  );
  return (
    <div className="workspace-grid">
      <aside className="workspace-nav">
        <Link
          href="/workspace"
          className="brand"
          aria-label="8x meeting workspace home"
        >
          8x
          <SignalIcon className="brand-mark" />
        </Link>
        <p className="eyebrow mt-12 mb-3 max-md:hidden">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <Link href="/workspace" aria-current="page" className="nav-link">
            <SignalIcon /> My meetings{" "}
            <span className="ml-auto text-xs text-muted">
              {meetings.length}
            </span>
          </Link>
        </nav>
        <div className="nav-note max-md:hidden">
          <span className="eyebrow">BUILT AROUND EVIDENCE</span>
          <p>
            Keep the conversation.
            <br />
            Find the clarity.
          </p>
          <span className="nav-note-line" />
        </div>
        <div className="nav-footer">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-xs">{name}</p>
            <a
              href="/auth/logout"
              className="mt-1 block text-xs text-muted hover:text-cyan-400"
            >
              Sign out
            </a>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="workspace-topbar">
          <span>
            Workspace <span className="mx-2 opacity-40">/</span>{" "}
            <span className="text-ink">
              {selectedId ? "Meeting intelligence" : "My meetings"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="status-dot" /> Private to you
          </span>
        </div>
        <main className="workspace-main">
          <header
            className={`${selectedId ? "mb-1" : "mb-7"} flex flex-wrap items-center justify-between gap-4`}
          >
            <div>
              {selectedId && (
                <Link
                  href="/workspace"
                  className="mb-4 inline-block text-xs text-muted hover:text-cyan-400"
                >
                  ← My meetings
                </Link>
              )}
              {!selectedId && (
                <>
                  <p className="eyebrow mb-3">YOUR CONVERSATION LIBRARY</p>
                  <h1 className="library-title">
                    My meetings<span className="text-cyan-300">.</span>
                  </h1>
                  <p className="mt-2 text-sm text-muted">
                    A little less noise. A lot more clarity.
                  </p>
                </>
              )}
            </div>
            {!selectedId && (
              <Button
                aria-expanded={showCreate}
                aria-controls="create-meeting"
                onClick={() => {
                  setShowCreate((v) => !v);
                  setError("");
                }}
              >
                {showCreate ? "Close" : "+ New meeting"}
              </Button>
            )}
          </header>
          {error && (
            <div className="error-notice mb-5" role="alert">
              {error}{" "}
              <Button
                variant="text"
                onClick={() => {
                  if (selectedId) router.push("/workspace");
                  else
                    void refresh()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message));
                }}
              >
                {selectedId ? "Back to library" : "Try again"}
              </Button>
            </div>
          )}
          {selectedId ? (
            loading ? (
              <WorkspaceSkeleton detail />
            ) : (
              selected && (
                <MeetingDetail
                  key={selected.id}
                  initial={selected}
                  onChanged={refresh}
                />
              )
            )
          ) : (
            <>
              {!showCreate && (
                <section
                  className="library-intro"
                  aria-label="Bring a conversation into focus"
                >
                  <div className="relative z-1">
                    <span className="signal-label">
                      <SignalIcon /> CONVERSATION → CLARITY
                    </span>
                    <h2>
                      Good conversations deserve
                      <br className="max-sm:hidden" /> a clear next step.
                    </h2>
                    <p>
                      Recordings, decisions, and the evidence behind them.
                      <br className="max-sm:hidden" /> Together in one private
                      workspace.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-4">
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => {
                          setDemo(false);
                          setShowCreate(true);
                        }}
                      >
                        Add a meeting link <span aria-hidden="true">↗</span>
                      </Button>
                      <button
                        className="text-link"
                        onClick={() => {
                          setDemo(true);
                          setShowCreate(true);
                        }}
                      >
                        Explore demo <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                  <div className="library-motif">
                    <SignalMotif />
                    <span>SIGNAL / INTELLIGENCE</span>
                  </div>
                </section>
              )}
              {showCreate && (
                <section
                  id="create-meeting"
                  className="surface-card create-surface mb-7 p-5 sm:p-6"
                  aria-label="New meeting"
                >
                  <h2 className="text-lg font-semibold">
                    Bring a meeting into your workspace
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    Paste a Google Meet link, or explore the notetaker with a
                    demo meeting.
                  </p>
                  <form
                    className="mt-5 grid gap-4"
                    onSubmit={create}
                    onChange={() => {
                      requestId.current = null;
                    }}
                  >
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Meeting source"
                    >
                      <Button
                        type="button"
                        variant={demo ? "secondary" : "primary"}
                        aria-pressed={!demo}
                        onClick={() => {
                          setDemo(false);
                          requestId.current = null;
                        }}
                      >
                        Meeting link
                      </Button>
                      <Button
                        type="button"
                        variant={demo ? "primary" : "secondary"}
                        aria-pressed={demo}
                        onClick={() => {
                          setDemo(true);
                          requestId.current = null;
                        }}
                      >
                        Demo meeting
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="field-label">
                        Meeting title
                        <input
                          autoFocus
                          className="field"
                          name="title"
                          required
                          maxLength={160}
                          placeholder="Weekly product sync"
                        />
                      </label>
                      {!demo && (
                        <label className="field-label">
                          Google Meet link
                          <input
                            className="field"
                            type="url"
                            name="url"
                            required
                            pattern="https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}"
                            placeholder="https://meet.google.com/abc-defg-hij"
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="max-w-xl text-xs leading-relaxed text-muted">
                        This checkpoint uses simulated capture. No live meeting
                        is joined. You’ll confirm the notice before sending the
                        notetaker.
                      </p>
                      <Button disabled={busy} type="submit">
                        {busy ? "Creating…" : "Create meeting →"}
                      </Button>
                    </div>
                  </form>
                </section>
              )}
              <section aria-label="Meeting library">
                <div className="library-controls mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div
                    className="library-filters flex gap-1 rounded-lg p-1"
                    aria-label="Filter meetings"
                  >
                    {[
                      ["all", "All meetings"],
                      ["active", "In progress"],
                      ["ready", "Ready"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setFilter(value)}
                        aria-pressed={filter === value}
                        className={`filter-button ${filter === value ? "filter-active" : ""}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor="meeting-search">
                    Search meeting titles
                  </label>
                  <input
                    id="meeting-search"
                    className="field max-w-xs"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your meetings…"
                    type="search"
                  />
                </div>
                <div className="library-table overflow-hidden">
                  <div className="library-heading">
                    <span>MEETING</span>
                    <span>STATUS</span>
                    <span className="hidden lg:block">DURATION</span>
                    <span />
                  </div>
                  {loading ? (
                    <WorkspaceSkeleton />
                  ) : visible.length ? (
                    visible.map((m) => (
                      <Link
                        href={`/workspace?meeting=${m.id}`}
                        key={m.id}
                        className="meeting-row"
                      >
                        <span className="flex min-w-0 items-center gap-4">
                          <span className="meeting-icon" aria-hidden="true">
                            <SignalIcon />
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-sm font-medium">
                              {m.title}
                            </strong>
                            <span className="mt-1.5 block text-xs text-muted">
                              {date(m.created_at)} ·{" "}
                              {m.capture_mode === "demo"
                                ? "Demo meeting"
                                : m.meeting_url
                                  ? "Google Meet"
                                  : "Imported recording"}
                            </span>
                            <span className="mt-1.5 block text-[11px] text-muted">
                              {m.capture_mode === "demo"
                                ? "Simulated capture · no recording"
                                : m.recording_ready
                                  ? `Transcript: ${m.transcription_state} · Summary: ${m.summary_state}`
                                  : "Ready to send your demo notetaker"}
                            </span>
                          </span>
                        </span>
                        <StatusBadge meeting={m} />
                        <span className="hidden text-xs text-muted lg:block">
                          {m.duration_seconds === null
                            ? "—"
                            : `${Math.floor(m.duration_seconds / 60)}:${Math.floor(
                                m.duration_seconds % 60,
                              )
                                .toString()
                                .padStart(2, "0")}`}
                        </span>
                        <span className="row-arrow" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="empty-state">
                      <SignalMotif compact />
                      <h2 className="mt-5 text-lg font-semibold text-ink">
                        {meetings.length
                          ? "No matching meetings"
                          : "Make room for the conversation"}
                      </h2>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                        {meetings.length
                          ? "Try another title or change the status filter."
                          : "Start with a meeting link or a demo. Your recordings, transcripts and notes will live here."}
                      </p>
                      {!!meetings.length && (
                        <Button
                          variant="secondary"
                          size="compact"
                          className="mt-5"
                          onClick={() => {
                            setQuery("");
                            setFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                      {!meetings.length && (
                        <Button
                          className="mt-6"
                          onClick={() => setShowCreate(true)}
                        >
                          Create your first meeting
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <p className="mt-4 text-xs text-muted">
                  Showing {visible.length} of {meetings.length} recent meetings
                  · Only you can access this library.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
