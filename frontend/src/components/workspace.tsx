"use client";

import { Button } from "@/components/ui/button";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { MeetingDetail } from "@/components/meeting-detail";

type IntegrationStatus = {
  ai: {
    configured: boolean;
    budget: null | {
      verified: boolean;
      audio_seconds_remaining: number;
      text_requests_remaining: number;
      text_tokens_remaining: number;
    };
  };
};

export function Workspace({ name }: { name: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Meeting | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(
    null,
  );
  const requestId = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const [rows, status] = await Promise.all([
        api<Meeting[]>("meetings"),
        api<IntegrationStatus>("integrations"),
        api("me"),
      ]);
      setMeetings(rows);
      setIntegrations(status);
      setSelected((current) =>
        current ? rows.find((m) => m.id === current.id) || null : null,
      );
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
    <div className="grid min-h-screen grid-cols-[226px_minmax(0,1fr)] max-[1100px]:grid-cols-[190px_minmax(0,1fr)] max-[650px]:block">
      <aside className="sticky top-0 flex h-screen flex-col border-r border-line bg-white px-5 py-7 max-[650px]:static max-[650px]:h-auto max-[650px]:flex-row max-[650px]:items-center max-[650px]:gap-[18px] max-[650px]:border-r-0 max-[650px]:border-b max-[650px]:p-4">
        <a
          className="mb-[55px] flex touch-manipulation items-center gap-3 text-[32px] font-extrabold tracking-[-2px] text-purple no-underline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] max-[650px]:mb-0"
          href="/workspace"
        >
          8x
          <span className="max-w-[65px] text-[11px] leading-[1.3] font-medium tracking-[0.01em] text-muted">
            meeting workspace
          </span>
        </a>
        <p className="mb-4 ml-2.5 text-[10px] font-bold tracking-[1.7px] text-muted max-[650px]:hidden">
          WORKSPACE
        </p>
        <div className="flex items-center gap-3 rounded-[7px] bg-[#eeeafa] p-2.5 text-[#6053c3] max-[650px]:hidden">
          ▤ <span>My meetings</span>
          <span className="ml-auto text-[11px]">{meetings.length}</span>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px] max-[650px]:mt-0 max-[650px]:ml-auto">
          <span className="inline-grid size-[30px] place-items-center rounded-full bg-[#e8e4f7] text-purple max-[650px]:hidden">
            {name.slice(0, 1)}
          </span>
          <span className="max-[650px]:hidden">{name}</span>
          <a
            className="w-full touch-manipulation pl-10 text-purple focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] max-[650px]:pl-0"
            href="/auth/logout"
          >
            Sign out
          </a>
        </div>
      </aside>
      <main className="m-auto w-full max-w-[1600px] p-10 max-[1100px]:p-[26px] max-[650px]:px-4 max-[650px]:py-[22px]">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-2.5 text-[10px] font-bold tracking-[1.7px] text-muted">
              YOUR CONVERSATIONS, REMEMBERED
            </p>
            <h1 className="mb-3 text-[32px] leading-[1.2] font-semibold tracking-[-1px] max-[650px]:text-[28px]">
              My meetings
            </h1>
          </div>
          <Button variant="secondary" onClick={() => void refresh()}>
            Refresh
          </Button>
        </header>
        <div className="mb-6 rounded-lg border border-[#ded8fa] bg-[#f4f1fd] px-[18px] py-4 text-[#504a77]">
          <strong className="text-[13px]">Capture setup is pending</strong>
          <p className="mt-1 mb-0 text-xs">
            Verify Recall.ai’s free allowance and an authorized webhook endpoint
            before sending a notetaker. You can save meeting links now.
          </p>
        </div>
        {integrations && (
          <p className="mb-3 text-xs text-muted" role="status">
            {!integrations.ai.configured
              ? "AI setup needed: configure the Groq Free account key."
              : !integrations.ai.budget?.verified
                ? "AI requests are blocked until the current Free account limits are verified."
                : `Approved AI budget remaining: ${integrations.ai.budget.audio_seconds_remaining} audio seconds · ${integrations.ai.budget.text_requests_remaining} text requests · ${integrations.ai.budget.text_tokens_remaining} reserved-token capacity.`}
          </p>
        )}
        {error && (
          <p
            className="mb-3 rounded-[7px] border border-[#f3c7c7] bg-[#fff1f1] p-3 text-[#8f2525]"
            role="alert"
          >
            {error}
          </p>
        )}
        <form
          className="my-[30px] grid grid-cols-[minmax(120px,1fr)_minmax(180px,1.4fr)_auto] items-end gap-4 max-[1100px]:grid-cols-2 max-[650px]:grid-cols-1"
          onSubmit={create}
          onChange={() => {
            requestId.current = null;
          }}
        >
          <label className="grid gap-[7px] text-xs font-semibold">
            Meeting title
            <input
              className="w-full touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white px-3 py-[11px] text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
              name="title"
              required
              maxLength={160}
              placeholder="Weekly product sync"
            />
          </label>
          <label className="grid gap-[7px] text-xs font-semibold">
            Google Meet link
            <input
              className="w-full touch-manipulation rounded-[7px] border border-[#d9dbe5] bg-white px-3 py-[11px] text-ink placeholder:text-[#9295a3] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
              name="url"
              type="url"
              required
              pattern="https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}"
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </label>
          <Button
            className="max-[1100px]:col-span-full"
            disabled={busy}
            type="submit"
          >
            {busy ? "Saving…" : "Save meeting"}
          </Button>
        </form>
        <div className="grid grid-cols-2 gap-6 max-[1100px]:grid-cols-1">
          <section className="overflow-hidden rounded-[10px] border border-line bg-white">
            <div className="flex items-center justify-between gap-2.5 border-b border-line px-5 py-[17px]">
              <h2 className="m-0 text-[15px] font-semibold">Meeting library</h2>
              <span className="text-[10px] text-muted">Private to you</span>
            </div>
            {loading ? (
              <p
                className="mb-3 px-7 py-[58px] text-center text-muted"
                role="status"
              >
                Loading your meetings…
              </p>
            ) : meetings.length ? (
              meetings.map((m) => (
                <button
                  className={`flex w-full cursor-pointer touch-manipulation items-center justify-start gap-3 rounded-none border-0 border-b border-line p-[17px] text-left font-normal text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff] enabled:hover:brightness-94 disabled:cursor-not-allowed disabled:opacity-48 ${selected?.id === m.id ? "bg-[#f5f3ff]" : "bg-white"}`}
                  key={m.id}
                  onClick={() => setSelected(m)}
                >
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-[5px] bg-[#edeafa] text-purple">
                    ▹
                  </span>
                  <span>
                    <strong className="text-[13px] font-semibold">
                      {m.title}
                    </strong>
                    <small className="block text-[10px] text-muted">
                      {new Date(m.created_at).toLocaleDateString()} · Google
                      Meet
                    </small>
                  </span>
                  <span className="ml-auto rounded-[5px] bg-[#eeeaf6] px-[7px] py-[3px] text-[9px] whitespace-nowrap text-[#686177]">
                    {m.capture_state.replaceAll("_", " ")}
                  </span>
                </button>
              ))
            ) : (
              <div className="px-7 py-[58px] text-center text-muted">
                <span className="mb-4 block text-4xl text-[#aaa3d0]">▤</span>
                <h3 className="mb-2 text-base font-semibold text-ink">
                  Your next conversation starts here
                </h3>
                <p className="m-auto max-w-[320px] text-xs">
                  Save a Google Meet link to begin. Your recordings and notes
                  will appear in this library.
                </p>
              </div>
            )}
          </section>
          <section className="overflow-hidden rounded-[10px] border border-line bg-white">
            <div className="flex items-center justify-between gap-2.5 border-b border-line px-5 py-[17px]">
              <h2 className="m-0 text-[15px] font-semibold">
                {selected?.title || "Meeting details"}
              </h2>
            </div>
            {selected ? (
              <MeetingDetail
                key={selected.id}
                initial={selected}
                onChanged={refresh}
              />
            ) : (
              <div className="px-7 py-[58px] text-center text-muted">
                <h3 className="mb-2 text-base font-semibold text-ink">
                  A little context goes a long way
                </h3>
                <p className="m-auto max-w-[320px] text-xs">
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
