import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  globalSetup: './tests/browser-setup.js',
  use: {
    baseURL: 'http://127.0.0.1:3107',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
