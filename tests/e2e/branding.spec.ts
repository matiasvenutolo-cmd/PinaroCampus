import { expect, test } from "@playwright/test";

// Fase 1, criterio de aceptación: civa.localhost:3000 y ribera.localhost:3000
// muestran marcas distintas (logo, colores, nombre) con el mismo código.
test.describe("marca por cámara", () => {
  test("CIVA y Ribera tienen título, color y textos propios", async ({ page }) => {
    await page.goto("http://civa.localhost:3000/");
    await expect(page).toHaveTitle("Campus CIVA");
    await expect(page.getByText("Capacitación para")).toBeVisible();
    const civaPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    );
    expect(civaPrimary.toLowerCase()).toBe("#1e4fa3");

    await page.goto("http://ribera.localhost:3000/");
    await expect(page).toHaveTitle("Aula Ribera");
    await expect(page.getByText("comercios y servicios de Ribera")).toBeVisible();
    const riberaPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    );
    expect(riberaPrimary.toLowerCase()).toBe("#0f7b5f");

    expect(civaPrimary).not.toBe(riberaPrimary);
  });

  test("un host sin tenant mapeado muestra el 404 genérico de Pinaro", async ({ page }) => {
    await page.goto("http://localhost:3000/");
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});
