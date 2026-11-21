import { localPosition, type CampusMap, type MapNode } from "./map";

export type WalkingSample = {
  id: string;
  timestamp: number;
  type: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  floor?: number;
  name?: string;
  nickname?: string;
};
export type ProcessingReport = {
  map: CampusMap;
  accepted: number;
  rejected: number;
  landmarksNeedingPlacement: number;
  loopCandidates: { from: string; to: string; separation: number }[];
};

/** Conservative outdoor drafting. No sensor-derived or GPS coordinate is marked verified. */
export function draftOutdoorWalk(
  base: CampusMap,
  samples: WalkingSample[],
): ProcessingReport {
  const map: CampusMap = structuredClone(base);
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  let previous: { sample: WalkingSample; node: MapNode } | null = null;
  let recording = true,
    accepted = 0,
    rejected = 0,
    landmarksNeedingPlacement = 0;
  const loopCandidates: ProcessingReport["loopCandidates"] = [];
  const cells = new Map<string, { node: MapNode; timestamp: number }[]>();
  const known = new Set(map.nodes.map((n) => n.id));
  for (const sample of sorted) {
    if (sample.type === "pause") {
      recording = false;
      previous = null;
      continue;
    }
    if (sample.type === "resume") {
      recording = true;
      previous = null;
      continue;
    }
    if (sample.type === "floor") {
      previous = null;
      continue;
    }
    if (!["gps", "landmark"].includes(sample.type)) continue;
    if (
      !recording ||
      (sample.floor ?? 0) !== 0 ||
      sample.latitude === undefined ||
      sample.longitude === undefined ||
      sample.accuracy === undefined ||
      sample.accuracy > 15 ||
      sample.accuracy < 0
    ) {
      rejected++;
      if (sample.type === "landmark") landmarksNeedingPlacement++;
      previous = null;
      continue;
    }
    if (!map.origin)
      map.origin = { latitude: sample.latitude, longitude: sample.longitude };
    const point = localPosition(sample.latitude, sample.longitude, map.origin);
    const delta = previous
      ? Math.hypot(point.x - previous.node.x, point.y - previous.node.y)
      : 0;
    const seconds = previous
      ? (sample.timestamp - previous.sample.timestamp) / 1000
      : 0;
    if (previous && (seconds > 15 || seconds <= 0 || delta / seconds > 3))
      previous = null;
    if (previous && delta < 3 && sample.type !== "landmark") continue;
    const node: MapNode = {
      id: sample.id,
      name: sample.name ?? `Outdoor path ${accepted + 1}`,
      aliases: sample.nickname ? [sample.nickname] : [],
      category: sample.type === "landmark" ? "Landmark" : "Corridor",
      buildingId: null,
      floor: 0,
      ...point,
      confirmed: false,
    };
    if (known.has(node.id)) {
      previous = null;
      continue;
    }
    known.add(node.id);
    map.nodes.push(node);
    accepted++;
    if (previous) {
      const distance = Math.hypot(
        point.x - previous.node.x,
        point.y - previous.node.y,
      );
      if (distance > 0.1)
        map.edges.push({
          id: `walk-${previous.node.id}-${node.id}`,
          from: previous.node.id,
          to: node.id,
          kind: "path",
          distance: Math.round(distance * 100) / 100,
          points: [],
          accessible: false,
          bidirectional: true,
          confirmed: false,
        });
    }
    const cellX = Math.floor(point.x / 5),
      cellY = Math.floor(point.y / 5);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const candidate of cells.get(`${cellX + dx},${cellY + dy}`) ??
          []) {
          const separation = Math.hypot(
            point.x - candidate.node.x,
            point.y - candidate.node.y,
          );
          if (sample.timestamp - candidate.timestamp > 30000 && separation < 5)
            loopCandidates.push({
              from: candidate.node.id,
              to: node.id,
              separation,
            });
        }
    const cell = `${cellX},${cellY}`;
    const entries = cells.get(cell) ?? [];
    entries.push({ node, timestamp: sample.timestamp });
    cells.set(cell, entries);
    previous = { sample, node };
  }
  return { map, accepted, rejected, landmarksNeedingPlacement, loopCandidates };
}
