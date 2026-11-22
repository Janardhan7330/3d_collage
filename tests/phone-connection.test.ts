import { test } from "node:test";
import assert from "node:assert/strict";
import { phoneConnection, tunnelOrigin } from "../src/shared/phone-connection";

test("phone pairing never advertises a loopback or insecure address", () => {
  for (const origin of [
    "http://localhost:5173",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://app.localhost",
    "http://192.168.1.25:3001",
    "not a URL",
  ])
    assert.equal(phoneConnection(origin).available, false, origin);
  assert.equal(phoneConnection("https://campus.example.com").available, true);
});

test("phone preview selects the actual tunnel URL, not provider account links", () => {
  assert.equal(
    tunnelOrigin(
      "Visit https://admin.localhost.run/ and https://localhost.run/docs/",
    ),
    null,
  );
  assert.equal(
    tunnelOrigin(
      "https://admin.localhost.run/\nabc123.app.lhr.life tunneled with tls termination, https://abc123.app.lhr.life",
    ),
    "https://abc123.app.lhr.life",
  );
  assert.equal(
    tunnelOrigin("INF | https://my-campus.trycloudflare.com          |"),
    "https://my-campus.trycloudflare.com",
  );
  assert.equal(
    tunnelOrigin("Error at https://api.trycloudflare.com/tunnel"),
    null,
  );
});
