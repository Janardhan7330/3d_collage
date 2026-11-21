import test from "node:test";
import assert from "node:assert/strict";
import { checkpointCode, readCheckpoint } from "../src/shared/checkpoints";
import { sampleMap } from "../src/shared/map";
test("location checkpoints are scoped to campus and immutable revision", () => {
  const map = sampleMap();
  map.nodes[0].confirmed = true;
  const code = checkpointCode("campus-1", 3, "gate");
  assert.equal(readCheckpoint(code, "campus-1", 3, map).id, "gate");
  assert.throws(
    () => readCheckpoint(code, "campus-2", 3, map),
    /different campus/,
  );
  assert.throws(
    () => readCheckpoint(code, "campus-1", 4, map),
    /different map revision/,
  );
});
test("mapping tokens and unverified locations cannot become navigation checkpoints", () => {
  const map = sampleMap();
  assert.throws(
    () => readCheckpoint("a".repeat(43), "campus-1", 3, map),
    /not a campus location/,
  );
  assert.throws(
    () =>
      readCheckpoint(checkpointCode("campus-1", 3, "gate"), "campus-1", 3, map),
    /not verified/,
  );
  assert.throws(() => checkpointCode("bad:id", 3, "gate"), /Invalid/);
});
