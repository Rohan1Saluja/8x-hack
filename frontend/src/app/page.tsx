import { redirect } from "next/navigation";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";
import { LandingPage } from "@/components/landing-page";

export const dynamic = "force-dynamic";
export default async function Home() {
  const missing = missingAuthConfiguration();
  if (!missing.length && (await auth0().getSession())) redirect("/workspace");
  return <LandingPage signInAvailable={!missing.length} />;
}
