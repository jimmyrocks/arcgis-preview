import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: true
    },
    {
      command: 'npm --prefix ../source-arcgis-rest run dev:serve',
      port: 6173,
      reuseExistingServer: true
    }
  ]
});
