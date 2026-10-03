// Component regression checks only: API responses are explicit test fixtures.
// Install esbuild + jsdom in a temporary directory; set UI_CHECK_TOOLS to its node_modules.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(new URL("../package.json", import.meta.url));
if (!process.env.UI_CHECK_TOOLS)
  throw new Error(
    "Set UI_CHECK_TOOLS to a temporary node_modules containing esbuild and jsdom. See docs/meeting-intelligence-checkpoint.md.",
  );
const toolRequire = createRequire(
  join(resolve(process.env.UI_CHECK_TOOLS), "package.json"),
);
const { JSDOM } = toolRequire("jsdom");
const { build } = toolRequire("esbuild");
const temporary = mkdtempSync(
  new URL("../node_modules/.intelligence-check-", import.meta.url),
);
after(() => rmSync(temporary, { recursive: true, force: true }));
await build({
  entryPoints: [
    new URL("../src/components/meeting-detail.tsx", import.meta.url).pathname,
  ],
  outfile: join(temporary, "detail.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
  tsconfig: new URL("../tsconfig.json", import.meta.url).pathname,
});
const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>',
  { url: "http://localhost" },
);
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLVideoElement",
  "FormData",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
])
  globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = require("react");
const { createRoot } = require("react-dom/client");
const { MeetingDetail } = require(join(temporary, "detail.cjs"));
const meeting = {
  id: "meeting-test",
  title: "Component fixture — not a real meeting",
  meeting_url: null,
  created_at: "2026-10-03T00:00:00Z",
  capture_state: "stopped",
  transcription_state: "pending",
  summary_state: "pending",
  failure_code: null,
  recording_ready: true,
  duration_seconds: 60,
  lifecycle_state: "recorded",
  lifecycle_version: 0,
  lifecycle_updated_at: null,
  consent_confirmed_at: null,
  capture_mode: "manual",
};
const empty = {
  segments: [],
  summary: null,
  actions: [],
  questions: [],
  jobs: [],
};
const segment = {
  id: "segment-test",
  ordinal: 0,
  text: "Fixture evidence: review the draft.",
  start_seconds: 12,
  end_seconds: 20,
  speaker: null,
};
const summary = {
  overview: {
    text: "Fixture overview",
    source_segment_ids: [segment.id, "unknown-source"],
  },
  topics: [{ text: "Fixture topic", source_segment_ids: [segment.id] }],
  decisions: [],
};
let savedMeeting, savedEvidence, requests, root, handler;
async function mount(m = meeting, e = empty) {
  savedMeeting = structuredClone(m);
  savedEvidence = structuredClone(e);
  requests = [];
  handler = null;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, ...options });
    if (handler) {
      const result = await handler(url, options);
      if (result) return result;
    }
    const data = url.endsWith("/evidence")
      ? savedEvidence
      : url.endsWith("/playback")
        ? { url: "https://example.invalid/private-fixture.wav" }
        : savedMeeting;
    return Response.json(data);
  };
  root = createRoot(document.getElementById("root"));
  await React.act(async () => {
    root.render(
      React.createElement(MeetingDetail, {
        initial: savedMeeting,
        onChanged: async () => {},
      }),
    );
  });
}
async function unmount() {
  await React.act(async () => root.unmount());
}
const find = (text) =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent.trim() === text,
  );
async function click(el) {
  assert.ok(el, "expected button");
  await React.act(async () => el.click());
}
const body = () => document.body.textContent;

test("demo readiness never enables AI or creates fake evidence", async () => {
  await mount({
    ...meeting,
    capture_mode: "demo",
    lifecycle_state: "ready",
    recording_ready: false,
    duration_seconds: null,
  });
  assert.match(body(), /Simulated capture/);
  assert.match(body(), /No bot joins, no audio is captured/);
  assert.equal(find("Generate transcript").disabled, true);
  assert.equal(find("Generate summary").disabled, true);
  await click(find("Ask AI"));
  assert.equal(find("Ask meeting").disabled, true);
  assert.match(body(), /No transcript evidence yet/);
  assert.equal(
    requests.some((r) => r.method === "POST"),
    false,
  );
  await unmount();
});

test("real recording stages expose progress, save response state and survive component reload", async () => {
  await mount();
  assert.equal(find("Generate transcript").disabled, false);
  assert.equal(find("Generate summary").disabled, true);
  let finish;
  handler = async (url, options) => {
    if (options.method === "POST" && url.endsWith("/transcribe")) {
      await new Promise((resolve) => {
        finish = resolve;
      });
      savedMeeting.transcription_state = "ready";
      savedEvidence.segments = [segment];
      return Response.json({ status: "ready" });
    }
    if (options.method === "POST" && url.endsWith("/summarize")) {
      savedMeeting.summary_state = "ready";
      savedEvidence.summary = summary;
      return Response.json({ status: "ready" });
    }
  };
  await click(find("Generate transcript"));
  assert.ok(find("Transcribing…").disabled);
  assert.match(body(), /Processing is in progress/);
  await React.act(async () => {
    finish();
  });
  assert.match(body(), /Fixture evidence/);
  await click(find("Generate summary"));
  assert.match(body(), /Fixture overview/);
  const m = savedMeeting,
    e = savedEvidence;
  await unmount();
  await mount(m, e);
  assert.match(body(), /Fixture overview/);
  assert.equal(find("Summary saved").disabled, true);
  await unmount();
});

