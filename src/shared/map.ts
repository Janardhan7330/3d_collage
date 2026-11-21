import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1).max(160);
const coordinate = z.number().finite().min(-100000).max(100000);
export const pointSchema = z.object({ x: coordinate, y: coordinate });
export const nodeSchema = pointSchema.extend({
  id,
  name,
  aliases: z.array(name).max(12),
  category: name,
  buildingId: id.nullable(),
  floor: z.number().int().min(-10).max(150),
  confirmed: z.boolean(),
});
export const edgeSchema = z.object({
  id,
  from: id,
  to: id,
  kind: z.enum(["path", "stairs", "elevator", "ramp"]),
  accessible: z.boolean(),
  bidirectional: z.boolean(),
  confirmed: z.boolean(),
  distance: z.number().positive().max(100000),
  points: z.array(pointSchema).max(1000),
});
export const buildingSchema = z.object({
  id,
  name,
  footprint: z.array(pointSchema).min(3).max(1000),
  floors: z.number().int().min(1).max(150),
  floorHeight: z.number().min(2).max(10),
  geometry: z.enum(["simplified", "measured"]),
});
export const mapSchema = z.object({
  schemaVersion: z.literal(1),
  origin: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
  nodes: z.array(nodeSchema).max(10000),
  edges: z.array(edgeSchema).max(30000),
  buildings: z.array(buildingSchema).max(500),
});
export type CampusMap = z.infer<typeof mapSchema>;
export type MapNode = z.infer<typeof nodeSchema>;
export type MapEdge = z.infer<typeof edgeSchema>;
export type Point = z.infer<typeof pointSchema>;
export const emptyMap = (): CampusMap => ({
  schemaVersion: 1,
  origin: null,
  nodes: [],
  edges: [],
  buildings: [],
});
export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export function validateMap(map: CampusMap): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, message: string) =>
    issues.push({ severity: "error", code, message });
  for (const [label, rows] of [
    ["location", map.nodes],
    ["connection", map.edges],
    ["building", map.buildings],
  ] as const) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id))
        error("duplicate_id", `Duplicate ${label} ID: ${row.id}`);
      seen.add(row.id);
    }
  }
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const buildings = new Map(map.buildings.map((b) => [b.id, b]));
  if (nodes.size < 2)
    error("empty_map", "Add at least two locations and a walking connection.");
  for (const node of map.nodes) {
    if (!node.confirmed)
      error(
        "unconfirmed_location",
        `Confirm the position of ${node.name} on site.`,
      );
    const building = node.buildingId
      ? buildings.get(node.buildingId)
      : undefined;
    if (node.buildingId && !building)
      error("missing_building", `${node.name} references a missing building.`);
    if (!node.buildingId && node.floor !== 0)
      error(
        "outdoor_floor",
        `${node.name} needs a building for a non-ground floor.`,
      );
    if (building && node.floor >= building.floors)
      error(
        "invalid_floor",
        `${node.name} is above the building's highest floor.`,
      );
  }
  const neighbors = new Map(map.nodes.map((n) => [n.id, [] as string[]]));
  for (const edge of map.edges) {
    const a = nodes.get(edge.from),
      b = nodes.get(edge.to);
    if (!a || !b) {
      error(
        "missing_endpoint",
        `Connection ${edge.id} has a missing location.`,
      );
      continue;
    }
    if (a.id === b.id)
      error("self_edge", "A connection must join two distinct locations.");
    if (!edge.confirmed)
      error(
        "unconfirmed_connection",
        `Verify the path from ${a.name} to ${b.name}.`,
      );
    if (a.floor !== b.floor && edge.kind === "path")
      error(
        "floor_transition",
        `Use stairs, a lift or a ramp between ${a.name} and ${b.name}.`,
      );
    if (edge.kind === "stairs" && edge.accessible)
      error("accessible_stairs", "Staircases cannot be marked step-free.");
    const geometry = [a, ...edge.points, b];
    const horizontalLength = geometry
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p.x - geometry[i].x, p.y - geometry[i].y),
        0,
      );
    if (edge.distance + 0.5 < horizontalLength)
      error(
        "short_distance",
        `The distance from ${a.name} to ${b.name} is shorter than its mapped path.`,
      );
    neighbors.get(a.id)?.push(b.id);
    neighbors.get(b.id)?.push(a.id);
  }
  if (map.nodes.length) {
    const seen = new Set<string>(),
      stack = [map.nodes[0].id];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(neighbors.get(n) ?? []));
    }
    if (seen.size !== nodes.size)
      error(
        "disconnected",
        `${nodes.size - seen.size} locations are disconnected from ${map.nodes[0].name}.`,
      );
  }
  if (map.buildings.some((b) => b.geometry === "simplified"))
    issues.push({
      severity: "warning",
      code: "simplified",
      message:
        "Building shapes are simplified reference geometry, not surveyed floor plans.",
    });
  if (map.edges.some((e) => !e.bidirectional))
    issues.push({
      severity: "warning",
      code: "one_way",
      message:
        "One-way paths are present. Check return journeys before publishing.",
    });
  return issues;
}

