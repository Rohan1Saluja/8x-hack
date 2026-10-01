"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="entry">
      <section className="entry-card">
        <h1>Unable to open your workspace</h1>
        <p>
          Please try again. If this continues, check the project’s
          authentication settings.
        </p>
        <button onClick={reset}>Try again</button>
        <a className="text-link" href="/">
          Back to sign in
        </a>
      </section>
    </main>
  );
}
