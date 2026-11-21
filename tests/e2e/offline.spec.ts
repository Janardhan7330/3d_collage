import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { sampleMap } from "../../src/shared/map";

let server: Server, base: string;
test.beforeAll(async () => {
  const root = resolve("dist/offline");
  const map = sampleMap();
  map.nodes.forEach((n) => (n.confirmed = true));
  map.edges.forEach((e) => (e.confirmed = true));
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, "http://localhost").pathname;
    if (pathname === "/campus.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          format: "3d-college-campus",
          version: 1,
          projectId: "offline-test",
          revision: 1,
          college: "Offline Test College",
          map,
        }),
      );
      return;
    }
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/offline.html" : pathname),
    );
    if (!file.startsWith(root + "/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = await readFile(file);
      res.setHeader(
        "Content-Type",
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
          } as Record<string, string>
        )[extname(file)] ?? "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
test("packaged navigator searches aliases and calculates routes without network", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(base)) external.push(r.url());
  });
  await page.goto(base);
  await expect(
    page.getByText("Offline Test College", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await context.setOffline(true);
  await page.getByText("Use a location checkpoint", { exact: true }).click();
  await page
    .getByLabel("Printed checkpoint code")
    .fill("campus-location:1:wrong-campus:1:gate");
  await page.getByRole("button", { name: "Read checkpoint code" }).click();
  await expect(page.getByRole("alert")).toContainText("different campus");
  await page
    .getByLabel("Printed checkpoint code")
    .fill("campus-location:1:offline-test:1:gate");
  await page.getByRole("button", { name: "Read checkpoint code" }).click();
  await page.getByRole("button", { name: "I am at this location" }).click();
  await expect(page.getByRole("combobox", { name: "I am at" })).toHaveValue(
    "gate",
  );
  await page.getByRole("combobox", { name: "I am at" }).selectOption("gate");
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("CSE HOD");
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .selectOption("ring-3");
  await expect(page.getByText("Arrive at CSE HOD Room.")).toBeVisible();
  await page.getByLabel("Step-free route").check();
  await expect(page.getByText("Arrive at CSE HOD Room.")).toBeVisible();
  expect(external).toEqual([]);
  await context.setOffline(false);
});
