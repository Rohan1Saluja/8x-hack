import { redirect } from "next/navigation";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";

export const dynamic = "force-dynamic";
export default async function Home() {
  const missing = missingAuthConfiguration();
  if (!missing.length && (await auth0().getSession())) redirect("/workspace");
  return (
    <main className="entry">
      <a className="brand" href="/">
        8x<span>meeting workspace</span>
      </a>
      <section className="entry-card">
        <p className="eyebrow">PREPARATION WORKSPACE</p>
        <h1>Stay in the conversation.</h1>
        <p className="lede">
          A private home for your meetings, notes, and the moments behind them.
        </p>
        {missing.length ? (
          <div className="notice" role="status">
            <strong>Authentication setup needed</strong>
            <p>
              Add the required authentication settings to start your workspace.
              Setup instructions are in the project README.
            </p>
            <p className="fine">
              No meeting data is available until you sign in.
            </p>
          </div>
        ) : (
          <a className="button" href="/auth/login?returnTo=%2Fworkspace">
            Sign in to your workspace <span aria-hidden>→</span>
          </a>
        )}
        <div className="entry-steps">
          <span>01 · Send notetaker</span>
          <span>02 · Review notes</span>
          <span>03 · Find the moment</span>
        </div>
        <p className="fine">
          Google Meet capture is pending free account verification. No bot is
          sent from this screen.
        </p>
      </section>
    </main>
  );
}