test("sources open the real segment, omit unknown IDs, and cue loaded playback", async () => {
  await mount(
    { ...meeting, transcription_state: "ready", summary_state: "ready" },
    { ...empty, segments: [segment], summary },
  );
  assert.equal(document.querySelectorAll(".source-links button").length, 2);
  await click(document.querySelector('[aria-label="Open evidence at 0:12"]'));
  assert.equal(
    document.querySelector('[role="tab"][aria-selected="true"]').textContent,
    "Transcript1",
  );
  const row = document.querySelector(".segment-active");
  assert.equal(row.id, "segment-segment-test");
  assert.equal(document.activeElement, row);
  assert.equal(document.querySelectorAll(".speaker-label").length, 0);
  const video = document.querySelector("video");
  await React.act(async () => video.dispatchEvent(new Event("loadedmetadata")));
  assert.equal(video.currentTime, 12);
  assert.equal(requests.filter((r) => r.url.endsWith("/playback")).length, 1);
  await unmount();
});

test("transcript-only citation navigation never requests missing playback", async () => {
  await mount(
    {
      ...meeting,
      recording_ready: false,
      transcription_state: "ready",
      summary_state: "ready",
    },
    { ...empty, segments: [segment], summary },
  );
  await click(document.querySelector('[aria-label="Open evidence at 0:12"]'));
  assert.match(body(), /No recording is attached for playback/);
  assert.equal(
    requests.some((r) => r.url.endsWith("/playback")),
    false,
  );
  await unmount();
});

test("unsupported answers and quota failures stay explicit", async () => {
  await mount(
    { ...meeting, transcription_state: "ready" },
    {
      ...empty,
      segments: [segment],
      questions: [
        {
          id: "question-test",
          question: "Fixture question",
          answer: {
            answer: "Insufficient information in this meeting.",
            supported: false,
            source_segment_ids: [],
          },
        },
      ],
    },
  );
  await click(find("Ask AI"));
  assert.match(body(), /Insufficient meeting evidence/);
  assert.equal(
    document.querySelectorAll(".answer-card .source-chip").length,
    0,
  );
  handler = async (url, options) =>
    options.method === "POST"
      ? Response.json(
          {
            detail: { message: "The verified free usage budget is exhausted." },
          },
          { status: 429 },
        )
      : null;
  await click(find("Generate summary"));
  assert.match(
    document.querySelector('[role="alert"]').textContent,
    /free usage budget is exhausted/,
  );
  assert.ok(find("Generate summary"));
  await unmount();
});

test("interrupted jobs require recovery and tabs support keyboard navigation", async () => {
  await mount(
    { ...meeting, transcription_state: "running" },
    {
      ...empty,
      jobs: [
        {
          job_key: "transcribe",
          stage: "transcribe",
          status: "running",
          attempts: 1,
          error_code: null,
          retry_after: null,
          interrupted: true,
        },
      ],
    },
  );
  assert.ok(find("Recover interrupted work"));
  assert.equal(find("Transcribing…").disabled, true);
  await React.act(async () =>
    document
      .getElementById("tab-summary")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      ),
  );
  assert.equal(document.activeElement.id, "tab-questions");
  assert.equal(
    document.getElementById("tab-questions").getAttribute("aria-selected"),
    "true",
  );
  await unmount();
});

test("action edits use existing owner-scoped route and preserve explicit values", async () => {
  const item = {
    id: "action-test",
    text: "Review draft",
    owner: null,
    due_date: null,
    completed: false,
    source_segment_ids: [segment.id],
  };
  await mount(
    { ...meeting, transcription_state: "ready" },
    { ...empty, segments: [segment], actions: [item] },
  );
  const form = document.querySelector(".action-editor");
  form.elements.text.value = "Review updated draft";
  form.elements.owner.value = "";
  form.elements.completed.checked = true;
  await React.act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  const request = requests.find((r) => r.method === "PATCH");
  assert.equal(
    request.url,
    "/api/backend/meetings/meeting-test/actions/action-test",
  );
  assert.deepEqual(JSON.parse(request.body), {
    text: "Review updated draft",
    owner: null,
    due_date: null,
    completed: true,
  });
  await unmount();
});
