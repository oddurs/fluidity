import { defineConfig, devices } from "@playwright/test";

// The app is a WebGL simulation, so every project runs headed-equivalent GPU
// paths; ANGLE/Metal is requested explicitly for stable, non-software output.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--use-angle=metal"] } },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  // Against the static export, not `next dev`. The dev server did not survive
  // a full three-engine run — it died partway through and every remaining
  // test failed with a connection error, which reads exactly like a real
  // regression until you open the trace. It is also the artifact that ships,
  // so the suite now tests that rather than a development convenience.
  webServer: {
    command: "npm run build && node scripts/serve-out.mjs",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
