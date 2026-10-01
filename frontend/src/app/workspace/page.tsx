import { redirect } from "next/navigation";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";
export default async function WorkspacePage() {
  if (missingAuthConfiguration().length) redirect("/");
  const session = await auth0().getSession();
  if (!session) redirect("/auth/login?returnTo=%2Fworkspace");
  return <Workspace name={session.user.name || "Your workspace"} />;
}
