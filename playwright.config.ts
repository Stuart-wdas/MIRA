import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/beta.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run build:api && node dist-server/index.js',
      url: 'http://127.0.0.1:3002/api/pricing',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: '3002',
        RECONSTRUCTION_WORKER_URL: 'http://127.0.0.1:1',
        APP_URL: 'http://127.0.0.1:4173',
        ADMIN_APP_URL: 'http://127.0.0.1:4173',
        ADMIN_EMAILS: 'admin-desktop-chromium@example.com',
        DEV_BYPASS_PAYWALL: 'false',
      },
    },
    {
      command: 'npm run dev:web -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      env: { ...process.env, VITE_API_PROXY_TARGET: 'http://127.0.0.1:3002' },
    },
  ],
})
