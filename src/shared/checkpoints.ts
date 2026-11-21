import type { CampusMap, MapNode } from "./map";

const identifier = /^[A-Za-z0-9_-]{1,80}$/;
export function checkpointCode(
  projectId: string,
  revision: number,
  nodeId: string,
): string {
  if (
    !identifier.test(projectId) ||
    !identifier.test(nodeId) ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw new Error("Invalid checkpoint identifiers.");
  return `campus-location:1:${projectId}:${revision}:${nodeId}`;
}

export function readCheckpoint(
  code: string,
  projectId: string,
  revision: number,
  map: CampusMap,
): MapNode {
  const parts = code.trim().split(":");
  if (
    parts.length !== 5 ||
    parts[0] !== "campus-location" ||
    parts[1] !== "1" ||
    !identifier.test(parts[2]) ||
    !identifier.test(parts[4]) ||
    !/^\d+$/.test(parts[3])
  )
    throw new Error(
      "This is not a campus location checkpoint. Mapping connection codes cannot set your location.",
    );
  if (parts[2] !== projectId)
    throw new Error("This checkpoint belongs to a different campus.");
  if (Number(parts[3]) !== revision)
    throw new Error(
      "This checkpoint is for a different map revision. Use a matching app version or choose a known starting location.",
    );
  const node = map.nodes.find((n) => n.id === parts[4]);
  if (!node || !node.confirmed)
    throw new Error(
      "This location is not verified in the installed campus map.",
    );
  return node;
}
