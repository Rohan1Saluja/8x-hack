import Link from "next/link";
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
                  style={{ height: `${14 + ((i * 17 + i * i) % 44)}px` }}
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
        <a href="#how-it-works">Back to the experience ↑</a>
      </footer>
    </main>
  );
}
