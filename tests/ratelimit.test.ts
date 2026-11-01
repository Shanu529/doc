import test from "node:test"; import assert from "node:assert/strict";
test("rate limiter fails closed when its backend is unreachable", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1"; process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  const { allow } = await import("../src/lib/ratelimit"); assert.equal(await allow("k", 1000, 60), false);
});
