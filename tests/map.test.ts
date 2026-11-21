import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyMap,
  sampleMap,
  route,
  validateMap,
  mapSchema,
  localPosition,
} from "../src/shared/map";

test("circular routes choose the shorter side and terminate on closed loops", () => {
  const map = sampleMap();
  const result = route(map, "gate", "ring-7");
  assert.equal(result?.distance, 50);
  assert.deepEqual(
    result?.nodes.map((n) => n.id),
    ["gate", "ring-0", "ring-7"],
  );
  assert.equal(route(map, "gate", "gate")?.distance, 0);
});
test("one-way connections and unreachable destinations are respected", () => {
  const map = sampleMap();
  map.edges = [{ ...map.edges[8], bidirectional: false }];
  assert.ok(route(map, "gate", "ring-0"));
  assert.equal(route(map, "ring-0", "gate"), null);
  assert.equal(route(map, "gate", "missing"), null);
});
test("step-free routing avoids stairs even if incorrectly marked accessible", () => {
  const map = sampleMap();
  map.edges[8].kind = "stairs";
  map.edges[8].accessible = true;
  assert.equal(route(map, "gate", "ring-0", true), null);
  assert.ok(route(map, "gate", "ring-0"));
  assert.ok(validateMap(map).some((i) => i.code === "accessible_stairs"));
});
test("invalid, disconnected and unverified maps cannot pass publication checks", () => {
  assert.ok(validateMap(emptyMap()).some((i) => i.severity === "error"));
  const map = sampleMap();
  assert.ok(validateMap(map).some((i) => i.code === "unconfirmed_location"));
  map.nodes.forEach((n) => (n.confirmed = true));
  map.edges.forEach((e) => (e.confirmed = true));
  assert.equal(
    validateMap(map).filter((i) => i.severity === "error").length,
    0,
  );
  map.edges.pop();
  assert.ok(validateMap(map).some((i) => i.code === "disconnected"));
  map.nodes[0].floor = 1;
  assert.ok(validateMap(map).some((i) => i.code === "outdoor_floor"));
});
test("cross-floor paths require explicit stairs, ramps or elevators", () => {
  const map = sampleMap();
  map.nodes.find((n) => n.id === "ring-1")!.floor = 1;
  assert.ok(validateMap(map).some((i) => i.code === "floor_transition"));
  map.edges.find((e) => e.id === "arc-0")!.kind = "elevator";
  assert.ok(
    route(map, "ring-0", "ring-1")!.instructions.some((s) =>
      s.includes("lift to floor 1"),
    ),
  );
});
test("map parsing rejects oversized coordinates, invalid types and non-finite values", () => {
  const map = sampleMap();
  map.nodes[0].x = Infinity;
  assert.equal(mapSchema.safeParse(map).success, false);
  map.nodes[0].x = 100001;
  assert.equal(mapSchema.safeParse(map).success, false);
});
test("GPS conversion preserves local east/north coordinate orientation", () => {
  const p = localPosition(0.001, 0.001, { latitude: 0, longitude: 0 });
  assert.ok(Math.abs(p.x - 111.195) < 0.01);
  assert.ok(Math.abs(p.y - 111.195) < 0.01);
});
test("turn instructions follow east/north coordinates", () => {
  const map = sampleMap();
  map.nodes = map.nodes.slice(0, 3);
  [map.nodes[0].x, map.nodes[0].y] = [0, 0];
  [map.nodes[1].x, map.nodes[1].y] = [10, 0];
  [map.nodes[2].x, map.nodes[2].y] = [10, 10];
  map.edges = [
    { ...map.edges[0], from: map.nodes[0].id, to: map.nodes[1].id },
    { ...map.edges[1], from: map.nodes[1].id, to: map.nodes[2].id },
  ];
  assert.ok(
    route(map, map.nodes[0].id, map.nodes[2].id)!.instructions.some((s) =>
      s.startsWith("Turn left"),
    ),
  );
});
