import { redirect } from "next/navigation";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";

export const dynamic = "force-dynamic";
export default async function Home() {
  const missing = missingAuthConfiguration();
  if (!missing.length && (await auth0().getSession())) redirect("/workspace");
  return (
    <main className="min-h-screen px-[6vw] py-9 max-[650px]:p-6">
      <a
        className="flex touch-manipulation items-center gap-3 text-[32px] font-extrabold tracking-[-2px] text-purple no-underline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
        href="/"
      >
        8x
        <span className="max-w-[65px] text-[11px] leading-[1.3] font-medium tracking-[0.01em] text-muted">
          meeting workspace
        </span>
      </a>
      <section className="mx-auto mt-[10vh] max-w-[660px] rounded-2xl border border-line bg-white p-12 shadow-[0_12px_50px_#22243006] max-[650px]:p-[26px]">
        <p className="mb-4 text-[10px] font-bold tracking-[1.7px] text-muted">
          PREPARATION WORKSPACE
        </p>
        <h1 className="mb-3 text-[40px] leading-[1.2] font-semibold tracking-[-1px] max-[650px]:text-[32px]">
          Stay in the conversation.
        </h1>
        <p className="mb-[30px] text-[17px] text-muted">
          A private home for your meetings, notes, and the moments behind them.
        </p>
        {missing.length ? (
          <div
            className="mb-6 rounded-lg border border-[#ded8fa] bg-[#f4f1fd] px-[18px] py-4 text-[#504a77]"
            role="status"
          >
            <strong className="text-[13px]">Authentication setup needed</strong>
            <p className="mt-1 mb-0 text-xs">
              Add the required authentication settings to start your workspace.
              Setup instructions are in the project README.
            </p>
            <p className="mt-1 mb-0 text-xs text-muted">
              No meeting data is available until you sign in.
            </p>
          </div>
        ) : (
          <a
            className="inline-flex cursor-pointer touch-manipulation items-center justify-center gap-6 rounded-lg border border-transparent bg-purple px-[18px] py-[11px] font-semibold text-white no-underline hover:brightness-94 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
            href="/auth/login?returnTo=%2Fworkspace"
          >
            Sign in to your workspace <span aria-hidden>→</span>
          </a>
        )}
        <div className="mt-[34px] mb-[18px] flex justify-between gap-5 border-t border-line pt-[22px] text-[11px] max-[650px]:grid max-[650px]:gap-2.5">
          <span>01 · Send notetaker</span>
          <span>02 · Review notes</span>
          <span>03 · Find the moment</span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Google Meet capture is pending free account verification. No bot is
          sent from this screen.
        </p>
      </section>
    </main>
  );
}
