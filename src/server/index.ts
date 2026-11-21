import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { openDB, migrate } from "./db";
const production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN ?? "http://localhost:5173";
if (
  production &&
  (!process.env.DATABASE_URL?.startsWith("postgres") ||
    !origin.startsWith("https://"))
)
  throw new Error(
    "Production requires PostgreSQL DATABASE_URL and HTTPS APP_ORIGIN.",
  );
const db = openDB(process.env.DATABASE_URL);
await migrate(db);
const app = createApp(db, {
  origin,
  production,
  webDir: resolve("dist/web"),
  smtpUrl: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM,
  buildsEnabled: process.env.APK_BUILDS_ENABLED === "true",
  artifactDir: process.env.ARTIFACT_DIR,
  trustProxy: Number(process.env.TRUST_PROXY_HOPS ?? 0),
});
const server = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "127.0.0.1",
  () => console.log(`3d_College API listening on ${process.env.PORT ?? 3001}`),
);
const cleanup = setInterval(async () => {
  try {
    const now = Date.now();
    await db.run("DELETE FROM sessions WHERE expires_at<$1", [now]);
    await db.run("DELETE FROM resets WHERE expires_at<$1", [now]);
    await db.run("DELETE FROM request_limits WHERE reset_at<$1", [now]);
  } catch {
    console.error("Expired credential cleanup failed");
  }
}, 3600000);
cleanup.unref();
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(cleanup);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
