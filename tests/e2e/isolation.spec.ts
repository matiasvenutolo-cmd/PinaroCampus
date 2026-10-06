import { expect, test } from "@playwright/test";

// Fase 1, criterios de aceptación: un alumno no puede entrar a /admin; un
// admin de CIVA no puede ver datos de Ribera.
test.describe("aislamiento entre cámaras y roles", () => {
  test("un alumno no puede entrar a /admin", async ({ page }) => {
    await page.goto("http://civa.localhost:3000/demo");
    await page.getByRole("button", { name: "Entrar como alumno" }).click();
    await page.waitForURL("**/mi-campus");

    await page.goto("http://civa.localhost:3000/admin");
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });

  test("un admin de CIVA entra a su panel pero no al de Ribera, ni forzando la cookie de sesión", async ({
    page,
    context,
  }) => {
    await page.goto("http://civa.localhost:3000/demo");
    await page.getByRole("button", { name: "Entrar como admin de la cámara" }).click();
    await page.waitForURL("**/admin");
    await expect(page.getByRole("heading", { name: "Panel de Campus CIVA" })).toBeVisible();

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name.endsWith("authjs.session-token"));
    expect(sessionCookie).toBeTruthy();

    // El browser nunca manda esta cookie a ribera.localhost sola (es
    // host-only); acá la forzamos a propósito para probar que el server
    // también rechaza, no solo el navegador.
    await context.addCookies([
      {
        name: sessionCookie!.name,
        value: sessionCookie!.value,
        domain: "ribera.localhost",
        path: "/",
      },
    ]);

    await page.goto("http://ribera.localhost:3000/admin");
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});
