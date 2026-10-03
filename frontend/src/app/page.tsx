import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";
import { LandingPage } from "@/components/landing-page";

// Scope the landing canonical to this route, not every authenticated page.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "Mavri — AI Meeting Intelligence",
    description:
      "Turn conversations into grounded summaries, decisions, action items, and evidence-backed answers.",
    siteName: "Mavri",
    type: "website",
    locale: "en_US",
    url: "/",
  },
};

export const dynamic = "force-dynamic";
export default async function Home() {
  const missing = missingAuthConfiguration();
  if (!missing.length && (await auth0().getSession())) redirect("/workspace");
  return <LandingPage signInAvailable={!missing.length} />;
}

