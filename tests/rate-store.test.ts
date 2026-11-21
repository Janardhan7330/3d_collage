import test from "node:test";
import assert from "node:assert/strict";
import { openDB, migrate } from "../src/server/db";
import { DatabaseRateStore } from "../src/server/rate-store";
test("shared limiter increments atomically across instances and resets expired windows", async () => {
  const db = openDB(":memory:");
  await migrate(db);
  const a = new DatabaseRateStore(db, "test:"),
    b = new DatabaseRateStore(db, "test:");
  const hits = await Promise.all(
    Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment("client")),
  );
  assert.equal(Math.max(...hits.map((h) => h.totalHits)), 20);
  await db.run("UPDATE request_limits SET reset_at=0");
  assert.equal((await a.increment("client")).totalHits, 1);
  await a.resetKey("client");
  assert.equal((await b.increment("client")).totalHits, 1);
  await db.close();
});
