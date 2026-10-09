import { expect, test, type Page } from "@playwright/test";

import { createSessionFor, createTestStudent, deleteTestUser, getEnrollment } from "./db";

// Campus ADS: tenant demo de Ascensores del Sur y su curso de la máquina de tracción.
const ADS = "http://ads.localhost:3000";
const CIVA = "http://civa.localhost:3000";
const COURSE = "mantenimiento-maquina-traccion-adsur";
const RUN = Math.random().toString(36).slice(2, 7);

const LESSONS = [
  "m1-video-bienvenida", "m1-l1-anatomia", "m1-l2-modelos",
  "m2-l1-reglas-seguridad", "m2-l2-puesta-en-marcha", "m2-recursos-checklist",
  "m3-l1-nivel-y-aceites", "m3-l2-engrase-y-cambio",
  "m4-l1-freno-regulacion", "m4-l2-recambio-zapatas", "m4-l3-juego-sinfin-corona",
  "m5-l1-motor-ventilacion", "m5-recursos-rodamientos", "m5-l2-traslado", "m5-l3-cambio-polea",
];

async function loginAs(page: Page, host: string, sessionToken: string) {
  await page.context().addCookies([{ name: "authjs.session-token", value: sessionToken, url: host }]);
}

test.describe.configure({ timeout: 240_000 });

