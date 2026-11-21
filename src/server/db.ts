import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface DB {
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<number>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function openDB(url?: string): DB {
  if (url?.startsWith("postgres")) {
    const pool = new Pool({ connectionString: url, max: 10 });
    const wrap = (client: Pool | PoolClient): DB => ({
      async all<T>(sql: string, params: unknown[] = []) {
        return (await client.query(sql, params)).rows as T[];
      },
      async run(sql, params = []) {
        return (await client.query(sql, params)).rowCount ?? 0;
      },
      async transaction(fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const result = await fn(wrap(c));
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      async close() {
        await pool.end();
      },
    });
    return wrap(pool);
  }
  const file = url ?? "data/campus.sqlite";
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  const query = (sql: string, params: unknown[]) => {
    const ordered: unknown[] = [];
    const text = sql.replace(/\$(\d+)/g, (_, n: string) => {
      ordered.push(params[Number(n) - 1]);
      return "?";
    });
    return {
      stmt: sqlite.prepare(text),
      args: ordered as (string | number | null)[],
    };
  };
  let tail: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>) => {
    const task = tail.then(fn, fn);
    tail = task.catch(() => {});
    return task;
  };
  const direct: DB = {
    async all<T>(sql: string, params: unknown[] = []) {
      const q = query(sql, params);
      return q.stmt.all(...q.args) as T[];
    },
    async run(sql, params = []) {
      const q = query(sql, params);
      return Number(q.stmt.run(...q.args).changes);
    },
    async transaction() {
      throw new Error("Nested transactions are unsupported");
    },
    async close() {
      sqlite.close();
    },
  };
  return {
    all: <T>(sql: string, params?: unknown[]) =>
      locked(() => direct.all<T>(sql, params)),
    run: (sql, params) => locked(() => direct.run(sql, params)),
    transaction: (fn) =>
      locked(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(direct);
          sqlite.exec("COMMIT");
          return result;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      }),
    close: () => locked(() => direct.close()),
  };
}

export async function migrate(db: DB) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, created_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, college TEXT NOT NULL, location TEXT NOT NULL, map TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS memberships (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','editor','mapper','reviewer')), PRIMARY KEY(project_id,user_id))`,
    `CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL, map TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at BIGINT NOT NULL, UNIQUE(project_id,version))`,
    `CREATE TABLE IF NOT EXISTS mapping_sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), created_by TEXT NOT NULL REFERENCES users(id), pair_hash TEXT UNIQUE, pair_expires BIGINT NOT NULL, device_hash TEXT UNIQUE, device_expires BIGINT, status TEXT NOT NULL, created_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS samples (session_id TEXT NOT NULL REFERENCES mapping_sessions(id), event_id TEXT NOT NULL, data TEXT NOT NULL, created_at BIGINT NOT NULL, PRIMARY KEY(session_id,event_id))`,
    `CREATE TABLE IF NOT EXISTS builds (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), revision_id TEXT NOT NULL REFERENCES revisions(id), status TEXT NOT NULL, error TEXT, artifact TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, details TEXT NOT NULL, created_at BIGINT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS membership_user ON memberships(user_id)`,
    `CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS samples_session ON samples(session_id,created_at)`,
  ];
  await db.transaction(async (tx) => {
    for (const sql of statements) await tx.run(sql);
  });
}
