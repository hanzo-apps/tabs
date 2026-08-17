import { defineConfig, devices } from '@playwright/test';

// Three widths, because the defects this guard exists to catch were width-bound:
// a measure that only widowed above the phone, and tap targets that only matter
// on one. A single viewport would have passed while two of the three were wrong.
const PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a layout reading is deterministic; a retry would only hide a flake
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: '390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: '1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  // Serves out/ the way the bucket does. The build has to have run: the guard
  // checks what ships, not what a dev server renders.
  webServer: {
    command: `PORT=${PORT} node e2e/serve.mjs`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