test.describe("marca y catálogo de Campus ADS", () => {
  test("tiene su marca (azul ADS, acento naranja, logo) y su home", async ({ page }) => {
    await page.goto(`${ADS}/`);
    await expect(page).toHaveTitle("Campus ADS");
    await expect(page.getByText("Potenciamos la seguridad")).toBeVisible();
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.getPropertyValue("--primary").trim().toLowerCase(), style.getPropertyValue("--accent").trim().toLowerCase()];
    });
    expect(colors).toEqual(["#034ea2", "#faa61a"]);
    const logo = page.getByRole("img", { name: "Campus ADS" }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test("el catálogo muestra el curso gratis y destacado y los cursos 'Próximamente'", async ({ page }) => {
    await page.goto(`${ADS}/cursos`);
    const card = page.getByRole("link", { name: /Mantenimiento de la máquina de tracción ADSUR/ });
    await expect(card).toContainText("Gratis");
    await expect(card).toContainText("Mantenimiento técnico");
    await expect(page.getByRole("link", { name: /Exportar por primera vez/ })).toContainText("Próximamente");
    await expect(page.getByRole("link", { name: /Liderazgo para mandos medios/ })).toContainText("Próximamente");
    // El curso de otra cámara no figura.
    await expect(page.getByRole("link", { name: /Eficiencia energética/ })).toHaveCount(0);
  });

  test("el curso de ADS es propio: no existe en el catálogo de otras cámaras", async ({ page }) => {
    await page.goto(`${CIVA}/cursos`);
    await expect(page.getByRole("link", { name: /máquina de tracción ADSUR/ })).toHaveCount(0);
    await page.goto(`${CIVA}/cursos/${COURSE}`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
    await page.goto(`${ADS}/cursos/eficiencia-energetica-pymes-industriales`);
    await expect(page.getByRole("heading", { name: "Esta plataforma no está disponible" })).toBeVisible();
  });
});

test.describe("demo de Campus ADS", () => {
  test("'Entrar como alumno' muestra el curso a ~40% y 'Continuar' sigue el recorrido", async ({ page }) => {
    await page.goto(`${ADS}/demo`);
    await page.getByRole("button", { name: "Entrar como alumno" }).click();
    await page.waitForURL("**/mi-campus");
    await expect(page.getByRole("heading", { name: "Hola, Nicolás Ferreyra" })).toBeVisible();
    await expect(page.getByText("40% completado")).toBeVisible();
  });

  test("'Alumno con curso avanzado' cae en el examen final del curso de ADS", async ({ page }) => {
    await page.goto(`${ADS}/demo`);
    await page.getByRole("button", { name: "Alumno con curso avanzado" }).click();
    await page.waitForURL(`**/aprender/${COURSE}/cierre-examen-final`);
    await expect(page.getByText("15 preguntas elegidas al azar entre las 24 del banco")).toBeVisible();
    await expect(page.getByText("3 de 3 restantes")).toBeVisible();
  });

  test("el admin de ADS ve los 2 certificados sembrados y baja uno en PDF con el logo de ADS", async ({ page }) => {
    await loginAs(page, ADS, await createSessionFor("admin@ads.demo"));
    await page.goto(`${ADS}/admin/certificados`);
    await expect(page.getByText("2 certificados")).toBeVisible();
    const code = (await page.getByText(/^Código PC-/).first().innerText()).replace("Código ", "").split(" ")[0];
    const pdf = await page.request.get(`${ADS}/api/certificates/${code}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await page.goto(`${ADS}/verificar/${code}`);
    await expect(page.getByText("Válido", { exact: true })).toBeVisible();
    await expect(page.getByText("Ascensores del Sur")).toBeVisible();
    await expect(page.getByText("4,5 horas")).toBeVisible();
  });

  test("inscripción gratuita: el curso cuesta $ 0 y el alumno entra directo", async ({ page }) => {
    const email = `t5-free-${RUN}@ads.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "ads" });
    try {
      await loginAs(page, ADS, sessionToken);
      await page.goto(`${ADS}/cursos/${COURSE}`);
      await page.getByRole("button", { name: "Inscribirme" }).first().click();
      await page.waitForURL(`**/aprender/${COURSE}/**`);
      expect(await getEnrollment(email, "ads", COURSE)).toMatchObject({ source: "free", progressPct: 0 });
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("el curso en el reproductor", () => {
  test("las 23 imágenes del manual cargan y ninguna lección desborda, en desktop y en mobile", async ({ browser }) => {
    const email = `t5-reader-${RUN}@ads.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "ads", enrollCourseSlug: COURSE });
    try {
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await loginAs(page, ADS, sessionToken);
        let images = 0;
        for (const key of LESSONS) {
          await page.goto(`${ADS}/aprender/${COURSE}/${key}`);
          await expect(page.locator("article h1")).toBeVisible();
          const sizes = await page.evaluate(async () => {
            const imgs = [...document.querySelectorAll<HTMLImageElement>("article img")];
            for (const img of imgs) img.loading = "eager";
            await Promise.all(imgs.map((img) => img.decode().catch(() => null)));
            return imgs.map((img) => ({ src: img.getAttribute("src"), natural: img.naturalWidth, shown: img.getBoundingClientRect().width }));
          });
          for (const image of sizes) {
            expect(image.natural, `${key}: ${image.src}`).toBeGreaterThan(0);
            expect(image.shown, `${key}: ${image.src} se sale del ancho`).toBeLessThanOrEqual(viewport.width);
          }
          images += sizes.length;
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, `${key} a ${viewport.width}px`).toBeLessThanOrEqual(0);
        }
        expect(images).toBe(23);
        await context.close();
      }
    } finally {
      await deleteTestUser(email);
    }
  });

  test("los recursos descargables abren (CSV con BOM) para el alumno inscripto", async ({ page }) => {
    const email = `t5-res-${RUN}@ads.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "ads", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, ADS, sessionToken);
      for (const file of ["lista-verificacion-maquina-traccion.csv", "rodamientos-por-modelo.csv", "ficha-de-equipo.csv"]) {
        const response = await page.request.get(`${ADS}/api/course-files/${COURSE}/resources/${file}`);
        expect(response.status(), file).toBe(200);
        expect((await response.text()).startsWith("﻿"), file).toBe(true);
      }
      await page.goto(`${ADS}/aprender/${COURSE}/m2-recursos-checklist`);
      await expect(page.getByRole("link", { name: "Descargar" })).toHaveCount(1);
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("calculadoras de la máquina de tracción", () => {
  test("cronograma de mantenimiento: con los datos de Las Tipas hay 3 tareas vencidas", async ({ page }) => {
    const email = `t5-calc1-${RUN}@ads.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "ads", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, ADS, sessionToken);
      await page.goto(`${ADS}/aprender/${COURSE}/m3-l2-engrase-y-cambio`);
      const calculator = page.getByRole("region", { name: "Calculadora: Próximos vencimientos de mantenimiento" });
      await expect(calculator.getByText(/Vencido hace \d+ días/)).toHaveCount(3);
      await expect(calculator.getByText("Primer cambio de aceite del reductor", { exact: true })).toBeVisible();
      await expect(calculator.getByText("Engrase del tercer apoyo", { exact: true })).toBeVisible();
      await expect(calculator.getByText("Control de juego sinfín-corona", { exact: true })).toBeVisible();
      await expect(calculator.getByText("Frecuencias según el manual de mantenimiento ADSUR, versión 01.2014")).toBeVisible();

      // El último cambio de aceite solo se habilita si ya se hizo el primero.
      const lastChange = calculator.getByLabel("Fecha del último cambio de aceite");
      await expect(lastChange).toBeDisabled();
      await calculator.getByLabel("¿Ya se hizo el primer cambio de aceite?").selectOption("yes");
      await expect(lastChange).toBeEnabled();
      await expect(calculator.getByText("Completá esta fecha")).toBeVisible();
      await lastChange.fill(new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10));
      await expect(calculator.getByText("Cambio de aceite del reductor", { exact: true })).toBeVisible();
      await expect(calculator.getByText(/Vencido hace \d+ días/)).toHaveCount(2);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("juego sinfín-corona: 37,7% en verde, y cambia con la medición y el modelo", async ({ page }) => {
    const email = `t5-calc2-${RUN}@ads.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "ads", enrollCourseSlug: COURSE });
    try {
      await loginAs(page, ADS, sessionToken);
      await page.goto(`${ADS}/aprender/${COURSE}/m4-l3-juego-sinfin-corona`);
      const calculator = page.getByRole("region", { name: "Calculadora: Juego entre sinfín y corona" });
      await expect(calculator.getByText("37,7%")).toBeVisible();
      await expect(calculator.getByText("Dentro de tolerancia", { exact: true })).toBeVisible();
      await expect(calculator.getByText("El umbral de 70% es orientativo y no figura en el manual del fabricante.")).toBeVisible();

      const distance = calculator.getByLabel(/Distancia A medida/);
      await distance.fill("40");
      await expect(calculator.getByText("Dentro de tolerancia: acortá la frecuencia de control")).toBeVisible();
      await distance.fill("60");
      await expect(calculator.getByText("Fuera de tolerancia: consultá al servicio técnico del fabricante")).toBeVisible();
      await distance.fill("3");
      await expect(calculator.getByText("Revisá la medición: el valor es menor que el de una máquina nueva")).toBeVisible();
      await distance.fill("");
      await expect(calculator.getByText("Ingresá la distancia A en mm (mayor a 0)")).toBeVisible();

      await distance.fill("21");
      await calculator.getByLabel("Modelo de máquina").selectOption("M-137");
      await expect(calculator.getByText("Rango admisible del manual")).toBeVisible();
      await expect(calculator.getByText("3,5 a 38,5 mm")).toBeVisible();
      await expect(calculator.getByText("50%", { exact: true })).toBeVisible(); // (21 − 3,5) ÷ 35
    } finally {
      await deleteTestUser(email);
    }
  });
});
