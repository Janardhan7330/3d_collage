import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import nodemailer from "nodemailer";
import type { DB } from "./db";
import { DatabaseRateStore } from "./rate-store";
import {
  HttpError,
  token,
  hash,
  passwordHash,
  checkPassword,
} from "./security";
import { emptyMap, mapSchema, validateMap } from "../shared/map";

type User = { id: string; email: string; name: string };
type Project = {
  id: string;
  name: string;
  college: string;
  location: string;
  map: string;
  version: number;
  role: string;
  created_at: number;
  updated_at: number;
};
type Mapping = {
  id: string;
  project_id: string;
  status: string;
  device_expires: number;
};
export type Config = {
  origin: string;
  production?: boolean;
  webDir?: string;
  artifactDir?: string;
  smtpUrl?: string;
  mailFrom?: string;
  buildsEnabled?: boolean;
  trustProxy?: number;
};
const password = z.string().min(12, "Use at least 12 characters.").max(128);
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const label = z.string().trim().min(1).max(160);
const credentials = z.object({ email, password });
const projectInput = z.object({
  name: label,
  college: label,
  location: z.string().trim().max(300),
});

export function createApp(db: DB, config: Config) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "script-src": ["'self'"],
          "upgrade-insecure-requests": config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "8mb" }));
  app.use(cookieParser());
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 240,
      store: new DatabaseRateStore(db, "api:"),
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin !== config.origin)
        return next(new HttpError(403, "Request origin is not allowed."));
      if (!req.is("application/json"))
        return next(new HttpError(415, "Send JSON requests."));
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    store: new DatabaseRateStore(db, "auth:"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use("/api/auth", authLimit);
  app.use("/api/pair", authLimit);
  const cookieOptions = {
    httpOnly: true,
    secure: !!config.production,
    sameSite: "strict" as const,
    path: "/",
  };
  async function session(res: Response, userId: string) {
    const raw = token();
    await db.run(
      "INSERT INTO sessions (hash,user_id,expires_at) VALUES ($1,$2,$3)",
      [hash(raw), userId, Date.now() + 7 * 86400000],
    );
    res.cookie("campus_session", raw, {
      ...cookieOptions,
      maxAge: 7 * 86400000,
    });
  }
  async function user(req: Request): Promise<User> {
    const raw = req.cookies.campus_session;
    if (typeof raw !== "string") throw new HttpError(401, "Please sign in.");
    const [row] = await db.all<User>(
      "SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=$1 AND s.expires_at>$2",
      [hash(raw), Date.now()],
    );
    if (!row) throw new HttpError(401, "Please sign in again.");
    return row;
  }
  async function project(req: Request, roles?: string[]) {
    const u = await user(req);
    const [p] = await db.all<Project>(
      "SELECT p.*,m.role FROM projects p JOIN memberships m ON m.project_id=p.id WHERE p.id=$1 AND m.user_id=$2",
      [req.params.id, u.id],
    );
    if (!p) throw new HttpError(404, "Project not found.");
    if (roles && !roles.includes(p.role))
      throw new HttpError(403, "Your project role cannot perform this action.");
    return { u, p };
  }
  const audit = (
    tx: DB,
    projectId: string,
    userId: string,
    action: string,
    details = "",
  ) =>
    tx.run(
      "INSERT INTO audit (id,project_id,user_id,action,details,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), projectId, userId, action, details, Date.now()],
    );
  const serialize = (p: Project) => ({
    ...p,
    map: mapSchema.parse(JSON.parse(p.map)),
    version: Number(p.version),
  });

  app.get("/api/health", async (_req, res) => {
    await db.all("SELECT 1");
    res.json({ status: "ok", apkBuildsEnabled: !!config.buildsEnabled });
  });
  app.post("/api/auth/register", async (req, res) => {
    const input = credentials.extend({ name: label }).parse(req.body);
    const digest = await passwordHash(input.password);
    const id = randomUUID();
    try {
      await db.run(
        "INSERT INTO users (id,email,name,password,created_at) VALUES ($1,$2,$3,$4,$5)",
        [id, input.email, input.name, digest, Date.now()],
      );
    } catch (e) {
      if (
        String(e).includes("UNIQUE") ||
        (e as { code?: string }).code === "23505"
      )
        throw new HttpError(
          409,
          "Unable to register this email. Try signing in or recovering your account.",
        );
      throw e;
    }
    await session(res, id);
    res.status(201).json({ id, name: input.name, email: input.email });
  });
  const dummyHash = passwordHash(token());
  app.post("/api/auth/login", async (req, res) => {
    const input = credentials.parse(req.body);
    const [found] = await db.all<User & { password: string }>(
      "SELECT * FROM users WHERE email=$1",
      [input.email],
    );
    const valid = await checkPassword(
      input.password,
      found?.password ?? (await dummyHash),
    );
    if (!found || !valid)
      throw new HttpError(401, "Email or password is incorrect.");
    await session(res, found.id);
    res.json({ id: found.id, email: found.email, name: found.name });
  });
  app.get("/api/auth/me", async (req, res) => res.json(await user(req)));
  app.post("/api/auth/logout", async (req, res) => {
    if (typeof req.cookies.campus_session === "string")
      await db.run("DELETE FROM sessions WHERE hash=$1", [
        hash(req.cookies.campus_session),
      ]);
    res.clearCookie("campus_session", cookieOptions);
    res.json({ ok: true });
  });
  app.post("/api/auth/recover", async (req, res) => {
    const input = z.object({ email }).parse(req.body);
    if (!config.smtpUrl || !config.mailFrom)
      throw new HttpError(
        503,
        "Account recovery email is not configured. Contact the platform operator.",
      );
    const [found] = await db.all<User>(
      "SELECT id,email,name FROM users WHERE email=$1",
      [input.email],
    );
    if (found) {
      const raw = token();
      await db.run(
        "INSERT INTO resets (hash,user_id,expires_at) VALUES ($1,$2,$3)",
        [hash(raw), found.id, Date.now() + 30 * 60000],
      );
      // Tokens stay out of application logs and URL query strings.
      await nodemailer.createTransport(config.smtpUrl).sendMail({
        from: config.mailFrom,
        to: found.email,
        subject: "Reset your 3d_College password",
        text: `Open this link within 30 minutes to reset your password: ${config.origin}/#reset=${raw}\nIf you did not request this, ignore this email.`,
      });
    }
    res.json({ message: "If an account exists, a reset link has been sent." });
  });
  app.post("/api/auth/reset", async (req, res) => {
    const input = z
      .object({ token: z.string().min(40).max(100), password })
      .parse(req.body);
    const digest = await passwordHash(input.password);
    await db.transaction(async (tx) => {
      const rows = await tx.all<{ user_id: string }>(
        "DELETE FROM resets WHERE hash=$1 AND expires_at>$2 RETURNING user_id",
        [hash(input.token), Date.now()],
      );
      if (!rows[0])
        throw new HttpError(400, "Reset link is invalid or expired.");
      const uid = rows[0].user_id;
      await tx.run("UPDATE users SET password=$1 WHERE id=$2", [digest, uid]);
      await tx.run("DELETE FROM sessions WHERE user_id=$1", [uid]);
      await tx.run("DELETE FROM resets WHERE user_id=$1", [uid]);
    });
    res.json({ ok: true });
  });
  app.patch("/api/auth/profile", async (req, res) => {
    const u = await user(req);
    const input = z.object({ name: label }).parse(req.body);
    await db.run("UPDATE users SET name=$1 WHERE id=$2", [input.name, u.id]);
    res.json({ ...u, name: input.name });
  });

  app.get("/api/projects", async (req, res) => {
    const u = await user(req);
    res.json(
      await db.all(
        "SELECT p.id,p.name,p.college,p.location,p.version,p.updated_at,m.role FROM projects p JOIN memberships m ON p.id=m.project_id WHERE m.user_id=$1 ORDER BY p.updated_at DESC",
        [u.id],
      ),
    );
  });
  app.post("/api/projects", async (req, res) => {
    const u = await user(req);
    const input = projectInput.parse(req.body);
    const id = randomUUID(),
      now = Date.now();
    await db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO projects (id,name,college,location,map,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,0,$6,$6)",
        [
          id,
          input.name,
          input.college,
          input.location,
          JSON.stringify(emptyMap()),
          now,
        ],
      );
      await tx.run(
        "INSERT INTO memberships (project_id,user_id,role) VALUES ($1,$2,$3)",
        [id, u.id, "owner"],
      );
      await audit(tx, id, u.id, "project.created");
    });
    res.status(201).json({ id });
  });
  app.get("/api/projects/:id", async (req, res) => {
    const { p } = await project(req);
    res.json(serialize(p));
  });
  app.patch("/api/projects/:id", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor"]);
    const input = projectInput.parse(req.body);
    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE projects SET name=$1,college=$2,location=$3,updated_at=$4 WHERE id=$5",
        [input.name, input.college, input.location, Date.now(), p.id],
      );
      await audit(tx, p.id, u.id, "project.updated");
    });
    res.json({ ok: true });
  });
  app.put("/api/projects/:id/map", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor"]);
    const input = z
      .object({ version: z.number().int().nonnegative(), map: mapSchema })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const count = await tx.run(
        "UPDATE projects SET map=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4",
        [JSON.stringify(input.map), Date.now(), p.id, input.version],
      );
      if (!count)
        throw new HttpError(
          409,
          "Another editor saved changes. Reload the project before saving again.",
        );
      await audit(tx, p.id, u.id, "map.saved", String(input.version + 1));
    });
    res.json({ version: input.version + 1, issues: validateMap(input.map) });
  });
  app.get("/api/projects/:id/validate", async (req, res) => {
    const { p } = await project(req);
    res.json({ issues: validateMap(mapSchema.parse(JSON.parse(p.map))) });
  });
  app.post("/api/projects/:id/revisions", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor", "reviewer"]);
    const { version } = z.object({ version: z.number().int() }).parse(req.body);
    if (version !== p.version)
      throw new HttpError(409, "The map changed. Review the latest version.");
    const map = mapSchema.parse(JSON.parse(p.map));
    const issues = validateMap(map);
    if (issues.some((i) => i.severity === "error")) {
      res
        .status(422)
        .json({ error: "Resolve map errors before publishing.", issues });
      return;
    }
    const id = randomUUID();
    const revisionId = await db.transaction(async (tx) => {
      const [existing] = await tx.all<{ id: string }>(
        "SELECT id FROM revisions WHERE project_id=$1 AND version=$2",
        [p.id, p.version],
      );
      if (existing) return existing.id;
      const inserted = await tx.run(
        "INSERT INTO revisions (id,project_id,version,map,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,version) DO NOTHING",
        [id, p.id, p.version, p.map, u.id, Date.now()],
      );
      if (inserted) {
        await audit(tx, p.id, u.id, "map.published", id);
        return id;
      }
      const [concurrent] = await tx.all<{ id: string }>(
        "SELECT id FROM revisions WHERE project_id=$1 AND version=$2",
        [p.id, p.version],
      );
      return concurrent.id;
    });
    res.status(201).json({ id: revisionId });
  });
  app.get("/api/projects/:id/revisions", async (req, res) => {
    const { p } = await project(req);
    res.json(
      await db.all(
        "SELECT id,version,created_at FROM revisions WHERE project_id=$1 ORDER BY version DESC",
        [p.id],
      ),
    );
  });
  app.post("/api/projects/:id/restore", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor"]);
    const input = z
      .object({ revisionId: z.string().uuid(), version: z.number().int() })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const [revision] = await tx.all<{ map: string }>(
        "SELECT map FROM revisions WHERE id=$1 AND project_id=$2",
        [input.revisionId, p.id],
      );
      if (!revision) throw new HttpError(404, "Revision not found.");
      const changed = await tx.run(
        "UPDATE projects SET map=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4",
        [revision.map, Date.now(), p.id, input.version],
      );
      if (!changed)
        throw new HttpError(409, "Map changed. Reload before restoring.");
      await audit(tx, p.id, u.id, "map.restored", input.revisionId);
    });
    res.json({ ok: true });
  });
  app.get("/api/projects/:id/export/:revisionId", async (req, res) => {
    const { p } = await project(req);
    const [r] = await db.all<{ map: string; version: number }>(
      "SELECT map,version FROM revisions WHERE id=$1 AND project_id=$2",
      [req.params.revisionId, p.id],
    );
    if (!r) throw new HttpError(404, "Revision not found.");
    res.attachment(`campus-${p.id}-v${r.version}.json`).json({
      format: "3d-college-campus",
      version: 1,
      college: p.college,
      projectId: p.id,
      revision: r.version,
      map: JSON.parse(r.map),
    });
  });

  app.get("/api/projects/:id/members", async (req, res) => {
    const { p } = await project(req);
    res.json(
      await db.all(
        "SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1",
        [p.id],
      ),
    );
  });
  app.post("/api/projects/:id/members", async (req, res) => {
    const { p, u } = await project(req, ["owner"]);
    const input = z
      .object({ email, role: z.enum(["editor", "mapper", "reviewer"]) })
      .parse(req.body);
    const [member] = await db.all<User>("SELECT id FROM users WHERE email=$1", [
      input.email,
    ]);
    if (!member)
      throw new HttpError(404, "This person must create an account first.");
    if (member.id === u.id)
      throw new HttpError(400, "The owner role cannot be changed here.");
    await db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO memberships (project_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role",
        [p.id, member.id, input.role],
      );
      await audit(tx, p.id, u.id, "member.updated", member.id);
      if (input.role === "reviewer")
        await tx.run(
          "UPDATE mapping_sessions SET status='finished',pair_hash=NULL,device_hash=NULL WHERE project_id=$1 AND created_by=$2",
          [p.id, member.id],
        );
    });
    res.json({ ok: true });
  });
  app.delete("/api/projects/:id/members/:memberId", async (req, res) => {
    const { p, u } = await project(req, ["owner"]);
    if (u.id === req.params.memberId)
      throw new HttpError(400, "The owner cannot remove themselves.");
    await db.transaction(async (tx) => {
      await tx.run(
        "DELETE FROM memberships WHERE project_id=$1 AND user_id=$2",
        [p.id, req.params.memberId],
      );
      await tx.run(
        "UPDATE mapping_sessions SET status='finished',pair_hash=NULL,device_hash=NULL WHERE project_id=$1 AND created_by=$2",
        [p.id, req.params.memberId],
      );
      await audit(
        tx,
        p.id,
        u.id,
        "member.removed",
        String(req.params.memberId),
      );
    });
    res.json({ ok: true });
  });
  app.get("/api/projects/:id/audit", async (req, res) => {
    const { p } = await project(req, ["owner", "reviewer"]);
    res.json(
      await db.all(
        "SELECT a.id,a.action,a.details,a.created_at,u.name FROM audit a JOIN users u ON a.user_id=u.id WHERE a.project_id=$1 ORDER BY a.created_at DESC LIMIT 100",
        [p.id],
      ),
    );
  });

  app.get("/api/projects/:id/mapping", async (req, res) => {
    const { p } = await project(req);
    res.json(
      await db.all(
        "SELECT s.id,s.status,s.created_at,(SELECT COUNT(*) FROM samples x WHERE x.session_id=s.id) AS sample_count FROM mapping_sessions s WHERE s.project_id=$1 ORDER BY s.created_at DESC",
        [p.id],
      ),
    );
  });
  app.post("/api/projects/:id/mapping", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor", "mapper"]);
    const id = randomUUID(),
      raw = token(),
      expires = Date.now() + 10 * 60000;
    await db.run(
      "INSERT INTO mapping_sessions (id,project_id,created_by,pair_hash,pair_expires,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id, p.id, u.id, hash(raw), expires, "waiting", Date.now()],
    );
    res.status(201).json({
      id,
      token: raw,
      expiresAt: expires,
      url: `${config.origin}/#pair=${raw}`,
    });
  });
  app.post("/api/pair/claim", async (req, res) => {
    const input = z
      .object({ token: z.string().min(40).max(100) })
      .parse(req.body);
    const raw = token();
    const rows = await db.all<{ id: string; project_id: string }>(
      "UPDATE mapping_sessions SET pair_hash=NULL,device_hash=$1,device_expires=$2,status=$3 WHERE pair_hash=$4 AND pair_expires>$5 AND status=$6 RETURNING id,project_id",
      [
        hash(raw),
        Date.now() + 24 * 3600000,
        "recording",
        hash(input.token),
        Date.now(),
        "waiting",
      ],
    );
    if (!rows[0])
      throw new HttpError(
        400,
        "Connection code is expired or already used. Create a new session.",
      );
    res.cookie("campus_device", raw, {
      ...cookieOptions,
      maxAge: 24 * 3600000,
    });
    res.json({ id: rows[0].id });
  });
  app.post(
    "/api/projects/:id/mapping/:sessionId/reconnect",
    async (req, res) => {
      const { p, u } = await project(req, ["owner", "editor", "mapper"]);
      const [s] = await db.all<{
        id: string;
        created_by: string;
        status: string;
      }>(
        "SELECT id,created_by,status FROM mapping_sessions WHERE id=$1 AND project_id=$2",
        [req.params.sessionId, p.id],
      );
      if (!s) throw new HttpError(404, "Mapping session not found.");
      if (p.role === "mapper" && s.created_by !== u.id)
        throw new HttpError(
          403,
          "You can reconnect only your own mapping sessions.",
        );
      if (s.status === "finished")
        throw new HttpError(
          409,
          "This session was finished. Create a new walk instead.",
        );
      const raw = token(),
        expires = Date.now() + 10 * 60000;
      await db.run(
        "UPDATE mapping_sessions SET pair_hash=$1,pair_expires=$2,device_hash=NULL,device_expires=NULL,status='waiting' WHERE id=$3",
        [hash(raw), expires, s.id],
      );
      res.json({
        id: s.id,
        token: raw,
        expiresAt: expires,
        url: `${config.origin}/#pair=${raw}`,
      });
    },
  );
  async function device(req: Request) {
    const raw = req.cookies.campus_device;
    if (typeof raw !== "string")
      throw new HttpError(401, "Connect this phone with a new QR code.");
    const [s] = await db.all<Mapping>(
      "SELECT s.id,s.project_id,s.status,s.device_expires FROM mapping_sessions s JOIN memberships m ON m.project_id=s.project_id AND m.user_id=s.created_by WHERE s.device_hash=$1 AND s.device_expires>$2 AND m.role IN ('owner','editor','mapper')",
      [hash(raw), Date.now()],
    );
    if (!s || s.status === "finished")
      throw new HttpError(401, "Mapping session has ended.");
    return s;
  }
  app.get("/api/device", async (req, res) => {
    const s = await device(req);
    const [p] = await db.all<{ name: string; college: string }>(
      "SELECT name,college FROM projects WHERE id=$1",
      [s.project_id],
    );
    res.json({ ...s, project: p });
  });
  const sample = z.object({
    id: z.string().uuid(),
    timestamp: z.number().int().nonnegative(),
    type: z.enum([
      "gps",
      "motion",
      "orientation",
      "landmark",
      "floor",
      "pause",
      "resume",
    ]),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracy: z.number().min(0).max(100000).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    z: z.number().finite().optional(),
    name: label.optional(),
    nickname: z.string().max(160).optional(),
    floor: z.number().int().min(-10).max(150).optional(),
  });
  app.post("/api/device/samples", async (req, res) => {
    const s = await device(req);
    const input = z
      .object({
        sessionId: z.string().uuid(),
        events: z.array(sample).min(1).max(100),
      })
      .parse(req.body);
    if (input.sessionId !== s.id)
      throw new HttpError(
        409,
        "This phone is connected to another mapping session. Reconnect the original session before uploading these measurements.",
      );
    await db.transaction(async (tx) => {
      for (const event of input.events)
        await tx.run(
          "INSERT INTO samples (session_id,event_id,data,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT(session_id,event_id) DO NOTHING",
          [s.id, event.id, JSON.stringify(event), Date.now()],
        );
    });
    res.json({ accepted: input.events.map((e) => e.id) });
  });
  app.post("/api/device/finish", async (req, res) => {
    const s = await device(req);
    const { sessionId } = z
      .object({ sessionId: z.string().uuid() })
      .parse(req.body);
    if (sessionId !== s.id)
      throw new HttpError(409, "The phone is connected to another session.");
    await db.run(
      "UPDATE mapping_sessions SET status=$1,device_hash=NULL WHERE id=$2",
      ["finished", s.id],
    );
    res.clearCookie("campus_device", cookieOptions);
    res.json({ ok: true });
  });
  app.post("/api/projects/:id/mapping/:sessionId/revoke", async (req, res) => {
    const { p } = await project(req, ["owner", "editor"]);
    await db.run(
      "UPDATE mapping_sessions SET status=$1,device_hash=NULL,pair_hash=NULL WHERE id=$2 AND project_id=$3",
      ["finished", req.params.sessionId, p.id],
    );
    res.json({ ok: true });
  });
  app.get("/api/projects/:id/mapping/:sessionId/samples", async (req, res) => {
    const { p } = await project(req);
    const [s] = await db.all(
      "SELECT id FROM mapping_sessions WHERE id=$1 AND project_id=$2",
      [req.params.sessionId, p.id],
    );
    if (!s) throw new HttpError(404, "Mapping session not found.");
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000000)
      .parse(req.query.offset ?? 0);
    const rows = await db.all<{ data: string }>(
      "SELECT data FROM samples WHERE session_id=$1 ORDER BY created_at,event_id LIMIT 1000 OFFSET $2",
      [req.params.sessionId, offset],
    );
    res.json({
      events: rows.map((r) => JSON.parse(r.data)),
      nextOffset: rows.length === 1000 ? offset + 1000 : null,
    });
  });

  app.get("/api/projects/:id/builds", async (req, res) => {
    const { p } = await project(req);
    res.json(
      await db.all(
        "SELECT id,revision_id,status,error,created_at,updated_at FROM builds WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100",
        [p.id],
      ),
    );
  });
  app.post("/api/projects/:id/builds", async (req, res) => {
    const { p, u } = await project(req, ["owner", "editor"]);
    const input = z.object({ revisionId: z.string().uuid() }).parse(req.body);
    const [r] = await db.all<{ map: string }>(
      "SELECT map FROM revisions WHERE id=$1 AND project_id=$2",
      [input.revisionId, p.id],
    );
    if (!r) throw new HttpError(404, "Published map revision not found.");
    if (
      validateMap(mapSchema.parse(JSON.parse(r.map))).some(
        (i) => i.severity === "error",
      )
    )
      throw new HttpError(422, "Map revision is not ready.");
    if (!config.buildsEnabled)
      throw new HttpError(
        503,
        "APK worker is not configured. The verified campus package can still be downloaded.",
      );
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO builds (id,project_id,revision_id,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$5)",
        [id, p.id, input.revisionId, "queued", Date.now()],
      );
      await audit(tx, p.id, u.id, "build.queued", id);
    });
    res.status(202).json({ id });
  });
  app.get("/api/projects/:id/builds/:buildId/download", async (req, res) => {
    const { p } = await project(req);
    const [b] = await db.all<{ artifact: string; status: string }>(
      "SELECT artifact,status FROM builds WHERE id=$1 AND project_id=$2",
      [req.params.buildId, p.id],
    );
    if (
      !b ||
      b.status !== "succeeded" ||
      !b.artifact ||
      basename(b.artifact) !== b.artifact
    )
      throw new HttpError(404, "APK is not available.");
    res.download(resolve(config.artifactDir ?? "artifacts", b.artifact));
  });

  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "API endpoint not found.")),
  );
  if (config.webDir && existsSync(config.webDir)) {
    app.use(express.static(config.webDir, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve(config.webDir!, "index.html"));
    });
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if ((err as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    const incident = randomUUID();
    console.error(
      JSON.stringify({
        level: "error",
        incident,
        error: err instanceof Error ? err.name : "UnknownError",
      }),
    );
    res.status(500).json({
      error: `The request could not be completed. Reference: ${incident}`,
    });
  });
  return app;
}
