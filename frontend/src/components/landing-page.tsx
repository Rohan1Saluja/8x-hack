import Link from "next/link";
import type { CSSProperties } from "react";
import { SignalIcon, SignalMotif } from "@/components/ui/signal";

export function LandingPage({ signInAvailable }: { signInAvailable: boolean }) {
  const start = signInAvailable ? "/auth/login?returnTo=%2Fworkspace" : "/demo";
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Public navigation">
        <Link href="/" className="brand" aria-label="8x home">
          8x <SignalIcon className="brand-mark" />
        </Link>
        <div className="landing-nav-links">
          <a href="#how-it-works">The experience</a>
          <a href="#post-meeting-intelligence">After the meeting</a>
          <a href="#built-on-evidence">Built on evidence</a>
        </div>
        <a className="landing-signin" href={start}>
          {signInAvailable ? "Sign in" : "Explore demo"}{" "}
          <span aria-hidden>↗</span>
        </a>
      </nav>
      <section className="landing-hero">
        <div className="hero-copy">
          <p className="signal-label">
            <span className="status-dot" /> YOUR CONVERSATION. IN FOCUS.
          </p>
          <h1>
            Great conversations.
            <br />
            Clear <span>next moves.</span>
          </h1>
          <p className="hero-description">
            Turn the moments that matter into decisions, actions, and answers
            you can trace back to the source.
          </p>
          <div className="hero-actions">
            <a className="landing-cta" href={start}>
              {signInAvailable ? "Get started" : "Explore the workspace"}{" "}
              <span aria-hidden>↗</span>
            </a>
            <Link className="landing-secondary" href="/demo">
              <span aria-hidden>▷</span> View demo
            </Link>
          </div>
          <p className="hero-caption">
            Less reconstructing. More moving forward.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit" />
          <SignalMotif />
          <span className="orb-label orb-label-top">CONVERSATION IN</span>
          <span className="orb-label orb-label-bottom">CLARITY OUT</span>
        </div>
      </section>
      <section
        className="landing-preview"
        aria-label="Scripted meeting intelligence preview"
      >
        <div className="preview-chrome">
          <span>
            <i /> <i /> <i />
          </span>
          <p>8x / meeting intelligence</p>
          <span className="sample-tag">SCRIPTED PREVIEW</span>
        </div>
        <div className="preview-content">
          <div className="preview-main">
            <p className="eyebrow">PRODUCT ROADMAP REVIEW</p>
            <h2>
              The conversation,
              <br />
              <span>distilled.</span>
            </h2>
            <div className="preview-wave" aria-hidden="true">
              {Array.from({ length: 55 }, (_, i) => (
                <i
                  key={i}
                  style={
                    {
                      height: `${14 + ((i * 17 + i * i) % 44)}px`,
                      "--beat": `${(i % 7) * 80}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="preview-tabs">
              <span>Summary</span>
              <span>Transcript</span>
              <span>
                Ask AI <SignalIcon />
              </span>
            </div>
            <p className="preview-question">
              What did we decide to ship first?
            </p>
            <p className="preview-answer">
              Timestamped transcripts, evidence links, and editable action
              items. Calendar sync comes later.
            </p>
            <Link href="/demo" className="source-chip">
              ↗ 0:40 · See the evidence
            </Link>
          </div>
          <aside className="preview-rail">
            <p className="eyebrow ai-label">
              <SignalIcon /> INTELLIGENCE
            </p>
            <h3>One decision. Clear direction.</h3>
            <p>Focus the first release on the moments behind the notes.</p>
            <div className="preview-task">
              <span>✓</span>
              <div>
                Review onboarding copy<small>Maya · Friday</small>
              </div>
            </div>
            <div className="preview-task">
              <span>□</span>
              <div>
                Verify citation playback
                <small>Alex · Before launch review</small>
              </div>
            </div>
            <div className="preview-evidence">
              <span className="status-dot" /> Linked to the original evidence
            </div>
          </aside>
        </div>
      </section>
      <section id="how-it-works" className="landing-story">
        <div className="landing-section-heading">
          <p className="eyebrow">FROM WORDS TO WHAT’S NEXT</p>
          <h2>
            Stay present.
            <br />
            Leave with clarity.
          </h2>
          <p>
            A single thread from the original conversation to the next thing
            worth doing.
          </p>
        </div>
        <div className="story-steps">
          {[
            [
              "01",
              "Capture",
              "Start with the source.",
              "Bring a consented recording into your private workspace. Follow every moment in a timestamped transcript.",
            ],
            [
              "02",
              "Understand",
              "Find what matters.",
              "Review a structured summary. Ask a question. Follow the evidence to see exactly where an answer came from.",
            ],
            [
              "03",
              "Act",
              "Keep the momentum.",
              "Turn decisions into editable tasks. Save highlights and find the conversation again when you need it.",
            ],
          ].map(([number, title, headline, copy]) => (
            <article key={number}>
              <span className="story-number">{number}</span>
              <p className="eyebrow">{title}</p>
              <h3>{headline}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="built-on-evidence" className="landing-trust">
        <div>
          <p className="eyebrow ai-label">CLARITY YOU CAN CHECK</p>
          <h2>
            Every answer has
            <br />a way back.
          </h2>
          <p>
            Open a citation. Read the exact words. Jump to the recording. Keep
            your own judgment in the loop.
          </p>
          <Link href="/demo" className="text-link">
            Follow the evidence in the demo ↗
          </Link>
        </div>
        <ul>
          <li>
            <span>↗</span>
            <div>
              <h3>Evidence-backed answers</h3>
              <p>
                Citations reference stored transcript segments from that
                meeting.
              </p>
            </div>
          </li>
          <li>
            <span>◈</span>
            <div>
              <h3>Private by design</h3>
              <p>
                Owner-only meetings and authorized, temporary recording access.
              </p>
            </div>
          </li>
          <li>
            <span>◎</span>
            <div>
              <h3>Clear about capture</h3>
              <p>
                Participant consent comes first. Demo capture is simulated; no
                live bot joins your call. The preview uses scripted sample
                content.
              </p>
            </div>
          </li>
        </ul>
      </section>
      <section
        id="post-meeting-intelligence"
        className="landing-intelligence"
        aria-labelledby="landing-intel-heading"
      >
        <div className="landing-intel-heading landing-section-heading">
          <p className="eyebrow ai-label">
            <SignalIcon /> POST-MEETING INTELLIGENCE
          </p>
          <h2 id="landing-intel-heading">
            After the meeting is where
            <br />
            <span>the intelligence begins.</span>
          </h2>
          <p>
            The call ends. The context stays. Turn a conversation into a clear
            next step—with the original words always within reach.
          </p>
        </div>
        <div className="landing-intel-stage">
          <div className="landing-intel-stage-label">
            <span>
              <span className="status-dot" /> ONE CONVERSATION. SEVEN WAYS
              FORWARD.
            </span>
            <span className="sample-tag">ILLUSTRATIVE WORKFLOW</span>
          </div>
          <ol className="landing-intel-flow">
            {[
              [
                "01",
                "Transcript",
                "Keep the original words.",
                "“Let’s ship transcript review first. Sharing can follow.”",
                "The conversation, timestamped",
                "source",
              ],
              [
                "02",
                "Summary",
                "See the shape of the meeting.",
                "A focused release, built around transcript review and evidence.",
                "The essentials, structured",
                "summary",
              ],
              [
                "03",
                "Decisions",
                "Know what was agreed.",
                "Prioritize transcript review before sharing.",
                "Direction you can revisit",
                "decision",
              ],
              [
                "04",
                "Action items",
                "Make the next move clear.",
                "Review the onboarding copy",
                "Editable tasks · owners when stated",
                "action",
              ],
              [
                "05",
                "Ask AI",
                "Ask the follow-up question.",
                "What are we shipping first?",
                "Answers grounded in this meeting",
                "ask",
              ],
              [
                "06",
                "Evidence",
                "Go straight to the source.",
                "Open the cited words. Jump to that recording moment.",
                "Real segments, traceable answers",
                "evidence",
              ],
              [
                "07",
                "Search",
                "Bring the context back.",
                "Find the meeting. Pick up the thread.",
                "Knowledge beyond a single call",
                "search",
              ],
            ].map(([number, title, headline, copy, caption, kind]) => (
              <li
                className={`landing-intel-step landing-intel-${kind}`}
                key={number}
              >
                <div className="landing-intel-step-label">
                  <span>{number}</span>
                  <h3>{title}</h3>
                  <span aria-hidden="true">↗</span>
                </div>
                <h4>{headline}</h4>
                <div className="landing-intel-example">
                  {kind === "source" && <SignalIcon />}
                  {kind === "action" && (
                    <span className="landing-intel-checkbox" aria-hidden="true">
                      □
                    </span>
                  )}
                  {kind === "ask" && <SignalIcon />}
                  <p>{copy}</p>
                </div>
                <p className="landing-intel-caption">{caption}</p>
              </li>
            ))}
          </ol>
          <div className="landing-intel-footnote">
            <p>From a useful answer to the moment behind it.</p>
            <Link href="/demo" className="text-link">
              Explore the scripted demo <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
      <section
        id="faqs"
        className="landing-faq"
        aria-labelledby="landing-faq-heading"
      >
        <div className="landing-section-heading">
          <p className="eyebrow ai-label">A LITTLE MORE CLARITY</p>
          <h2 id="landing-faq-heading">
            Good questions.
            <br />
            <span>Clear answers.</span>
          </h2>
          <p>What to expect before your next conversation.</p>
          <Link href="/demo" className="text-link">
            See it in the demo <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="landing-faq-list">
          {[
            [
              "What happens after a meeting?",
              "A recording can become a timestamped transcript, a structured summary, decisions, and editable action items. Ask follow-up questions, revisit cited moments, and search for the conversation when you need its context again.",
            ],
            [
              "Does a live bot join my calls?",
              "Not in this version. The demo simulates joining, admission, and recording; no live bot joins your call. Real recordings currently use an operator-assisted import; there is no in-app upload control. Only use recordings made with participants’ consent.",
            ],
            [
              "Can I try it without signing in?",
              "Yes. The public demo lets you explore a scripted meeting and its intelligence workflow without an account. Sign in to use your own private workspace.",
            ],
            [
              "How do I check an AI answer?",
              "Follow its citations to stored transcript segments from that meeting. When a recording is available, you can jump to the cited moment. Ask AI is designed to stay within the meeting evidence and say when there is not enough information. AI can still make mistakes—check the source before acting.",
            ],
            [
              "Who can access my recordings?",
              "Your meetings are tied to your signed-in account. Recording playback requires authorization and uses temporary access. Only upload recordings you have permission to use, with participants’ consent.",
            ],
            [
              "Can I edit the action items?",
              "Yes. You can review and edit action items and update their completion status. Owners and deadlines should come from the conversation; when they are not stated, they remain unknown rather than being guessed.",
            ],
          ].map(([question, answer], index) => (
            <details
              className="landing-faq-item"
              key={question}
              open={index === 0}
            >
              <summary>
                <span>{question}</span>
                <span className="landing-faq-toggle" aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="landing-close">
        <SignalIcon />
        <p className="eyebrow">KEEP THE CONVERSATION. FIND THE CLARITY.</p>
        <h2>
          Your next move
          <br />
          starts here.
        </h2>
        <a href={start} className="landing-cta">
          {signInAvailable ? "Open your workspace" : "View the demo"} ↗
        </a>
      </section>
      <footer className="landing-footer">
        <Link href="/" className="brand">
          8x
        </Link>
        <span>Meeting intelligence. Grounded in conversation.</span>
        <a href="#faqs">FAQs</a>
        <a href="#how-it-works">Back to the experience ↑</a>
      </footer>
    </main>
  );
}
