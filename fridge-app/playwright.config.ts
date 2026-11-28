import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    geolocation: { latitude: 37.77, longitude: -122.42 },
    permissions: ['geolocation'],
    trace: 'off'
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true
  }
});
