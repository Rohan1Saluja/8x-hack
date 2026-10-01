import "server-only";
import { Auth0Client } from "@auth0/nextjs-auth0/server";

const required = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
  "AUTH0_AUDIENCE",
] as const;
export function missingAuthConfiguration() {
  return required.filter((name) => !process.env[name]);
}
let client: Auth0Client | undefined;
export function auth0() {
  if (missingAuthConfiguration().length)
    throw new Error("Authentication is not configured.");
  client ??= new Auth0Client({
    authorizationParameters: {
      audience: process.env.AUTH0_AUDIENCE,
      scope: "openid profile email offline_access",
    },
    enableAccessTokenEndpoint: false,
  });
  return client;
}
