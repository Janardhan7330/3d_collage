import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { access, mkdir, writeFile, rm, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tunnelOrigin } from "../src/shared/phone-connection";
import { setTimeout as delay } from "node:timers/promises";

// A temporary authenticated preview, not production hosting. No Vite/source server is exposed.
const binary =
  process.env.CLOUDFLARED_BIN ?? resolve("data/toolchain/phone/cloudflared");
const useCloudflare = process.env.PHONE_TUNNEL === "cloudflare";
if (useCloudflare) await access(binary);
await access(resolve("dist/server/index.js"));
await mkdir("data/verification", { recursive: true });
const reservation = createServer();
await new Promise<void>((ok, fail) => {
  reservation.once("error", fail);
  reservation.listen(0, "127.0.0.1", ok);
});
const port = (reservation.address() as { port: number }).port;
const children: ChildProcess[] = [];
let stopping = false;
const statePath = resolve("data/phone-preview.json");
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  reservation.close();
  for (const child of children) child.kill("SIGTERM");
  void rm(statePath, { force: true }).finally(() => {
    process.exitCode = code;
  });
  setTimeout(() => process.exit(code), 5000).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
try {
  let tunnel: ChildProcess;
  if (useCloudflare) {
    tunnel = spawn(
      binary,
      [
        "tunnel",
        "--url",
        `http://127.0.0.1:${port}`,
        "--protocol",
        "http2",
        "--no-autoupdate",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } else {
    // Pin the provider's published ED25519 fingerprint; never modify the user's SSH configuration.
    // https://localhost.run/docs/security
    const key = execFileSync(
      "ssh-keyscan",
      ["-T", "10", "-t", "ed25519", "localhost.run"],
      { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] },
    );
    const fingerprint = execFileSync("ssh-keygen", ["-lf", "-"], {
      input: key,
      encoding: "utf8",
    });
    if (
      !fingerprint.includes(
        "SHA256:pG6qrBxubYfWa1Zadu/V0NUgjEDiBds/7e2xzte/QNM",
      )
    )
      throw new Error(
        "Phone tunnel host key does not match the provider's published fingerprint.",
      );
    const knownHosts = resolve("data/verification/phone-known-hosts");
    await writeFile(knownHosts, key);
    tunnel = spawn(
      "ssh",
      [
        "-F",
        "/dev/null",
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "IdentityAgent=none",
        "-o",
        "IdentityFile=/dev/null",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        `UserKnownHostsFile=${knownHosts}`,
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "ExitOnForwardFailure=yes",
        "-R",
        `80:127.0.0.1:${port}`,
        "nokey@localhost.run",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  }
  children.push(tunnel);
  tunnel.on("exit", (code) => {
    if (!stopping) {
      console.error(
        `Phone connection stopped (${code}). Run npm run phone again for a new link.`,
      );
      stop(1);
    }
  });
  const origin = await new Promise<string>((ok, fail) => {
    let buffer = "";
    const timer = setTimeout(
      () => fail(new Error("Timed out creating the HTTPS phone link.")),
      90_000,
    );
    const read = (chunk: Buffer) => {
      void appendFile("data/verification/phone-tunnel.log", chunk).catch(
        () => {},
      );
      buffer = (buffer + chunk.toString()).slice(-16000);
      const detectedOrigin = tunnelOrigin(buffer);
      if (detectedOrigin) {
        clearTimeout(timer);
        ok(detectedOrigin);
      }
    };
    tunnel.stdout!.on("data", read);
    tunnel.stderr!.on("data", read);
    tunnel.once("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    tunnel.once("exit", () => {
      clearTimeout(timer);
      fail(new Error("Could not create the phone connection."));
    });
  });
  await new Promise<void>((ok) => reservation.close(() => ok()));
  const server = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "dist/server/index.js"],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        APP_ORIGIN: origin,
        HOST: "127.0.0.1",
        PORT: String(port),
        TRUST_PROXY_HOPS: "1",
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  children.push(server);
  server.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  server.on("exit", (code) => {
    if (!stopping) {
      console.error(`Studio stopped (${code}).`);
      stop(1);
    }
  });
  let ready = false;
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup is still in progress. */
    }
    await delay(500);
  }
  if (!ready) throw new Error("Studio did not become ready.");
  console.log(`Checking the public HTTPS connection: ${origin}`);
  let connectionError = "";
  let publicReady = false;
  for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && (await response.json()).phoneConnection?.available) {
        publicReady = true;
        break;
      }
      connectionError = `HTTP ${response.status}`;
    } catch (error) {
      connectionError =
        error instanceof Error
          ? `${error.message}: ${String(error.cause ?? "")}`
          : String(error);
    }
    await delay(1000);
  }
  if (!publicReady)
    throw new Error(
      `The public phone link could not be reached (${connectionError}). Check data/verification/phone-tunnel.log.`,
    );
  await mkdir("data", { recursive: true });
  await writeFile(
    statePath,
    JSON.stringify(
      { origin, port, startedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(
    `\nOpen this studio link on your computer: ${origin}\nSign in, create your empty campus, choose Mobile mapping, then generate and scan a new QR.\nThis temporary URL is publicly reachable; project access still requires sign-in or a single-use pairing code.\nKeep this command and computer running. Ctrl+C stops phone access.\n`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop(1);
}
