import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openDB, migrate } from "../src/server/db";
import { sampleMap } from "../src/shared/map";

for (const key of ["JAVA_HOME", "ANDROID_HOME", "GRADLE_BIN"])
  if (!process.env[key])
    throw new Error(`Set ${key} to run the real worker verification.`);
await mkdir("data/verification", { recursive: true });
const directory = await mkdtemp(resolve("data/verification/worker-"));
const db = openDB(join(directory, "test.sqlite"));
await migrate(db);
const userId = randomUUID(),
  projectId = randomUUID(),
  revisionId = randomUUID(),
  jobId = randomUUID(),
  now = Date.now();
const map = sampleMap();
map.nodes.forEach((n) => (n.confirmed = true));
map.edges.forEach((e) => (e.confirmed = true));
await db.transaction(async (tx) => {
  await tx.run(
    "INSERT INTO users (id,email,name,password,created_at) VALUES ($1,$2,$3,$4,$5)",
    [
      userId,
      `${userId}@example.invalid`,
      "Build verification",
      "no-login",
      now,
    ],
  );
  await tx.run(
    "INSERT INTO projects (id,name,college,location,map,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,1,$6,$6)",
    [
      projectId,
      "Worker test",
      "Fictional Build Verification Campus",
      "Test fixture only",
      JSON.stringify(map),
      now,
    ],
  );
  await tx.run(
    "INSERT INTO revisions (id,project_id,version,map,created_by,created_at) VALUES ($1,$2,1,$3,$4,$5)",
    [revisionId, projectId, JSON.stringify(map), userId, now],
  );
  await tx.run(
    "INSERT INTO builds (id,project_id,revision_id,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
    [jobId, projectId, revisionId, "queued", now],
  );
});
const secret = randomBytes(32).toString("base64url"),
  keystore = join(directory, "throwaway-signing.p12");
function command(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += String(d)));
    child.stderr.on("data", (d) => (output += String(d)));
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${executable} exited ${code}: ${output.replaceAll(secret, "[redacted]")}`,
            ),
          ),
    );
  });
}
let worker: ReturnType<typeof spawn> | undefined;
try {
  await command(
    join(process.env.JAVA_HOME!, "bin/keytool"),
    [
      "-genkeypair",
      "-alias",
      "verification",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "2",
      "-dname",
      "CN=Temporary Build Verification",
      "-storetype",
      "PKCS12",
      "-keystore",
      keystore,
      "-storepass:env",
      "SIGNING_TEST_PASSWORD",
      "-keypass:env",
      "SIGNING_TEST_PASSWORD",
    ],
    { ...process.env, SIGNING_TEST_PASSWORD: secret },
  );
  worker = spawn(process.execPath, ["dist/server/worker.js"], {
    env: {
      ...process.env,
      DATABASE_URL: join(directory, "test.sqlite"),
      ARTIFACT_DIR: join(directory, "artifacts"),
      ANDROID_KEYSTORE: keystore,
      ANDROID_STORE_PASSWORD: secret,
      ANDROID_KEY_ALIAS: "verification",
      ANDROID_KEY_PASSWORD: secret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.stdout?.on("data", (data) => process.stdout.write(data));
  worker.stderr?.on("data", (data) =>
    process.stderr.write(String(data).replaceAll(secret, "[redacted]")),
  );
  let row: { status: string; artifact: string; error: string } | undefined;
  const deadline = Date.now() + 16 * 60000;
  while (Date.now() < deadline) {
    [row] = await db.all(
      "SELECT status,artifact,error FROM builds WHERE id=$1",
      [jobId],
    );
    if (row && ["succeeded", "failed"].includes(row.status)) break;
    if (worker.exitCode !== null)
      throw new Error("Worker exited before job completion.");
    await delay(500);
  }
  if (row?.status !== "succeeded")
    throw new Error(row?.error ?? "Worker verification timed out.");
  const artifact = join(directory, "artifacts", row.artifact);
  await command(
    join(process.env.ANDROID_HOME!, "build-tools/35.0.0/apksigner"),
    ["verify", "--verbose", artifact],
  );
  await writeFile(
    join(directory, "verification.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        jobId,
        projectId,
        status: "succeeded",
        signatureVerified: true,
        artifact,
        signing: "throwaway test key, not a production identity",
      },
      null,
      2,
    ),
  );
  console.log(
    "Real worker job succeeded and APK signature verified. Test key will now be deleted.",
  );
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => worker!.once("exit", r)),
      delay(5000),
    ]);
    if (worker.exitCode === null) worker.kill("SIGKILL");
  }
  await db.close();
  await rm(keystore, { force: true });
}
