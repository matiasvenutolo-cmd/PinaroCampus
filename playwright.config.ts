import { defineConfig, devices } from "@playwright/test";

// Cada test usa URLs absolutas por host (civa.localhost:3000,
// ribera.localhost:3000) porque la app es multi-tenant por dominio. El
// healthcheck del webServer pega contra civa.localhost porque
// localhost:3000 a secas no tiene tenant y devuelve 404 a propósito.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  // El dev server compila cada ruta en la primera visita: sin esto los
  // timeouts por defecto (5 s) fallan en frío.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://civa.localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
