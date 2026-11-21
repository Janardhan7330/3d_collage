import { test, expect } from "@playwright/test";
import { sampleMap } from "../../src/shared/map";

test("create a campus, inspect its circular map, save, publish and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await page
    .getByRole("button", { name: "Explore circular campus example" })
    .click();
  await expect(
    page.getByText("Example campus loaded.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save map", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
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
      ).events.some((e: any) => e.name === "Main gate"),
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
  await mobile.close();
  await owner.close();
});
