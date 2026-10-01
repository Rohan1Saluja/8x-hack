"use client";

import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen px-[6vw] py-9 max-[650px]:p-6">
      <section className="mx-auto mt-[10vh] max-w-[660px] rounded-2xl border border-line bg-white p-12 shadow-[0_12px_50px_#22243006] max-[650px]:p-[26px]">
        <h1 className="mb-3 text-[40px] leading-[1.2] font-semibold tracking-[-1px] max-[650px]:text-[32px]">
          Unable to open your workspace
        </h1>
        <p className="mb-3">
          Please try again. If this continues, check the project’s
          authentication settings.
        </p>
        <Button onClick={reset}>Try again</Button>
        <a
          className="m-[18px] inline-block touch-manipulation text-purple focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#b3aaff]"
          href="/"
        >
          Back to sign in
        </a>
      </section>
    </main>
  );
}
