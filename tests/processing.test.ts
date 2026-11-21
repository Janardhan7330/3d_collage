import test from "node:test";
import assert from "node:assert/strict";
import { draftOutdoorWalk, type WalkingSample } from "../src/shared/processing";
import { emptyMap } from "../src/shared/map";
const gps = (
  id: string,
  timestamp: number,
  longitude: number,
  accuracy = 5,
): WalkingSample => ({
  id,
  timestamp,
  longitude,
  latitude: 0,
  accuracy,
  floor: 0,
  type: "gps",
});
test("outdoor processing creates unverified paths without silently asserting accessibility", () => {
  const report = draftOutdoorWalk(emptyMap(), [
    gps("a", 0, 0),
    gps("b", 5000, 0.00005),
    gps("c", 10000, 0.0001),
  ]);
  assert.equal(report.accepted, 3);
  assert.equal(report.map.edges.length, 2);
  assert.ok(report.map.nodes.every((n) => !n.confirmed));
  assert.ok(report.map.edges.every((e) => !e.confirmed && !e.accessible));
});
test("poor GPS, time gaps and paused capture never create bridging paths", () => {
  const report = draftOutdoorWalk(emptyMap(), [
    gps("a", 0, 0),
    gps("bad", 5000, 0.00005, 80),
    gps("b", 10000, 0.0001),
    { id: "pause", timestamp: 11000, type: "pause" },
    gps("c", 15000, 0.0002),
    { id: "resume", timestamp: 16000, type: "resume" },
    gps("d", 20000, 0.0003),
    gps("e", 50000, 0.0004),
  ]);
  assert.equal(report.map.edges.length, 0);
  assert.equal(report.rejected, 2);
});
test("indoor floor samples remain for manual placement, duplicate imports do not duplicate nodes", () => {
  const samples = [
    gps("a", 0, 0),
    {
      ...gps("room", 5000, 0.0001),
      type: "landmark",
      name: "Room 201",
      floor: 2,
    },
  ];
  const first = draftOutdoorWalk(emptyMap(), samples);
  assert.equal(first.landmarksNeedingPlacement, 1);
  assert.equal(draftOutdoorWalk(first.map, samples).map.nodes.length, 1);
});
test("loop closure is proposed for review and never silently snaps coordinates", () => {
  const report = draftOutdoorWalk(emptyMap(), [
    gps("a", 0, 0),
    gps("b", 10000, 0.0001),
    gps("c", 20000, 0.0002),
    gps("d", 30000, 0.0001),
    gps("e", 40000, 0.00001),
  ]);
  assert.ok(report.loopCandidates.some((c) => c.from === "a" && c.to === "e"));
  assert.notEqual(report.map.nodes[0].x, report.map.nodes[4].x);
});
