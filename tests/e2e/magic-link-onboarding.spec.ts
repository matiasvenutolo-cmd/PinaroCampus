import { expect, test, type Page } from "@playwright/test";

import { deleteTestCompany, deleteTestUser, getLatestEmailLink, getMembershipOf } from "./db";

// Fase 1: login real por magic link (sin Resend configurado, se resuelve vía
// email_log) y la resolución de member_status en el onboarding.
// Cada test usa su propio email y limpia solo lo suyo: corren en paralelo.

async function loginByMagicLink(page: Page, email: string) {
  await page.goto("http://civa.localhost:3000/ingresar");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviarme el link de ingreso" }).click();
  await expect(page.getByRole("heading", { name: "Revisá tu email" })).toBeVisible();

  const link = await getLatestEmailLink(email);
  expect(link).toBeTruthy();
  await page.goto(link!);
}

async function completeOnboarding(page: Page, firstName: string, lastName: string, cuit: string) {
  await page.goto("http://civa.localhost:3000/bienvenida");
  await page.getByLabel("Nombre").fill(firstName);
  await page.getByLabel("Apellido").fill(lastName);
  await page.getByLabel(/CUIT/).fill(cuit);
  await page.getByLabel(/Acepto los/).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.waitForURL("**/mi-campus");
  await expect(page.getByRole("heading", { name: `Hola, ${firstName} ${lastName}` })).toBeVisible();
}

test.describe("magic link + onboarding", () => {
  test("CUIT de una empresa socia queda verified", async ({ page }) => {
    const email = "e2e.socio@talleresbrisco.demo";
    try {
      await loginByMagicLink(page, email);
      await completeOnboarding(page, "Socia", "Prueba", "30000000104"); // Talleres Brisco S.A.
      expect(await getMembershipOf(email, "civa")).toMatchObject({ memberStatus: "verified" });
    } finally {
      await deleteTestUser(email);
    }
  });

  test("CUIT fuera del padrón no da socio pero igual se crea la empresa", async ({ page }) => {
    const email = "e2e.externo@afuera.demo";
    const cuit = "20999999906";
    try {
      await loginByMagicLink(page, email);
      await completeOnboarding(page, "Afuera", "Prueba", cuit);
      expect(await getMembershipOf(email, "civa")).toMatchObject({
        memberStatus: "none",
        companySource: "self_declared",
      });
    } finally {
      await deleteTestUser(email);
      await deleteTestCompany(cuit);
    }
  });
});
