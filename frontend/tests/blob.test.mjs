import assert from "node:assert/strict";
import { mock, test } from "node:test";

const issued = [];
const signed = [];
mock.module("@vercel/blob", {
  namedExports: {
    issueSignedToken: async (options) => {
      issued.push(options);
      return { delegationToken: "delegation", clientSigningToken: "private-signing-key" };
    },
    presignUrl: async (token, options) => {
      signed.push({ token, options });
      return { presignedUrl: "https://fixture.private.blob.vercel-storage.com/signed" };
    },
  },
});
const { signPlayback } = await import("../src/lib/blob.ts");
const pathname = "development/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.wav";

test("playback signs only one private read path with bounded expiry", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "fixture-server-token";
  const start = Date.now();
  const result = await signPlayback({ pathname, expires_in: 300 });
  assert.deepEqual(issued[0].operations, ["get"]);
  assert.equal(issued[0].pathname, pathname);
  assert.equal(issued[0].token, "fixture-server-token");
  assert.ok(issued[0].validUntil >= start + 300000 && issued[0].validUntil <= Date.now() + 300000);
  assert.equal(signed[0].options.access, "private");
  assert.equal(signed[0].options.pathname, pathname);
  assert.equal(signed[0].options.validUntil, issued[0].validUntil);
  assert.deepEqual(Object.keys(result).sort(), ["expires_in", "url"]);
  assert.ok(!JSON.stringify(result).includes("private-signing-key"));
  assert.ok(!JSON.stringify(result).includes("fixture-server-token"));
});

test("invalid paths and expiries never reach the signing SDK", async () => {
  const calls = issued.length;
  for (const value of [null, {}, { pathname: "*", expires_in: 300 }, { pathname: "https://evil.test/a.wav", expires_in: 300 }, { pathname, expires_in: 601 }, { pathname, expires_in: -1 }]) {
    await assert.rejects(signPlayback(value), /Invalid playback/);
  }
  assert.equal(issued.length, calls);
});

test("missing Blob token fails without issuing any signed token", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const calls = issued.length;
  await assert.rejects(signPlayback({ pathname, expires_in: 300 }), /not configured/);
  assert.equal(issued.length, calls);
});
