import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  ageAttempts,
  countAttempts,
  countAudit,
  countCertificates,
  createSessionFor,
  createTestStudent,
  deleteTestUser,
  getActiveCertificateCode,
  seedProgress,
} from "./db";

// Fase 3: quiz, examen final, certificado, verificación pública y panel de la cámara.
const CIVA = "http://civa.localhost:3000";
const RIBERA = "http://ribera.localhost:3000";
const COURSE = "eficiencia-energetica-pymes-industriales";
const EXAM_URL = `${CIVA}/aprender/${COURSE}/cierre-examen-final`;
const RUN = Math.random().toString(36).slice(2, 7);

interface Question {
  id: string;
  type: "single" | "multiple" | "true_false";
  prompt: string;
  options?: { id: string; text: string }[];
  correct: string[];
  explanation?: string;
}
const readBank = (file: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "content/courses", COURSE, "assessments", file), "utf8")) as {
    questions: Question[];
  };
const examBank = readBank("examen-final.json").questions;
const quizBank = readBank("m1-quiz.json").questions;

async function loginAs(page: Page, host: string, sessionToken: string) {
  await page.context().addCookies([{ name: "authjs.session-token", value: sessionToken, url: host }]);
}

/** Texto de la opción correcta (o de cada una) tal como se muestra en pantalla. */
function correctTexts(question: Question): string[] {
  if (question.type === "true_false") return [question.correct[0] === "true" ? "Verdadero" : "Falso"];
  return question.correct.map((id) => question.options!.find((o) => o.id === id)!.text);
}

/** Responde TODAS las preguntas visibles: bien, o mal a propósito. */
async function answerAll(page: Page, bank: Question[], mode: "correct" | "wrong") {
  const fieldsets = page.locator("fieldset");
  const count = await fieldsets.count();
  for (let i = 0; i < count; i++) {
    const fieldset = fieldsets.nth(i);
    const prompt = (await fieldset.locator("p").nth(1).innerText()).trim();
    const question = bank.find((q) => prompt === q.prompt.trim());
    if (!question) throw new Error(`Pregunta que no está en el banco: ${prompt}`);
    const all = question.type === "true_false" ? ["Verdadero", "Falso"] : question.options!.map((o) => o.text);
    const wanted =
      mode === "correct" ? correctTexts(question) : [all.find((text) => !correctTexts(question).includes(text))!];
    for (const text of wanted) {
      await fieldset.locator("label").filter({ has: page.getByText(text, { exact: true }) }).first().click();
    }
  }
}

async function startExam(page: Page) {
  await page.getByRole("button", { name: "Empezar el examen" }).click();
  await expect(page.locator("fieldset")).toHaveCount(15);
}

async function submitExam(page: Page) {
  await page.getByRole("button", { name: "Enviar examen" }).click();
  await page.getByRole("button", { name: "Sí, enviar" }).click();
}

