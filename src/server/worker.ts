import "dotenv/config";
import { mkdtemp, cp, mkdir, rm, copyFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { openDB, migrate } from "./db";
import { mapSchema, validateMap } from "../shared/map";
import { prepareAndroidAssets } from "./android";

const db = openDB(process.env.DATABASE_URL);
await migrate(db);
const artifactDir = resolve(process.env.ARTIFACT_DIR ?? "artifacts");
const gradle = process.env.GRADLE_BIN ?? "gradle";
const required = [
  "ANDROID_HOME",
  "JAVA_HOME",
  "ANDROID_KEYSTORE",
  "ANDROID_STORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];
for (const key of required)
  if (!process.env[key])
    throw new Error(`Worker configuration missing: ${key}`);
await access(process.env.ANDROID_KEYSTORE!);
await access(resolve("dist/offline/offline.html"));
await mkdir(artifactDir, { recursive: true });
function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        GRADLE_USER_HOME:
          process.env.WORKER_GRADLE_CACHE ?? join(cwd, ".gradle-cache"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Raw Gradle output is deliberately not exposed to users: it can include signing paths.
    child.stdout.resume();
    child.stderr.resume();
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Android build exceeded 15 minutes."));
    }, 15 * 60000);
    child.once("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Android build exited with code ${code}. Check the worker SDK and signing configuration.`,
            ),
          );
    });
  });
}
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
console.log("APK worker ready");
while (!stopping) {
  await db.run(
    "UPDATE builds SET status='failed',error='Worker stopped before completion. Request a new build.',updated_at=$1 WHERE status='running' AND updated_at<$2",
    [Date.now(), Date.now() - 20 * 60000],
  );
  const [job] = await db.all<{
    id: string;
    project_id: string;
    revision_id: string;
  }>(
    "UPDATE builds SET status='running',updated_at=$1 WHERE id=(SELECT id FROM builds WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING id,project_id,revision_id",
    [Date.now()],
  );
  if (!job) {
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  const dir = await mkdtemp(join(tmpdir(), "campus-build-"));
  try {
    const [data] = await db.all<{
      map: string;
      version: number;
      college: string;
    }>(
      "SELECT r.map,r.version,p.college FROM revisions r JOIN projects p ON p.id=r.project_id WHERE r.id=$1 AND r.project_id=$2",
      [job.revision_id, job.project_id],
    );
    if (!data) throw new Error("Map revision was not found.");
    const map = mapSchema.parse(JSON.parse(data.map));
    if (validateMap(map).some((i) => i.severity === "error"))
      throw new Error("Map revision failed validation.");
    await cp(resolve("android"), dir, {
      recursive: true,
      filter: (source) =>
        !source
          .split(/[\\/]/)
          .some((part) =>
            ["build", ".gradle", "local.properties"].includes(part),
          ),
    });
    const identity = await prepareAndroidAssets(dir, {
      format: "3d-college-campus",
      version: 1,
      college: data.college,
      projectId: job.project_id,
      revision: data.version,
      map,
    });
    await run(
      gradle,
      [
        "--no-daemon",
        "--console=plain",
        `-PcampusPackage=${identity.applicationId}`,
        `-PcampusVersion=${identity.versionCode}`,
        "assembleRelease",
      ],
      dir,
    );
    const artifact = `${job.id}.apk`;
    await copyFile(
      join(dir, "app/build/outputs/apk/release/app-release.apk"),
      join(artifactDir, artifact),
    );
    await db.run(
      "UPDATE builds SET status='succeeded',artifact=$1,updated_at=$2 WHERE id=$3",
      [artifact, Date.now(), job.id],
    );
    console.log(JSON.stringify({ build: job.id, status: "succeeded" }));
  } catch (error) {
    const message =
      error instanceof Error && error.message.startsWith("Android build")
        ? error.message
        : "Build could not complete. Check worker configuration and map package.";
    await db.run(
      "UPDATE builds SET status='failed',error=$1,updated_at=$2 WHERE id=$3",
      [message, Date.now(), job.id],
    );
    console.error(
      JSON.stringify({ build: job.id, status: "failed", error: message }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
await db.close();
