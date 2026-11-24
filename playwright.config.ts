import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5173;
const API_PORT = 8787;

/**
 * End-to-end configuration.
 *
 * The browser client talks to the authoritative server over Socket.IO, so the
 * suite boots the real API server and the real Vite dev server (which proxies
 * `/socket.io` to the API) before driving the table.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    },
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npx tsx server/index.ts`,
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PORT: String(API_PORT), DOMINO_DB: 'e2e-domino.sqlite' },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
