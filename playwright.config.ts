import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHROME_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_CHROME_PATH,
              },
            }
          : {}),
      },
    },
  ],
  webServer: {
    command: "node dist/server/index.js",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "4173",
      HOST: "127.0.0.1",
      APP_ORIGIN: "http://127.0.0.1:4173",
      DATABASE_URL: ":memory:",
      NODE_ENV: "test",
    },
  },
});
