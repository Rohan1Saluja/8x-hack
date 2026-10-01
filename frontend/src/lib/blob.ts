import "server-only";
import { issueSignedToken, presignUrl } from "@vercel/blob";

type PlaybackDescriptor = { pathname: string; expires_in: number };
const recordingPath =
  /^(development|production)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(wav|mp3|mp4|m4a|webm)$/;

// Use only the successful backend ownership-check response, never browser input.
export async function signPlayback(value: unknown) {
  const descriptor = value as Partial<PlaybackDescriptor> | null;
  if (
    !descriptor ||
    typeof descriptor.pathname !== "string" ||
    !recordingPath.test(descriptor.pathname) ||
    typeof descriptor.expires_in !== "number" ||
    !Number.isInteger(descriptor.expires_in) ||
    descriptor.expires_in < 30 ||
    descriptor.expires_in > 600
  )
    throw new Error("Invalid playback response.");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Blob storage is not configured.");
  const validUntil = Date.now() + descriptor.expires_in * 1000;
  const signedToken = await issueSignedToken({
    token,
    pathname: descriptor.pathname,
    operations: ["get"],
    validUntil,
    abortSignal: AbortSignal.timeout(20000),
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    pathname: descriptor.pathname,
    operation: "get",
    access: "private",
    validUntil,
  });
  return { url: presignedUrl, expires_in: descriptor.expires_in };
}
