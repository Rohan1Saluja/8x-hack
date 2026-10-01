"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";

export function Workspace({ name }: { name: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    setError("");
    try {
      setMeetings(await api<Meeting[]>("meetings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load meetings.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const meeting = await api<Meeting>("meetings", "POST", {
        title: data.get("title"),
        meeting_url: data.get("url"),
        request_id: requestId.current,
      });
      requestId.current = null;
      form.reset();
      setSelected(meeting);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save meeting.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/workspace">
          8x<span>meeting workspace</span>
        </a>
        <p className="eyebrow">WORKSPACE</p>
        <div className="nav-active">
          ▤ <span>My meetings</span>
          <span className="count">{meetings.length}</span>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">{name.slice(0, 1)}</span>
          <span>{name}</span>
          <a href="/auth/logout">Sign out</a>
        </div>
      </aside>
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">YOUR CONVERSATIONS, REMEMBERED</p>
            <h1>My meetings</h1>
          </div>
          <button className="secondary" onClick={() => void refresh()}>
            Refresh
          </button>
        </header>
        <div className="notice">
          <strong>Capture setup is pending</strong>
          <p>
            Verify Recall.ai’s free allowance and an authorized webhook endpoint
            before sending a notetaker. You can save meeting links now.
          </p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          className="create-form"
          onSubmit={create}
          onChange={() => {
            requestId.current = null;
          }}
        >
          <label>
            Meeting title
            <input
              name="title"
              required
              maxLength={160}
              placeholder="Weekly product sync"
            />
          </label>
          <label>
            Google Meet link
            <input
              name="url"
              type="url"
              required
              pattern="https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}"
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save meeting"}
          </button>
        </form>
        <div className="meeting-grid">
          <section className="panel library">
            <div className="panel-heading">
              <h2>Meeting library</h2>
              <span>Private to you</span>
            </div>
            {loading ? (
              <p className="empty" role="status">
                Loading your meetings…
              </p>
            ) : meetings.length ? (
              meetings.map((m) => (
                <button
                  className={`meeting-row ${selected?.id === m.id ? "selected" : ""}`}
                  key={m.id}
                  onClick={() => setSelected(m)}
                >
                  <span className="meeting-icon">▹</span>
                  <span>
                    <strong>{m.title}</strong>
                    <small>
                      {new Date(m.created_at).toLocaleDateString()} · Google
                      Meet
                    </small>
                  </span>
                  <span className="badge">
                    {m.capture_state.replaceAll("_", " ")}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty">
                <span className="empty-icon">▤</span>
                <h3>Your next conversation starts here</h3>
                <p>
                  Save a Google Meet link to begin. Your recordings and notes
                  will appear in this library.
                </p>
              </div>
            )}
          </section>
          <section className="panel detail">
            <div className="panel-heading">
              <h2>{selected?.title || "Meeting details"}</h2>
            </div>
            {selected ? (
              <div className="detail-content">
                <p className="fine">{selected.meeting_url}</p>
                <p>Capture: {selected.capture_state.replaceAll("_", " ")}</p>
                <p>Transcript: {selected.transcription_state}</p>
                <p>Summary: {selected.summary_state}</p>
                <button disabled>Send notetaker</button>
                <p className="fine">
                  Free bot access must be verified first. The notetaker will
                  identify itself and require host admission.
                </p>
              </div>
            ) : (
              <div className="empty">
                <h3>A little context goes a long way</h3>
                <p>
                  Select a meeting to review its recording, notes, and sources.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
