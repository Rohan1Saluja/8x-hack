"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignalIcon, SignalMotif } from "@/components/ui/signal";
import { timestamp } from "@/components/meeting-evidence";

type Sample = {
  title: string;
  segments: string[];
  overview: string;
  overview_sources: number[];
  decisions: { text: string; sources: number[] }[];
  actions: {
    text: string;
    owner: string | null;
    due_date: string | null;
    sources: number[];
  }[];
};
export function DemoExperience({ sample }: { sample: Sample }) {
  const [tab, setTab] = useState("summary");
  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (tab === "transcript" && selected !== null)
      document
        .getElementById(`demo-segment-${selected}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [tab, selected]);
  function open(index: number) {
    setSelected(index);
    setTab("transcript");
  }
  const sources = (ids: number[]) => (
    <span className="source-links">
      {ids.map((i) => (
        <button className="source-chip" key={i} onClick={() => open(i)}>
          ↗ {timestamp(i * 20)}
        </button>
      ))}
    </span>
  );
  const questions = [
    "What did we decide?",
    "What are the next steps?",
    "Did we agree to public sharing?",
  ];
  const answers = [
    { text: sample.decisions[0].text, sources: [2] },
    {
      text: "Maya will review onboarding copy by Friday. Alex will test citation links and playback before the launch review.",
      sources: [3, 4],
    },
    {
      text: "No. External sharing remains undecided. Workspace links require the owner's sign-in; no delivery date is agreed for public sharing.",
      sources: [5],
    },
  ];
  return (
    <main className="demo-page">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          8x <SignalIcon className="brand-mark" />
        </Link>
        <span className="sample-tag">INTERACTIVE PRODUCT DEMO</span>
        <Link className="landing-signin" href="/workspace">
          Your workspace ↗
        </Link>
      </nav>
      <p className="product-notice">
        Scripted sample · Read-only preview. Answers are prewritten from the
        sample transcript, not live AI. Timeline markers are illustrative; no
        recording is attached. Sign in to save meetings and use Groq-backed Ask
        AI.
      </p>
      <header className="meeting-header">
        <div>
          <p className="eyebrow ai-label">A CONVERSATION → A CLEAR NEXT STEP</p>
          <h1>{sample.title}</h1>
          <p className="text-xs text-muted">
            6 source moments · 1 decision · 2 actions
          </p>
        </div>
        <Link href="/workspace" className="landing-cta">
          Make it yours ↗
        </Link>
      </header>
      <div className="detail-layout">
        <div className="detail-main">
          <section className="demo-recording">
            <SignalMotif compact />
            <div>
              <p className="eyebrow">THE ORIGINAL MOMENT MATTERS</p>
              <h2>Follow the thread.</h2>
              <p>
                Explore a decision, ask a sample question, then open its source.
                Real meetings can include a private recording for timestamp
                playback.
              </p>
            </div>
          </section>
          <div
            className="meeting-tabs"
            role="tablist"
            aria-label="Demo content"
          >
            {["summary", "transcript", "questions"].map((t) => (
              <button
                role="tab"
                tabIndex={tab === t ? 0 : -1}
                onKeyDown={(event) => {
                  const tabs = ["summary", "transcript", "questions"];
                  const i = tabs.indexOf(t);
                  const next =
                    event.key === "ArrowRight"
                      ? tabs[(i + 1) % 3]
                      : event.key === "ArrowLeft"
                        ? tabs[(i + 2) % 3]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs[2]
                            : null;
                  if (next) {
                    event.preventDefault();
                    setTab(next);
                    document.getElementById(`demo-tab-${next}`)?.focus();
                  }
                }}
                aria-selected={tab === t}
                aria-controls={`demo-panel-${t}`}
                id={`demo-tab-${t}`}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "questions"
                  ? "Ask AI"
                  : t === "summary"
                    ? "Summary"
                    : "Transcript"}
              </button>
            ))}
          </div>
          <section
            className="meeting-panel"
            role="tabpanel"
            id={`demo-panel-${tab}`}
            aria-labelledby={`demo-tab-${tab}`}
          >
            {tab === "summary" && (
              <>
                <div className="prism-surface">
                  <p className="eyebrow ai-label">
                    SCRIPTED SAMPLE · LINKED TO EVIDENCE
                  </p>
                  <h2>The conversation, distilled.</h2>
                  <p className="demo-overview">{sample.overview}</p>
                  {sources(sample.overview_sources)}
                </div>
                <div className="summary-index">
                  <span>
                    <strong>1</strong> decision
                  </span>
                  <span>
                    <strong>2</strong> action items
                  </span>
                  <span>
                    <strong>1</strong> open question
                  </span>
                </div>
                <ol className="topic-list">
                  {[
                    "The first release",
                    "Make the next step clear",
                    "Keep sharing private",
                  ].map((topic, i) => (
                    <li key={topic}>
                      <span className="topic-index">0{i + 1}</span>
                      <div>
                        <h3>{topic}</h3>
                        <p className="demo-overview">
                          {sample.segments[[2, 3, 5][i]]}
                        </p>
                        {sources([[2, 3, 5][i]])}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {tab === "transcript" && (
              <>
                <div className="section-heading">
                  <h2>Conversation timeline</h2>
                  <span>SCRIPTED SAMPLE</span>
                </div>
                <ol className="transcript-timeline">
                  {sample.segments.map((text, i) => (
                    <li
                      key={i}
                      id={`demo-segment-${i}`}
                      className={selected === i ? "segment-active" : ""}
                    >
                      <button
                        className="timeline-time"
                        onClick={() => setSelected(i)}
                      >
                        {timestamp(i * 20)}
                      </button>
                      <div>
                        <p>{text}</p>
                        {selected === i && (
                          <span className="selected-evidence-label">
                            Selected evidence · sample timeline
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {tab === "questions" && (
              <div className="ask-workspace">
                <div className="ask-intro">
                  <SignalMotif compact />
                  <div>
                    <p className="eyebrow ai-label">FOLLOW THE EVIDENCE</p>
                    <h2>Ask the conversation.</h2>
                    <p>
                      Try a sample question. Every answer leads somewhere real
                      in this scripted transcript.
                    </p>
                  </div>
                </div>
                <div className="suggested-questions">
                  {questions.map((q, i) => (
                    <button
                      key={q}
                      disabled={thinking}
                      onClick={() => {
                        setThinking(true);
                        timer.current = setTimeout(() => {
                          setAnswer(i);
                          setThinking(false);
                        }, 400);
                      }}
                    >
                      {q} ↗
                    </button>
                  ))}
                </div>
                {thinking && (
                  <p role="status" className="processing-notice">
                    Opening the sample answer…
                  </p>
                )}
                {answer !== null && !thinking && (
                  <article className="answer-card">
                    <p className="eyebrow">SAMPLE ANSWER · NOT LIVE AI</p>
                    <h3>{questions[answer]}</h3>
                    <p className="answer-text">{answers[answer].text}</p>
                    {sources(answers[answer].sources)}
                    <div className="answer-evidence">
                      {answers[answer].sources.map((i) => (
                        <button key={i} onClick={() => open(i)}>
                          <span>
                            {timestamp(i * 20)} · Open source excerpt ↗
                          </span>
                          <q>{sample.segments[i]}</q>
                        </button>
                      ))}
                    </div>
                  </article>
                )}
              </div>
            )}
          </section>
        </div>
        <aside className="intelligence-rail">
          <div className="intelligence-heading">
            <span className="intelligence-mark">
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
              <span>1</span>
            </div>
            <p className="demo-overview">{sample.decisions[0].text}</p>
            {sources([2])}
          </section>
          <section className="rail-section">
            <div className="section-heading">
              <h3>Action items</h3>
              <span>2 OPEN</span>
            </div>
            {sample.actions.map((a) => (
              <div className="highlight-item" key={a.text}>
                <p>{a.text}</p>
                <small className="text-xs text-muted">
                  {a.owner} · {a.due_date}
                </small>
                {sources(a.sources)}
              </div>
            ))}
          </section>
          <section className="rail-section">
            <div className="section-heading">
              <h3>Highlight</h3>
              <span>01</span>
            </div>
            <p className="demo-overview">The first-release decision</p>
            <button className="source-chip" onClick={() => open(2)}>
              ◆ 0:40 · Open moment
            </button>
          </section>
          <p className="rail-empty">
            In your workspace, edits and highlights are saved to your account.
            Search spans your meetings.
          </p>
        </aside>
      </div>
      <footer className="landing-footer">
        <Link href="/">← Back to 8x</Link>
        <Link href="/workspace">Continue to your private workspace ↗</Link>
      </footer>
    </main>
  );
}
