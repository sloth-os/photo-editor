import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    { name: "chromium", testIgnore: "**/safari.spec.ts" },
    {
      name: "iphone-webkit",
      testMatch: "**/safari.spec.ts",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        launchOptions: process.env.STILL_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.STILL_WEBKIT_EXECUTABLE }
          : {},
      },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "npm run preview -- --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node server/index.mjs",
      env: { PORT: "4878", STILL_COMMUNITY_DB: ":memory:" },
      url: "http://127.0.0.1:4878/api/health",
      reuseExistingServer: false,
    },
  ],
});
