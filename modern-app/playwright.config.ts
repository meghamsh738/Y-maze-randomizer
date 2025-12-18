import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 80_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry'
  },
  webServer: {
    command: "bash -lc 'set -e; trap \"kill 0\" EXIT; npm run dev:back & npm run dev:front'",
    url: 'http://localhost:5175',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chromium'] }
    }
  ]
})