test.describe("examen final y certificado", () => {
  // Responder 15 preguntas, emitir, revocar y verificar: con el dev server (cada consulta a Neon ~170 ms) pasa el minuto.
  test.setTimeout(240_000);

  test("aprobar emite el certificado una sola vez; las respuestas no viajan antes de enviar", async ({ page }) => {
    const email = `t3-exam-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    try {
      await seedProgress(email, "civa", COURSE, 999);
      await loginAs(page, CIVA, sessionToken);

      // Todo lo que llega al navegador antes de enviar el examen.
      const bodies: string[] = [];
      page.on("response", async (response) => {
        const type = response.headers()["content-type"] ?? "";
        if (response.request().method() === "POST" || type.includes("text/html") || type.includes("text/x-component")) {
          bodies.push(await response.text().catch(() => ""));
        }
      });

      await page.goto(EXAM_URL);
      await expect(page.getByText("3 de 3 restantes")).toBeVisible();
      await startExam(page);

      const html = await page.content();
      const everything = [html, ...bodies].join("\n");
      for (const question of examBank) {
        if (question.explanation) expect(everything).not.toContain(question.explanation);
      }
      expect(everything).not.toContain('"correct"');
      expect(everything).not.toContain('\\"correct\\"');
      expect(everything).not.toContain("explanation");

      await answerAll(page, examBank, "correct");
      await submitExam(page);
      await expect(page.getByText("¡Aprobaste el examen!")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("Tu certificado está listo")).toBeVisible();
      const code = (await page.getByText(/^Código PC-/).innerText()).replace("Código ", "").trim();
      expect(code).toMatch(/^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

      // Recargar la página no emite otro.
      await page.reload();
      await expect(page.getByText("Ya aprobaste este examen.")).toBeVisible();
      await expect(page.getByText("Tu certificado está listo")).toBeVisible();
      await page.reload();
      expect(await countCertificates(email, "civa")).toBe(1);
      expect(await countAttempts(email, "civa", COURSE)).toBe(1);

      // El alumno descarga su PDF.
      const pdf = await page.request.get(`${CIVA}/api/certificates/${code}/pdf`);
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toBe("application/pdf");
      expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

      // Verificación pública: sin sesión, también desde el dominio de otra cámara.
      const anonymous = await page.context().browser()!.newContext();
      const publicPage = await anonymous.newPage();
      await publicPage.goto(`${CIVA}/verificar/${code}`);
      await expect(publicPage.getByRole("heading", { name: "Válido" }).or(publicPage.getByText("Válido", { exact: true }))).toBeVisible();
      await expect(publicPage.getByText("Test Alumno")).toBeVisible();
      await expect(publicPage.getByText("Cámara Industrial Valle Azul")).toBeVisible();
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await publicPage.goto(`${RIBERA}/verificar/${code.toLowerCase()}`);
      await expect(publicPage.getByText("Válido", { exact: true })).toBeVisible();
      // Anónimo no baja el PDF.
      const anonPdf = await anonymous.request.get(`${CIVA}/api/certificates/${code}/pdf`, { maxRedirects: 0 });
      expect([302, 307, 308]).toContain(anonPdf.status());

      // El admin lo revoca desde el panel: la verificación dice "Revocado" y el PDF da 410.
      const admin = await createSessionFor("admin@civa.demo");
      await loginAs(page, CIVA, admin);
      await page.goto(`${CIVA}/admin/certificados?q=${code}`);
      await expect(page.getByText(`Código ${code}`)).toBeVisible();
      await page.getByText("Revocar", { exact: true }).click();
      await page.locator('input[id^="reason-Revocar-"]').fill("Prueba automática");
      await page.getByRole("button", { name: "Confirmar: revocar" }).click();
      await expect(page.getByText("Certificado revocado.")).toBeVisible();
      expect(await countAudit("certificate.revoke", code)).toBe(1);

      await publicPage.goto(`${CIVA}/verificar/${code}`);
      await expect(publicPage.getByText("Revocado", { exact: true })).toBeVisible();
      await expect(publicPage.getByText("Prueba automática")).toHaveCount(0);
      await expect(publicPage.getByText("Test Alumno")).toHaveCount(0);
      await loginAs(page, CIVA, sessionToken);
      expect((await page.request.get(`${CIVA}/api/certificates/${code}/pdf`)).status()).toBe(410);
      await anonymous.close();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("un examen desaprobado no emite y deja la espera entre intentos", async ({ page }) => {
    const email = `t3-fail-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    try {
      await seedProgress(email, "civa", COURSE, 999);
      await loginAs(page, CIVA, sessionToken);
      await page.goto(EXAM_URL);
      await startExam(page);
      await answerAll(page, examBank, "wrong");
      await submitExam(page);

      await expect(page.getByText("No llegaste a la nota mínima (70).")).toBeVisible();
      await expect(page.getByText("Te quedan 2 intentos.")).toBeVisible();
      await expect(page.getByText("Tenés que esperar 1 h antes de volver a rendir.")).toBeVisible();
      // Política `after_pass`: sin revisión de respuestas si desaprobó.
      await expect(page.getByRole("button", { name: /revisión/ })).toHaveCount(0);
      expect(await countCertificates(email, "civa")).toBe(0);

      // Con la espera cumplida puede volver a empezar.
      await ageAttempts(email, 120);
      await page.goto(EXAM_URL);
      await expect(page.getByText("2 de 3 restantes")).toBeVisible();
      await expect(page.getByRole("button", { name: "Empezar otro intento" })).toBeEnabled();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("el examen espera a que estén todas las lecciones", async ({ page }) => {
    const email = `t3-locked-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    try {
      await seedProgress(email, "civa", COURSE, 2);
      await loginAs(page, CIVA, sessionToken);
      await page.goto(EXAM_URL);
      await expect(page.getByText("Completá todas las lecciones del curso para habilitar el examen.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Empezar el examen" })).toHaveCount(0);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("sin nombre en el perfil pide cómo figurar antes de emitir", async ({ page }) => {
    const email = `t3-noname-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({
      email,
      tenantSlug: "civa",
      memberStatus: "verified",
      enrollCourseSlug: COURSE,
      withoutName: true,
    });
    try {
      await seedProgress(email, "civa", COURSE, 999);
      await loginAs(page, CIVA, sessionToken);
      await page.goto(EXAM_URL);
      await startExam(page);
      await answerAll(page, examBank, "correct");
      await submitExam(page);

      await expect(page.getByText("¿Cómo querés que figure tu nombre en el certificado?")).toBeVisible();
      expect(await countCertificates(email, "civa")).toBe(0);
      await page.getByLabel("Nombre", { exact: true }).fill("Lucía");
      await page.getByLabel("Apellido").fill("Fernández Paz");
      await page.getByRole("button", { name: "Emitir mi certificado" }).click();
      await expect(page.getByText("Tu certificado está listo")).toBeVisible();
      expect(await countCertificates(email, "civa")).toBe(1);

      await page.goto(`${CIVA}/mi-campus/certificados`);
      await expect(page.getByText("Eficiencia energética para PyMEs industriales")).toBeVisible();
      await expect(page.getByRole("link", { name: "Descargar PDF" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copiar link de verificación" })).toBeVisible();
      const linkedin = await page.getByRole("link", { name: "Compartir en LinkedIn" }).getAttribute("href");
      const params = new URL(linkedin!).searchParams;
      expect(params.get("name")).toBe("Eficiencia energética para PyMEs industriales");
      expect(params.get("organizationName")).toBe("Cámara Industrial Valle Azul");
      expect(params.get("certId")).toMatch(/^PC-/);
      expect(params.get("certUrl")).toContain("/verificar/PC-");
    } finally {
      await deleteTestUser(email);
    }
  });

  test("nadie más baja el PDF de otro alumno", async ({ page }) => {
    const owner = `t3-owner-${RUN}@civa.demo`;
    const other = `t3-other-${RUN}@civa.demo`;
    const ownerSession = await createTestStudent({ email: owner, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    const otherSession = await createTestStudent({ email: other, tenantSlug: "civa", memberStatus: "verified" });
    const riberaAdmin = await createSessionFor("admin@ribera.demo");
    try {
      await seedProgress(owner, "civa", COURSE, 999);
      await loginAs(page, CIVA, ownerSession.sessionToken);
      await page.goto(EXAM_URL);
      await startExam(page);
      await answerAll(page, examBank, "correct");
      await submitExam(page);
      await expect(page.getByText("Tu certificado está listo")).toBeVisible();
      const code = (await getActiveCertificateCode(owner, "civa"))!;

      expect((await page.request.get(`${CIVA}/api/certificates/${code}/pdf`)).status()).toBe(200);

      const stranger = await page.context().browser()!.newContext();
      await stranger.addCookies([{ name: "authjs.session-token", value: otherSession.sessionToken, url: CIVA }]);
      expect((await stranger.request.get(`${CIVA}/api/certificates/${code}/pdf`)).status()).toBe(404);
      await stranger.addCookies([{ name: "authjs.session-token", value: riberaAdmin, url: CIVA }]);
      expect((await stranger.request.get(`${CIVA}/api/certificates/${code}/pdf`)).status()).toBe(404);
      await stranger.close();
    } finally {
      await deleteTestUser(owner);
      await deleteTestUser(other);
    }
  });
});

test.describe("quiz de práctica", () => {
  test("se corrige en el servidor, muestra explicaciones, completa la lección y se puede repetir", async ({ page }) => {
    const email = `t3-quiz-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-repaso`);
      await expect(page.getByRole("button", { name: "Empezar el repaso" })).toBeVisible();
      await expect(page.getByText("Intentos")).toHaveCount(0);
      await page.getByRole("button", { name: "Empezar el repaso" }).click();
      await expect(page.locator("fieldset")).toHaveCount(5);

      // Antes de enviar, el HTML no trae ni las respuestas ni las explicaciones.
      const html = await page.content();
      for (const question of quizBank) {
        if (question.explanation) expect(html).not.toContain(question.explanation);
      }

      await answerAll(page, quizBank, "correct");
      await page.getByRole("button", { name: "Enviar respuestas" }).click();
      await page.getByRole("button", { name: "Sí, enviar" }).click();
      await expect(page.getByText("100", { exact: false }).first()).toBeVisible();
      await expect(page.getByText("5 de 5 correctas")).toBeVisible();

      await page.getByRole("button", { name: /Ver la revisión/ }).click();
      const withExplanation = quizBank.find((q) => q.explanation)!;
      await expect(page.getByText(withExplanation.explanation!)).toBeVisible();

      // La lección quedó completada y se puede repetir sin límite.
      await page.goto(`${CIVA}/aprender/${COURSE}/m1-repaso`);
      await expect(page.getByText("Intento 1")).toBeVisible();
      await expect(page.getByRole("button", { name: "Repetir el repaso" })).toBeEnabled();
      expect(await countCertificates(email, "civa")).toBe(0);
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("verificación pública", () => {
  test("un código inexistente o mal escrito dice que no lo encuentra", async ({ page }) => {
    await page.goto(`${CIVA}/verificar/PC-ZZZZ-ZZZZ`);
    await expect(page.getByText("No encontramos un certificado con ese código.")).toBeVisible();
    await page.goto(`${CIVA}/verificar/basura`);
    await expect(page.getByText("No encontramos un certificado con ese código.")).toBeVisible();
  });

  test("el formulario normaliza el código y lleva a la verificación", async ({ page }) => {
    await page.goto(`${CIVA}/verificar`);
    await page.getByLabel("Código del certificado").fill("pc zzzz zzzz");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/verificar\/PC-ZZZZ-ZZZZ$/);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("el examen muestra una pregunta por pantalla y no desborda", async ({ page }) => {
    const email = `t3-mobile-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", memberStatus: "verified", enrollCourseSlug: COURSE });
    try {
      await seedProgress(email, "civa", COURSE, 999);
      await loginAs(page, CIVA, sessionToken);
      await page.goto(EXAM_URL);
      await page.getByRole("button", { name: "Empezar el examen" }).click();
      await expect(page.locator("fieldset")).toHaveCount(15);

      const visible = page.locator("fieldset:visible");
      await expect(visible).toHaveCount(1);
      await expect(page.getByText("Pregunta 1 de 15").first()).toBeVisible();
      await page.getByRole("button", { name: "Siguiente" }).click();
      await expect(page.getByText("Pregunta 2 de 15").first()).toBeVisible();
      await page.getByRole("button", { name: "Anterior" }).click();
      await expect(page.getByText("Pregunta 1 de 15").first()).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await deleteTestUser(email);
    }
  });
});
