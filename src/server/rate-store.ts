import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import type { DB } from "./db";
import { hash } from "./security";

/** Shared atomic counters: limits continue to hold across API instances and restarts. */
export class DatabaseRateStore implements Store {
  windowMs = 60000;
  localKeys = false;
  constructor(
    private db: DB,
    public prefix: string,
  ) {}
  init(options: Options) {
    this.windowMs = options.windowMs;
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    const [row] = await this.db.all<{ hits: number; reset_at: number }>(
      "INSERT INTO request_limits (key,hits,reset_at) VALUES ($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.reset_at<=$3 THEN 1 ELSE request_limits.hits+1 END,reset_at=CASE WHEN request_limits.reset_at<=$3 THEN $2 ELSE request_limits.reset_at END RETURNING hits,reset_at",
      [this.prefix + hash(key), now + this.windowMs, now],
    );
    return {
      totalHits: Number(row.hits),
      resetTime: new Date(Number(row.reset_at)),
    };
  }
  async decrement(key: string) {
    await this.db.run(
      "UPDATE request_limits SET hits=CASE WHEN hits>0 THEN hits-1 ELSE 0 END WHERE key=$1",
      [this.prefix + hash(key)],
    );
  }
  async resetKey(key: string) {
    await this.db.run("DELETE FROM request_limits WHERE key=$1", [
      this.prefix + hash(key),
    ]);
  }
}
