import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function env() {
  const store = new Map();
  return {
    UPDATE_PATH: "/u/test-random-path",
    CHECK_PATH: "/current",
    KV_KEY: "home:current-ip",
    HOME_IP_KV: {
      put: async (key, value) => store.set(key, value),
      get: async (key) => store.get(key) ?? null,
    },
  };
}

test("update stores CF-Connecting-IP and check returns it", async () => {
  const testEnv = env();
  const updateResponse = await worker.fetch(
    new Request("https://example.com/u/test-random-path", {
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    }),
    testEnv,
  );

  assert.equal(updateResponse.status, 200);
  const updateBody = await updateResponse.json();
  assert.equal(updateBody.ok, true);
  assert.equal(updateBody.ip, "203.0.113.10");
  assert.match(updateBody.updated_at_jst, /\d{4}\/\d{2}\/\d{2}/);

  const checkResponse = await worker.fetch(new Request("https://example.com/current"), testEnv);
  assert.equal(checkResponse.status, 200);
  const checkBody = await checkResponse.json();
  assert.equal(checkBody.ok, true);
  assert.equal(checkBody.record.ip, "203.0.113.10");
});

test("falls back to X-Forwarded-For", async () => {
  const testEnv = env();
  const response = await worker.fetch(
    new Request("https://example.com/u/test-random-path", {
      headers: { "X-Forwarded-For": "198.51.100.20, 10.0.0.1" },
    }),
    testEnv,
  );
  const body = await response.json();
  assert.equal(body.ip, "198.51.100.20");
});

test("unknown path returns 404", async () => {
  const response = await worker.fetch(new Request("https://example.com/nope"), env());
  assert.equal(response.status, 404);
});
