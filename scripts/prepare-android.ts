import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareAndroidAssets } from "../src/server/android";
import { sampleMap } from "../src/shared/map";

const file = process.argv[2];
let input: unknown;
if (!file)
  throw new Error(
    "Supply your published campus JSON file. Fictional test data requires the explicit --demo flag.",
  );
if (file === "--demo") {
  const map = sampleMap();
  map.nodes.forEach((n) => (n.confirmed = true));
  map.edges.forEach((e) => (e.confirmed = true));
  input = {
    format: "3d-college-campus",
    version: 1,
    projectId: "demonstration-campus",
    revision: 1,
    college: "Campus Navigator Demo",
    demonstration: true,
    map,
  };
} else {
  const path = resolve(file);
  if (!path.startsWith(resolve(".") + "/") || !path.endsWith(".json"))
    throw new Error("Choose a campus JSON file inside this checkout.");
  input = JSON.parse(await readFile(path, "utf8"));
}
const identity = await prepareAndroidAssets(resolve("android"), input);
console.log(
  `Prepared ${identity.applicationId}, version ${identity.versionCode}. ${file === "--demo" ? "Demonstration only." : "Use only at the verified campus."}`,
);
