import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestUser,
  deleteWaitlistEntry,
  getChecklistState,
  getEnrollment,
  makeCoursePreviewToken,
  resetDemoStudentPosition,
  seedProgress,
} from "./db";

// Fase 2: catálogo, detalle, reproductor, calculadoras, archivos y vista previa.
const CIVA = "http://civa.localhost:3000";
const RIBERA = "http://ribera.localhost:3000";
const COURSE = "eficiencia-energetica-pymes-industriales";
const RUN = Math.random().toString(36).slice(2, 7);

const course = JSON.parse(
  readFileSync(path.join(process.cwd(), "content/courses", COURSE, "course.json"), "utf8"),
) as { modules: { lessons: { id: string; type: string }[] }[] };
const allLessons = course.modules.flatMap((m) => m.lessons);
const contentLessons = allLessons.filter((l) => !["quiz", "exam"].includes(l.type));

async function loginAs(page: Page, host: string, sessionToken: string) {
  await page.context().addCookies([{ name: "authjs.session-token", value: sessionToken, url: host }]);
}

test.describe("catálogo y detalle (sin sesión)", () => {
  test("lista el curso con precio no socio y el de socios, y filtra por categoría y búsqueda", async ({ page }) => {
    await page.goto(`${CIVA}/cursos`);
    const card = page.getByRole("link", { name: /Eficiencia energética para PyMEs industriales/ });
    await expect(card).toContainText("$ 90.000");
    await expect(card).toContainText("Socios: $ 45.000");
    await expect(page.getByRole("link", { name: /Exportar por primera vez/ })).toContainText("Próximamente");

    await page.getByRole("navigation", { name: "Categorías" }).getByRole("link", { name: "Comercio exterior" }).click();
    await expect(page).toHaveURL(/categoria=comercio-exterior/);
    await expect(page.getByRole("link", { name: /Exportar por primera vez/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Eficiencia energética/ })).toHaveCount(0);

    await page.goto(`${CIVA}/cursos?q=energ`);
    await expect(page.getByRole("link", { name: /Eficiencia energética/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Exportar por primera vez/ })).toHaveCount(0);

    await page.goto(`${CIVA}/cursos?q=zzzzzz`);
    await expect(page.getByText("No encontramos cursos con ese filtro")).toBeVisible();
  });

  test("el detalle muestra temario, objetivos y el CTA de inscripción", async ({ page }) => {
    await page.goto(`${CIVA}/cursos/${COURSE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Eficiencia energética para PyMEs industriales" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Qué vas a aprender" })).toBeVisible();
    await expect(page.getByText("19 lecciones")).toBeVisible();
    await expect(page.getByText("Módulo 5", { exact: true })).toBeVisible();
    // Sin sesión, "Inscribirme" lleva a ingresar y volver a comprar (Fase 4).
    await expect(page.getByRole("button", { name: /inscribirme/i }).first()).toBeEnabled();
    await expect(page.getByRole("link", { name: "Comprar para mi equipo" }).first()).toBeVisible();
  });

  test("curso Próximamente: se anota en la lista de espera", async ({ page }) => {
    const email = `espera-${RUN}@test.demo`;
    try {
      await page.goto(`${CIVA}/cursos/exportar-por-primera-vez`);
      await expect(page.getByText("Próximamente").first()).toBeVisible();
      await page.getByLabel("Tu email").fill(email);
      await page.getByRole("button", { name: "Avisame cuando esté" }).first().click();
      await expect(page.getByText("te vamos a avisar apenas el curso esté disponible").first()).toBeVisible();
    } finally {
      await deleteWaitlistEntry(email);
    }
  });

  test("un curso inexistente da 404", async ({ page }) => {
    await page.goto(`${CIVA}/cursos/no-existe`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});

test.describe("precios e inscripción", () => {
  test("un socio verificado ve solo el precio socio", async ({ page }) => {
    const email = `socio-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({
      email,
      tenantSlug: "civa",
      companyName: "Talleres Brisco S.A.",
      memberStatus: "verified",
    });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/cursos/${COURSE}`);
      await expect(page.getByText("$ 45.000").first()).toBeVisible();
      await expect(page.getByText("Precio socio").first()).toBeVisible();
      await expect(page.getByText("$ 90.000")).toHaveCount(0);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("en Ribera el curso es gratis para socios verificados: se inscribe y entra al reproductor", async ({ page }) => {
    const email = `socio-ribera-${RUN}@riberanorte.demo`;
    const { sessionToken } = await createTestStudent({
      email,
      tenantSlug: "ribera",
      companyName: "Comercial Ribera Norte S.A.",
      memberStatus: "verified",
    });
    try {
      await loginAs(page, RIBERA, sessionToken);
      await page.goto(`${RIBERA}/cursos/${COURSE}`);
      await expect(page.getByText("Gratis").first()).toBeVisible();
      await page.getByRole("button", { name: "Inscribirme" }).first().click();
      await page.waitForURL(`**/aprender/${COURSE}/**`);
      await expect(page.getByRole("heading", { level: 1, name: "Bienvenida al curso" })).toBeVisible();
      expect(await getEnrollment(email, "ribera", COURSE)).toMatchObject({ source: "free", progressPct: 0 });
    } finally {
      await deleteTestUser(email);
    }
  });

  test("un no socio de Ribera ve el precio completo y el botón lo lleva a pagar", async ({ page }) => {
    await page.goto(`${RIBERA}/cursos/${COURSE}`);
    await expect(page.getByText("$ 60.000").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /inscribirme/i }).first()).toBeEnabled();
  });
});

test.describe("mi campus y continuar", () => {
  test("el alumno demo ve su avance y 'Continuar' lo lleva a la lección que sigue", async ({ page }) => {
    // La cuenta demo es compartida: otros tests (y las demos en vivo) mueven su "dónde seguir".
    await resetDemoStudentPosition();
    await page.goto(`${CIVA}/demo`);
    await page.getByRole("button", { name: "Entrar como alumno" }).click();
    await page.waitForURL("**/mi-campus");
    await expect(page.getByText("42% completado")).toBeVisible();
    await page.getByRole("link", { name: "Continuar", exact: true }).click();
    // 8 de 19 lecciones obligatorias hechas (módulos 1 y 2): sigue Motores eléctricos.
    await page.waitForURL(`**/aprender/${COURSE}/m3-l1-motores`);
    await expect(page.getByRole("heading", { level: 1, name: /Motores eléctricos/ })).toBeVisible();
  });

  test("con ~50% de avance muestra el % y 'Continuar' va a la lección correcta", async ({ page }) => {
    const email = `avance-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      const { pct } = await seedProgress(email, "civa", COURSE, 10);
      expect(pct).toBe(53);
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/mi-campus`);
      await expect(page.getByText("53% completado")).toBeVisible();
      await page.getByRole("link", { name: "Continuar", exact: true }).click();
      // Las lecciones obligatorias 1 a 10 van hasta m3-l2; sigue Aire comprimido.
      await page.waitForURL(`**/aprender/${COURSE}/m3-l3-aire-comprimido`);
      await expect(page.getByRole("progressbar", { name: "Avance del curso" })).toHaveAttribute("aria-valuenow", "53");
    } finally {
      await deleteTestUser(email);
    }
  });

  test("sin inscripción no se puede entrar al reproductor", async ({ page }) => {
    const email = `sinscribir-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-l1-costo-de-produccion`);
      await expect(page).toHaveURL(new RegExp(`/cursos/${COURSE}$`));
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("reproductor", () => {
  test("marcar una lección como completada se guarda, es idempotente y mueve el avance", async ({ page }) => {
    const email = `completa-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-video-bienvenida`);
      await expect(page.getByText("Video en producción")).toBeVisible();

      await page.getByRole("button", { name: "Marcar como completada" }).click();
      await expect(page.getByText("Completada", { exact: true })).toBeVisible();
      await expect(page.getByRole("progressbar", { name: "Avance del curso" })).toHaveAttribute("aria-valuenow", "5");

      await page.reload();
      await expect(page.getByText("Completada", { exact: true })).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toMatchObject({ progressPct: 5, completedLessons: 1 });
    } finally {
      await deleteTestUser(email);
    }
  });

  test("las listas tildables guardan su estado", async ({ page }) => {
    const email = `checklist-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-l1-costo-de-produccion`);
      const first = page.getByRole("checkbox").first();
      await expect(first).toHaveAttribute("aria-checked", "false");
      await first.click();
      await expect(first).toHaveAttribute("aria-checked", "true");
      // Esperamos a que quede guardado (no al primer POST, que puede ser el de "lección vista").
      await expect.poll(() => getChecklistState(email, "civa", COURSE, "m1-l1-costo-de-produccion", "m1-l1-lunes")).toEqual([0]);

      await page.reload();
      await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("checkbox").nth(1)).toHaveAttribute("aria-checked", "false");
    } finally {
      await deleteTestUser(email);
    }
  });

  test("los quizzes se rinden desde la lección y no tienen botón de completar a mano", async ({ page }) => {
    const email = `quiz-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-repaso`);
      await expect(page.getByRole("button", { name: "Empezar el repaso" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Marcar como completada" })).toHaveCount(0);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("las 6 calculadoras abren con los valores del caso práctico", async ({ page }) => {
    const email = `calc-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    const expected: [string, string, RegExp | string][] = [
      ["m1-l1-costo-de-produccion", "Costo anual de un equipo", "$ 9.504.000"],
      ["m1-l3-factor-de-potencia", "Banco de capacitores para el factor de potencia", "35 kvar"],
      ["m3-l2-variadores", "Ahorro con variador de velocidad", /\$ 4\.487\.\d{3}/],
      ["m3-l3-aire-comprimido", "Costo de las fugas de aire comprimido", "$ 5.829.120"],
      ["m3-l4-iluminacion", "Recambio a LED", "$ 3.345.408"],
      ["m5-l1-evaluar-proyectos", "Recupero de la inversión", "Muy conveniente"],
    ];
    try {
      await loginAs(page, CIVA, sessionToken);
      for (const [lesson, title, result] of expected) {
        await page.goto(`${CIVA}/aprender/${COURSE}/${lesson}`);
        const calculator = page.getByRole("region", { name: `Calculadora: ${title}` });
        await expect(calculator).toBeVisible();
        await expect(calculator).toContainText(result);
      }
    } finally {
      await deleteTestUser(email);
    }
  });

  test("la calculadora recalcula en vivo y valida los datos", async ({ page }) => {
    const email = `calc2-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m3-l3-aire-comprimido`);
      const calculator = page.getByRole("region", { name: /Calculadora: Costo de las fugas/ });
      await calculator.getByLabel(/Fugas de 5 mm/).fill("1");
      await expect(calculator).toContainText("17,5 kW");
      await expect(calculator).toContainText("$ 11.088.000");
      await calculator.getByLabel(/Fugas de 5 mm/).fill("-3");
      await expect(calculator).toContainText("Mínimo 0");
      await expect(calculator).toContainText("Revisá los valores marcados");
    } finally {
      await deleteTestUser(email);
    }
  });

  test("en mobile (390 px) ninguna lección tiene scroll horizontal", async ({ page }) => {
    test.setTimeout(300_000);
    const email = `mobile-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await loginAs(page, CIVA, sessionToken);
      const overflowing: string[] = [];
      for (const lesson of contentLessons) {
        await page.goto(`${CIVA}/aprender/${COURSE}/${lesson.id}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 0) overflowing.push(`${lesson.id} (+${overflow}px)`);
      }
      expect(overflowing).toEqual([]);

      // Y el temario abre como drawer.
      await page.getByRole("button", { name: "Temario" }).click();
      // El temario abre con el módulo de la lección actual desplegado (la última del recorrido).
      await expect(page.getByRole("dialog").getByRole("link", { name: /Tu plan de acción de 90 días/ })).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("archivos del curso y vista previa para docentes", () => {
  const csv = `${CIVA}/api/course-files/${COURSE}/resources/relevamiento-de-cargas.csv`;

  test("los recursos solo se descargan con inscripción o con token de vista previa", async ({ page, request }) => {
    expect((await request.get(csv)).status()).toBe(403);

    const email = `archivos-${RUN}@test.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      const response = await page.request.get(csv);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("text/csv");
      expect(response.headers()["content-disposition"]).toContain("attachment");
    } finally {
      await deleteTestUser(email);
    }

    const withToken = await request.get(`${csv}?token=${encodeURIComponent(makeCoursePreviewToken(COURSE))}`);
    expect(withToken.status()).toBe(200);
  });

  test("no se puede salir de la carpeta del curso ni leer lecciones o course.json", async ({ request }) => {
    const base = `${CIVA}/api/course-files/${COURSE}`;
    for (const attempt of [
      `${base}/resources/..%2F..%2Fcourse.json`,
      `${base}/assets/..%2F..%2F..%2F..%2Fpackage.json`,
      `${base}/course.json`,
      `${base}/lessons/m1-l1-costo-de-produccion.mdx`,
      `${base}/assessments/examen-final.json`,
    ]) {
      const status = (await request.get(attempt)).status();
      expect([403, 404], attempt).toContain(status);
    }
  });

  test("la vista previa abre con token válido, sin cuenta, y no con uno vencido o de otro curso", async ({ page }) => {
    const token = makeCoursePreviewToken(COURSE);
    await page.goto(`${CIVA}/preview/${COURSE}/m3-l3-aire-comprimido?token=${encodeURIComponent(token)}`);
    await expect(page.getByText("Vista previa para docentes")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Aire comprimido/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /Calculadora/ })).toBeVisible();

    const expired = makeCoursePreviewToken(COURSE, -1000);
    await page.goto(`${CIVA}/preview/${COURSE}/m3-l3-aire-comprimido?token=${encodeURIComponent(expired)}`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();

    const other = makeCoursePreviewToken("otro-curso");
    await page.goto(`${CIVA}/preview/${COURSE}/m3-l3-aire-comprimido?token=${encodeURIComponent(other)}`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();

    await page.goto(`${CIVA}/preview/${COURSE}/m3-l3-aire-comprimido`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});

test.describe("admin de la cámara", () => {
  test("inscribe a mano a un alumno y queda registrado", async ({ page }) => {
    const email = `manual-${RUN}@test.demo`;
    await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await page.goto(`${CIVA}/demo`);
      await page.getByRole("button", { name: "Entrar como admin de la cámara" }).click();
      await page.waitForURL("**/admin");
      await page.goto(`${CIVA}/admin/cursos`);
      await expect(page.getByText("Eficiencia energética para PyMEs industriales")).toBeVisible();

      const form = page.locator("form").filter({ has: page.locator(`#email-${COURSE}`) });
      await form.getByLabel(/Inscribir a mano/).fill(email);
      await form.getByRole("button", { name: "Inscribir" }).click();
      await expect(page.getByText("Alumno inscripto.")).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toMatchObject({ source: "admin" });

      await form.getByLabel(/Inscribir a mano/).fill(email);
      await form.getByRole("button", { name: "Inscribir" }).click();
      await expect(page.getByText("Ese alumno ya estaba inscripto.")).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("un alumno no puede abrir la gestión de cursos", async ({ page }) => {
    await page.goto(`${CIVA}/demo`);
    await page.getByRole("button", { name: "Entrar como alumno" }).click();
    await page.waitForURL("**/mi-campus");
    await page.goto(`${CIVA}/admin/cursos`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});

test.describe("superadmin", () => {
  test("la biblioteca de cursos es solo para superadmin", async ({ page }) => {
    await page.goto(`${CIVA}/superadmin/cursos`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});