export type Route = {
  nodes: MapNode[];
  edges: MapEdge[];
  distance: number;
  instructions: string[];
};
export function route(
  map: CampusMap,
  from: string,
  to: string,
  accessible = false,
): Route | null {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  if (!nodes.has(from) || !nodes.has(to)) return null;
  const adjacency = new Map(
    map.nodes.map((n) => [n.id, [] as { to: string; edge: MapEdge }[]]),
  );
  for (const edge of map.edges) {
    if (
      !nodes.has(edge.from) ||
      !nodes.has(edge.to) ||
      (accessible && (!edge.accessible || edge.kind === "stairs"))
    )
      continue;
    adjacency.get(edge.from)!.push({ to: edge.to, edge });
    if (edge.bidirectional)
      adjacency.get(edge.to)!.push({ to: edge.from, edge });
  }
  const distance = new Map<string, number>([[from, 0]]),
    previous = new Map<string, { node: string; edge: MapEdge }>();
  // A binary heap keeps large campus graphs responsive on mobile devices.
  const heap: { id: string; distance: number }[] = [];
  const push = (entry: { id: string; distance: number }) => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].distance <= entry.distance) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].distance < heap[child].distance
        )
          child++;
        if (heap[child].distance >= last.distance) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  push({ id: from, distance: 0 });
  while (heap.length) {
    const current = pop();
    if (current.distance !== distance.get(current.id)) continue;
    if (current.id === to) break;
    for (const next of adjacency.get(current.id)!) {
      const candidate = current.distance + next.edge.distance;
      if (candidate < (distance.get(next.to) ?? Infinity)) {
        distance.set(next.to, candidate);
        previous.set(next.to, { node: current.id, edge: next.edge });
        push({ id: next.to, distance: candidate });
      }
    }
  }
  if (!distance.has(to)) return null;
  const path = [nodes.get(to)!],
    edges: MapEdge[] = [];
  let current = to;
  while (current !== from) {
    const p = previous.get(current)!;
    edges.unshift(p.edge);
    path.unshift(nodes.get(p.node)!);
    current = p.node;
  }
  const instructions = [`Start at ${path[0].name}.`];
  edges.forEach((edge, i) => {
    const a = path[i],
      b = path[i + 1];
    if (
      edge.kind === "stairs" ||
      edge.kind === "elevator" ||
      (edge.kind === "ramp" && a.floor !== b.floor)
    ) {
      instructions.push(
        `Take the ${edge.kind === "elevator" ? "lift" : edge.kind} to floor ${b.floor}, toward ${b.name}.`,
      );
      return;
    }
    let turn = "Continue";
    if (i) {
      const incoming =
        edges[i - 1].from === path[i - 1].id
          ? edges[i - 1].points
          : [...edges[i - 1].points].reverse();
      const outgoing =
        edge.from === a.id ? edge.points : [...edge.points].reverse();
      const prev = incoming.at(-1) ?? path[i - 1],
        next = outgoing[0] ?? b;
      const cross =
        (a.x - prev.x) * (next.y - a.y) - (a.y - prev.y) * (next.x - a.x);
      const dot =
        (a.x - prev.x) * (next.x - a.x) + (a.y - prev.y) * (next.y - a.y);
      const angle = (Math.atan2(cross, dot) * 180) / Math.PI;
      if (Math.abs(angle) > 150) turn = "Turn around";
      else if (angle > 30) turn = "Turn left";
      else if (angle < -30) turn = "Turn right";
    }
    instructions.push(
      `${turn} for ${Math.round(edge.distance)} m to ${b.name}.`,
    );
  });
  instructions.push(`Arrive at ${path[path.length - 1].name}.`);
  return { nodes: path, edges, distance: distance.get(to)!, instructions };
}

export function localPosition(
  latitude: number,
  longitude: number,
  origin: NonNullable<CampusMap["origin"]>,
): Point {
  return {
    x:
      (((longitude - origin.longitude) * Math.PI) / 180) *
      6371000 *
      Math.cos((origin.latitude * Math.PI) / 180),
    y: (((latitude - origin.latitude) * Math.PI) / 180) * 6371000,
  };
}

export function sampleMap(): CampusMap {
  const nodes: MapNode[] = Array.from({ length: 8 }, (_, i) => ({
    id: `ring-${i}`,
    name: [
      "South entrance",
      "Admissions",
      "Computer lab",
      "CSE HOD Room",
      "North stairs",
      "Library",
      "Lecture hall",
      "Student services",
    ][i],
    aliases: i === 3 ? ["CSE HOD"] : [],
    category: i === 0 ? "Entrance" : "Room",
    x: Math.sin((i * Math.PI) / 4) * 25,
    y: -Math.cos((i * Math.PI) / 4) * 25,
    buildingId: "academic",
    floor: 0,
    confirmed: false,
  }));
  nodes.unshift({
    id: "gate",
    name: "Main college gate",
    aliases: ["Main gate"],
    category: "Gate",
    x: 0,
    y: -55,
    buildingId: null,
    floor: 0,
    confirmed: false,
  });
  const edges: MapEdge[] = Array.from({ length: 8 }, (_, i) => ({
    id: `arc-${i}`,
    from: `ring-${i}`,
    to: `ring-${(i + 1) % 8}`,
    kind: "path",
    accessible: true,
    bidirectional: true,
    confirmed: false,
    distance: 20,
    points: [],
  }));
  edges.push({
    id: "approach",
    from: "gate",
    to: "ring-0",
    kind: "path",
    accessible: true,
    bidirectional: true,
    confirmed: false,
    distance: 30,
    points: [],
  });
  return {
    schemaVersion: 1,
    origin: null,
    nodes,
    edges,
    buildings: [
      {
        id: "academic",
        name: "Example circular block",
        footprint: Array.from({ length: 32 }, (_, i) => ({
          x: Math.sin((i * Math.PI) / 16) * 32,
          y: Math.cos((i * Math.PI) / 16) * 32,
        })),
        floors: 2,
        floorHeight: 3.5,
        geometry: "simplified",
      },
    ],
  };
}
