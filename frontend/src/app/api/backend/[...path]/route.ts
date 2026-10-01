import { NextRequest } from "next/server";
import { auth0, missingAuthConfiguration } from "@/lib/auth0";

export const runtime = "nodejs";
export const maxDuration = 300;
const uuid = "[0-9a-fA-F-]{36}";
const routes: Record<string, RegExp[]> = {
  GET: [
    /^me$/,
    /^integrations$/,
    /^meetings$/,
    new RegExp(`^meetings/${uuid}$`),
    new RegExp(`^meetings/${uuid}/playback$`),
    new RegExp(`^meetings/${uuid}/evidence$`),
  ],
  POST: [
    /^meetings$/,
    new RegExp(
      `^meetings/${uuid}/(send|stop|transcribe|summarize|questions|recover)$`,
    ),
  ],
  PATCH: [new RegExp(`^meetings/${uuid}/actions/${uuid}$`)],
  DELETE: [new RegExp(`^meetings/${uuid}$`)],
};
const error = (status: number, message: string) =>
  Response.json(
    { detail: { message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!routes[request.method]?.some((pattern) => pattern.test(path)))
    return error(404, "Route not found.");
  if (missingAuthConfiguration().length)
    return error(503, "Authentication setup is incomplete.");
  if (!(await auth0().getSession())) return error(401, "Sign in to continue.");
  const origin = process.env.APP_BASE_URL;
  if (request.method !== "GET" && request.headers.get("origin") !== origin)
    return error(403, "Request origin rejected.");
  const backend = process.env.BACKEND_URL;
  if (!backend) return error(503, "Backend URL is not configured.");
  let token: string;
  try {
    ({ token } = await auth0().getAccessToken());
  } catch {
    return error(401, "Your session expired. Sign in again.");
  }
  const body = request.method === "GET" ? undefined : await request.text();
  if (body && new TextEncoder().encode(body).byteLength > 16384)
    return error(413, "Request is too large.");
  try {
    const response = await fetch(`${backend.replace(/\/$/, "")}/${path}`, {
      method: request.method,
      body,
      cache: "no-store",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(240000),
    });
    return new Response(
      response.status === 204 ? null : await response.text(),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return error(
      502,
      "Backend unavailable or timed out. Refresh to check saved progress before retrying.",
    );
  }
}
export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
