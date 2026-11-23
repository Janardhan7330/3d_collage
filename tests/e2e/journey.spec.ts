import { test, expect } from "@playwright/test";
import { sampleMap } from "../../src/shared/map";

test("create a campus, inspect its circular map, save, publish and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const html = await (await page.request.get("/")).text();
  const asset = html.match(/src="([^" ]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  const compressed = await page.request.get(asset!, {
    headers: { "Accept-Encoding": "gzip" },
  });
  expect(compressed.headers()["content-encoding"]).toBe("gzip");
  await page.goto("/");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("Campus Reviewer");
  await page
    .getByLabel("Email address")
    .fill(`reviewer-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Strong test password 123!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Every campus starts/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New campus", exact: true }).click();
  await page
    .getByLabel("College name", { exact: true })
    .fill("Riverdale Institute");
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Riverdale Main Campus");
  await page.getByLabel("Location", { exact: true }).fill("Bengaluru, India");
  await page
    .getByRole("button", { name: "Create campus", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with your own campus" }),
  ).toBeVisible();
  await expect(
    page.getByText("0 locations · 0 connections", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore circular campus example" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Map my campus with my phone" })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect a phone", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This address only opens on this computer.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByAltText("QR code to connect a phone to this mapping session"),
  ).toHaveCount(0);
  // The circular map is test data only; it is never inserted by the product UI.
  const initialProjects = await (
    await page.request.get("/api/projects")
  ).json();
  const initialProject = await (
    await page.request.get(`/api/projects/${initialProjects[0].id}`)
  ).json();
  expect(initialProject.map.nodes).toEqual([]);
  expect(initialProject.map.buildings).toEqual([]);
  const fixture = await page.request.put(
    `/api/projects/${initialProject.id}/map`,
    {
      headers: { Origin: "http://127.0.0.1:4173" },
      data: { version: 0, map: sampleMap() },
    },
  );
  expect(fixture.status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Riverdale Main Campus/ }).click();
  await page.getByLabel("Starting location").selectOption("gate");
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .selectOption("ring-3");
  await page.getByRole("button", { name: "Find route" }).click();
  await expect(page.getByText("Arrive at CSE HOD Room.")).toBeVisible();
  await page.screenshot({
    path: "test-results/campus-studio-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review & build" }).click();
  await expect(
    page.getByRole("button", { name: "Publish verified revision" }),
  ).toBeDisabled();
  // Verification assertions are supplied only in the test fixture, never by the product.
  const projects = await (await page.request.get("/api/projects")).json();
  const id = projects[0].id;
  const map = sampleMap();
  map.nodes.forEach((n) => (n.confirmed = true));
  map.edges.forEach((e) => (e.confirmed = true));
  const save = await page.request.put(`/api/projects/${id}/map`, {
    headers: { Origin: "http://127.0.0.1:4173" },
    data: { version: 1, map },
  });
  expect(save.status()).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Riverdale Main Campus/ }).click();
  await page.getByRole("button", { name: "Review & build" }).click();
  await page.getByRole("button", { name: "Publish verified revision" }).click();
  await expect(page.getByRole("link", { name: "Campus JSON" })).toBeVisible();
  await page.getByRole("button", { name: "Build APK" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "APK worker is not configured",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/campus-studio-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("paired mobile browser captures a landmark and uploads it before finishing", async ({
  browser,
}) => {
  const owner = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const headers = { Origin: "http://127.0.0.1:4173" };
  await owner.request.post("/api/auth/register", {
    headers,
    data: {
      name: "Mapper owner",
      email: `mapper-${Date.now()}@example.com`,
      password: "Strong test password 123!",
    },
  });
  const project = await (
    await owner.request.post("/api/projects", {
      headers,
      data: {
        name: "Walk test",
        college: "Test College",
        location: "Bengaluru",
      },
    })
  ).json();
  const pair = await (
    await owner.request.post(`/api/projects/${project.id}/mapping`, {
      headers,
      data: {},
    })
  ).json();
  const mobile = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: { latitude: 12.97, longitude: 77.59, accuracy: 5 },
  });
  await mobile.addInitScript(() => {
    const watch = navigator.geolocation.watchPosition.bind(
      navigator.geolocation,
    );
    navigator.geolocation.watchPosition = (success, error, options) =>
      watch(
        (position) =>
          success({
            coords: position.coords,
            timestamp: Date.now() - 60000,
          } as GeolocationPosition),
        error,
        options,
      );
  });
  const page = await mobile.newPage();
  await page.goto(`/#pair=${pair.token}`);
  await expect(
    page.getByRole("heading", { name: "Test College", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start mapping" }).click();
  await page.getByLabel("Location name").fill("Main gate");
  await page.getByLabel("Nickname").fill("Gate");
  await page.getByRole("button", { name: "Save location" }).click();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect
    .poll(async () =>
      (
        await (
          await owner.request.get(
            `/api/projects/${project.id}/mapping/${pair.id}/samples`,
          )
        ).json()
      ).events.some((e: any) => e.name === "Main gate" && e.latitude === 12.97),
    )
    .toBe(true);
  await mobile.setOffline(true);
  await page.getByLabel("Location name").fill("Offline canteen");
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pause mapping", exact: true })
    .click();
  await mobile.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Test College", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect
    .poll(async () =>
      (
        await (
          await owner.request.get(
            `/api/projects/${project.id}/mapping/${pair.id}/samples`,
          )
        ).json()
      ).events.some((e: any) => e.name === "Offline canteen"),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Finish and send for review" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Walk saved." }),
  ).toBeVisible();
  const studio = await owner.newPage();
  await studio.goto("/");
  await studio.getByRole("button", { name: /Walk test/ }).click();
  await studio
    .getByRole("button", { name: "Mobile mapping", exact: true })
    .click();
  await studio
    .getByRole("button", { name: "Review measurements", exact: true })
    .click();
  await studio
    .locator(".sample-row")
    .filter({ hasText: "Main gate" })
    .getByRole("button", { name: "Import for review" })
    .click();
  await studio.getByRole("button", { name: "Save map", exact: true }).click();
  await expect
    .poll(async () =>
      (
        await (await owner.request.get(`/api/projects/${project.id}`)).json()
      ).map.nodes.map((n: any) => n.name),
    )
    .toEqual(["Main gate"]);
  const saved = await (
    await owner.request.get(`/api/projects/${project.id}`)
  ).json();
  expect(saved.map.buildings).toEqual([]);
  expect(saved.map.nodes[0].confirmed).toBe(false);
  await mobile.close();
  await owner.close();
});
