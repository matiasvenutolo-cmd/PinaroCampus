import { expect, test } from "@playwright/test";

// Test trivial de la Fase 0: solo confirma que Playwright levanta la app.
// Se reemplaza por los flujos reales (login, compra, cursada) en fases siguientes.
test("la home muestra el placeholder de Fase 0", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("La plataforma todavía se está construyendo"),
  ).toBeVisible();
});
