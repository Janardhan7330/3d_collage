import { createHash } from "node:crypto";
import { cp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCampusPackage } from "../shared/package";

export function androidIdentity(projectId: string, revision: number) {
  const stableId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId,
    )
      ? projectId.replace(/-/g, "").toLowerCase()
      : createHash("sha256").update(projectId).digest("hex").slice(0, 32);
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= 2100000000)
    throw new Error("Unsupported Android version number.");
  return {
    applicationId: `com.campus.c${stableId}`,
    versionCode: revision + 1,
  };
}
export function androidLabel(name: string) {
  // JSON quoting preserves apostrophes, backslashes and whitespace in Android resources.
  return JSON.stringify(name).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export async function prepareAndroidAssets(
  directory: string,
  input: unknown,
  offlineDirectory = resolve("dist/offline"),
) {
  const campus = parseCampusPackage(input),
    identity = androidIdentity(campus.projectId, campus.revision);
  const assets = join(directory, "app/src/main/assets"),
    resources = join(directory, "app/src/main/res/values");
  await rm(assets, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });
  await mkdir(resources, { recursive: true });
  await cp(offlineDirectory, assets, { recursive: true });
  await writeFile(join(assets, "campus.json"), JSON.stringify(campus));
  await writeFile(
    join(resources, "strings.xml"),
    `<resources><string name="app_name" formatted="false">${androidLabel(campus.college)}</string></resources>`,
  );
  await writeFile(
    join(directory, "campus-build.properties"),
    `applicationId=${identity.applicationId}\nversionCode=${identity.versionCode}\n`,
  );
  return identity;
}
