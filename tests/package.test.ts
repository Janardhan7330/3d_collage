import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { sampleMap } from "../src/shared/map";
import { parseCampusPackage } from "../src/shared/package";
import { androidIdentity, androidLabel } from "../src/server/android";

test("offline packages reject unverified maps and unknown formats", () => {
  const input = {
    format: "3d-college-campus",
    version: 1,
    projectId: "campus",
    revision: 1,
    college: "College",
    map: sampleMap(),
  };
  assert.throws(() => parseCampusPackage(input), /unverified/);
  input.map.nodes.forEach((n) => (n.confirmed = true));
  input.map.edges.forEach((e) => (e.confirmed = true));
  assert.equal(parseCampusPackage(input).demonstration, false);
  assert.throws(() => parseCampusPackage({ ...input, version: 2 }));
});
test("Android identifiers are stable and hostile branding remains XML text", () => {
  const first = androidIdentity("campus-one", 3);
  assert.equal(
    first.applicationId,
    androidIdentity("campus-one", 4).applicationId,
  );
  assert.notEqual(
    first.applicationId,
    androidIdentity("campus-two", 3).applicationId,
  );
  assert.equal(first.versionCode, 4);
  assert.match(first.applicationId, /^com\.campus\.c[a-f0-9]{32}$/);
  assert.equal(
    androidLabel("A&B <College>"),
    "&quot;A&amp;B &lt;College&gt;&quot;",
  );
  assert.throws(() => androidIdentity("campus", -1));
});

test("APK preparation refuses missing campus data instead of inventing a campus", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/prepare-android.ts"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supply your published campus JSON file/);
});
