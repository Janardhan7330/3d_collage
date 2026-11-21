import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../src/server/app";
import { openDB, migrate } from "../src/server/db";
import { sampleMap } from "../src/shared/map";
import { hash, passwordHash } from "../src/server/security";
import { randomUUID } from "node:crypto";

const origin = "http://localhost:5173";
const db = openDB(process.env.TEST_DATABASE_URL ?? ":memory:");
let server: Server,
  base: string,
  owner = "",
  outsider = "",
  mapper = "",
  projectId = "",
  mapperEmail = "";
const suffix = randomUUID();
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = owner,
  customOrigin = origin,
) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: customOrigin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "",
    headers: res.headers,
  };
}
before(async () => {
  await migrate(db);
  await db.run("DELETE FROM request_limits");
  server = createApp(db, { origin }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  for (const who of ["owner", "outsider", "mapper"]) {
    const r = await request(
      "/auth/register",
      "POST",
      {
        email: `${who}-${suffix}@example.com`,
        password: "Strong test password 123!",
        name: who,
      },
      "",
    );
    assert.equal(r.status, 201);
    if (who === "owner") owner = r.cookie;
    else if (who === "outsider") outsider = r.cookie;
    else {
      mapper = r.cookie;
      mapperEmail = r.body.email;
    }
  }
  const p = await request("/projects", "POST", {
    name: "Main campus",
    college: "Test College",
    location: "Test City",
  });
  projectId = p.body.id;
});
after(async () => {
  server?.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});

test("authentication and cookies are protected", async () => {
  assert.equal((await request("/projects", "GET", undefined, "")).status, 401);
  assert.equal(
    (
      await request(
        "/auth/login",
        "POST",
        {
          email: `owner-${suffix}@example.com`,
          password: "incorrect password",
        },
        "",
      )
    ).status,
    401,
  );
  const me = await request("/auth/me");
  assert.equal(me.body.name, "owner");
  assert.equal(me.headers.get("cache-control"), "no-store");
});
test("cross-origin writes and cross-tenant reads/writes are rejected", async () => {
  assert.equal(
    (
      await request(
        "/projects",
        "POST",
        { name: "evil", college: "evil", location: "" },
        owner,
        "https://evil.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/projects/${projectId}`, "GET", undefined, outsider))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/map`,
        "PUT",
        { version: 0, map: sampleMap() },
        outsider,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/projects", "GET", undefined, outsider)).body.length,
    0,
  );
});
test("map optimistic locking prevents concurrent overwrites", async () => {
  const results = await Promise.all([
    request(`/projects/${projectId}/map`, "PUT", {
      version: 0,
      map: sampleMap(),
    }),
    request(`/projects/${projectId}/map`, "PUT", {
      version: 0,
      map: sampleMap(),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await request(`/projects/${projectId}`)).body.version, 1);
});
test("publication rejects unconfirmed maps; immutable export survives later edits", async () => {
  assert.equal(
    (await request(`/projects/${projectId}/revisions`, "POST", { version: 1 }))
      .status,
    422,
  );
  const map = sampleMap();
  map.nodes.forEach((n) => (n.confirmed = true));
  map.edges.forEach((e) => (e.confirmed = true));
  assert.equal(
    (await request(`/projects/${projectId}/map`, "PUT", { version: 1, map }))
      .status,
    200,
  );
  const revision = await request(`/projects/${projectId}/revisions`, "POST", {
    version: 2,
  });
  assert.equal(revision.status, 201);
  assert.equal(
    (
      await request(
        `/projects/${projectId}/export/${revision.body.id}`,
        "GET",
        undefined,
        outsider,
      )
    ).status,
    404,
  );
  map.nodes[0].name = "Changed gate";
  await request(`/projects/${projectId}/map`, "PUT", { version: 2, map });
  const exported = await request(
    `/projects/${projectId}/export/${revision.body.id}`,
  );
  assert.equal(exported.body.map.nodes[0].name, "Main college gate");
  assert.equal(
    (
      await request(`/projects/${projectId}/builds`, "POST", {
        revisionId: revision.body.id,
      })
    ).status,
    503,
  );
});
test("mapper can collect data but cannot edit maps or publish", async () => {
  assert.equal(
    (
      await request(`/projects/${projectId}/members`, "POST", {
        email: mapperEmail,
        role: "mapper",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/projects/${projectId}`, "GET", undefined, mapper)).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/map`,
        "PUT",
        { version: 3, map: sampleMap() },
        mapper,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${projectId}/revisions`,
        "POST",
        { version: 3 },
        mapper,
      )
    ).status,
    403,
  );
});
test("pairing tokens are single use; device sessions are scoped and uploads idempotent", async () => {
  const pair = await request(
    `/projects/${projectId}/mapping`,
    "POST",
    {},
    mapper,
  );
  assert.equal(pair.status, 201);
  const claim = await request(
    "/pair/claim",
    "POST",
    { token: pair.body.token },
    "",
  );
  assert.equal(claim.status, 200);
  assert.equal(
    (await request("/pair/claim", "POST", { token: pair.body.token }, ""))
      .status,
    400,
  );
  assert.equal(
    (await request("/projects", "GET", undefined, claim.cookie)).status,
    401,
  );
  const event = {
    id: randomUUID(),
    type: "landmark",
    timestamp: Date.now(),
    name: "Gate",
    floor: 0,
  };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(
          "/device/samples",
          "POST",
          { sessionId: pair.body.id, events: [event] },
          claim.cookie,
        )
      ).status,
      200,
    );
  const samples = await request(
    `/projects/${projectId}/mapping/${pair.body.id}/samples`,
  );
  assert.equal(samples.body.events.length, 1);
  assert.equal(
    (
      await request(
        `/projects/${projectId}/mapping/${pair.body.id}/samples`,
        "GET",
        undefined,
        outsider,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/device/finish",
        "POST",
        { sessionId: pair.body.id },
        claim.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/device/samples",
        "POST",
        { sessionId: pair.body.id, events: [event] },
        claim.cookie,
      )
    ).status,
    401,
  );
});
test("password reset is single use and revokes existing sessions", async () => {
  const uid = randomUUID(),
    raw = "a".repeat(43),
    email = `reset-${suffix}@example.com`;
  await db.run(
    "INSERT INTO users (id,email,name,password,created_at) VALUES ($1,$2,$3,$4,$5)",
    [
      uid,
      email,
      "Reset User",
      await passwordHash("Old password long enough"),
      Date.now(),
    ],
  );
  await db.run(
    "INSERT INTO resets (hash,user_id,expires_at) VALUES ($1,$2,$3)",
    [hash(raw), uid, Date.now() + 10000],
  );
  const login = await request(
    "/auth/login",
    "POST",
    { email, password: "Old password long enough" },
    "",
  );
  assert.equal(login.status, 200);
  assert.equal(
    (
      await request(
        "/auth/reset",
        "POST",
        { token: raw, password: "New password long enough" },
        "",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/auth/me", "GET", undefined, login.cookie)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/auth/reset",
        "POST",
        { token: raw, password: "Another password long enough" },
        "",
      )
    ).status,
    400,
  );
});
test("logout invalidates the server session", async () => {
  assert.equal(
    (await request("/auth/logout", "POST", {}, outsider)).status,
    200,
  );
  assert.equal(
    (await request("/auth/me", "GET", undefined, outsider)).status,
    401,
  );
});

test("old capture tabs cannot upload to a different paired session; reconnect preserves session identity", async () => {
  const first = await request(`/projects/${projectId}/mapping`, "POST", {});
  const firstDevice = await request(
    "/pair/claim",
    "POST",
    { token: first.body.token },
    "",
  );
  const second = await request(`/projects/${projectId}/mapping`, "POST", {});
  const secondDevice = await request(
    "/pair/claim",
    "POST",
    { token: second.body.token },
    "",
  );
  const event = {
    id: randomUUID(),
    type: "landmark",
    timestamp: Date.now(),
    name: "Saved offline",
  };
  assert.equal(
    (
      await request(
        "/device/samples",
        "POST",
        { sessionId: first.body.id, events: [event] },
        secondDevice.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/device/finish",
        "POST",
        { sessionId: first.body.id },
        secondDevice.cookie,
      )
    ).status,
    409,
  );
  const reconnect = await request(
    `/projects/${projectId}/mapping/${first.body.id}/reconnect`,
    "POST",
    {},
  );
  assert.equal(
    (await request("/device", "GET", undefined, firstDevice.cookie)).status,
    401,
  );
  const resumed = await request(
    "/pair/claim",
    "POST",
    { token: reconnect.body.token },
    "",
  );
  assert.equal(resumed.body.id, first.body.id);
  assert.equal(
    (
      await request(
        "/device/samples",
        "POST",
        { sessionId: first.body.id, events: [event] },
        resumed.cookie,
      )
    ).status,
    200,
  );
  const wrongSession = await request(
    `/projects/${projectId}/mapping/${second.body.id}/samples`,
  );
  assert.equal(wrongSession.body.events.length, 0);
});

test("revoking mapper membership revokes the paired phone immediately", async () => {
  const pair = await request(
    `/projects/${projectId}/mapping`,
    "POST",
    {},
    mapper,
  );
  const claimed = await request(
    "/pair/claim",
    "POST",
    { token: pair.body.token },
    "",
  );
  const members = await request(`/projects/${projectId}/members`);
  const member = members.body.find((m: any) => m.email === mapperEmail);
  assert.equal(
    (await request(`/projects/${projectId}/members/${member.id}`, "DELETE", {}))
      .status,
    200,
  );
  assert.equal(
    (await request("/device", "GET", undefined, claimed.cookie)).status,
    401,
  );
  assert.equal(
    (await request(`/projects/${projectId}`, "GET", undefined, mapper)).status,
    404,
  );
});
