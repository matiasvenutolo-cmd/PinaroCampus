import { expect, test, type Page } from "@playwright/test";

import { buildValidCuit } from "../../src/lib/cuit";

import {
  countEmailsTo,
  createSessionFor,
  createTestStudent,
  deleteCompanyByName,
  deleteTestCompany,
  deleteTestUser,
  getEnrollment,
  getLatestEmailLink,
  getMembershipOf,
  getOrderByEmail,
  getSeatCodes,
  setMemberStatus,
} from "./db";

// Fase 4: compra con pago simulado y transferencia, vacantes, canje, padrón y socios.
const CIVA = "http://civa.localhost:3000";
const COURSE = "eficiencia-energetica-pymes-industriales";
const BRISCO_CUIT = "30000000104"; // Talleres Brisco S.A. (socia), ver seed
const RUN = Math.random().toString(36).slice(2, 7);

async function loginAs(page: Page, host: string, sessionToken: string) {
  await page.context().addCookies([{ name: "authjs.session-token", value: sessionToken, url: host }]);
}

async function buyWithMock(page: Page, outcome: "Aprobar" | "Rechazar" | "Dejar pendiente") {
  await page.goto(`${CIVA}/cursos/${COURSE}`);
  await page.getByRole("button", { name: "Inscribirme" }).first().click();
  await page.waitForURL("**/checkout/*");
  await expect(page.getByRole("heading", { name: "Pagar" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL("**/checkout/simulado/*");
  await expect(page.getByText("Esto es un pago simulado para la demo")).toBeVisible();
  await page.getByRole("button", { name: outcome }).click();
  await page.waitForURL("**/resultado");
}

test.describe.configure({ timeout: Number(process.env.E2E_TIMEOUT ?? 240_000) });

test.describe("compra individual con pago simulado", () => {
  test("un no socio paga el precio general y un socio el de socio; ambos quedan inscriptos", async ({ browser }) => {
    const guest = `t4-guest-${RUN}@civa.demo`;
    const member = `t4-member-${RUN}@civa.demo`;
    const guestSession = await createTestStudent({ email: guest, tenantSlug: "civa" });
    const memberSession = await createTestStudent({ email: member, tenantSlug: "civa", companyName: "Talleres Brisco S.A.", memberStatus: "verified" });
    try {
      const guestPage = await (await browser.newContext()).newPage();
      await loginAs(guestPage, CIVA, guestSession.sessionToken);
      await guestPage.goto(`${CIVA}/cursos/${COURSE}`);
      await expect(guestPage.getByText("$ 90.000").first()).toBeVisible();
      await buyWithMock(guestPage, "Aprobar");
      await expect(guestPage.getByRole("heading", { name: "¡Pago confirmado!" })).toBeVisible();
      await expect(guestPage.getByText("$ 90.000")).toBeVisible();
      await expect(guestPage.getByRole("link", { name: "Ir al curso" })).toBeVisible();
      expect(await getEnrollment(guest, "civa", COURSE)).toMatchObject({ source: "purchase" });
      expect(await getOrderByEmail(guest, "civa")).toMatchObject([{ status: "paid", totalCents: 9_000_000, fulfilled: true }]);

      const memberPage = await (await browser.newContext()).newPage();
      await loginAs(memberPage, CIVA, memberSession.sessionToken);
      await memberPage.goto(`${CIVA}/cursos/${COURSE}`);
      await expect(memberPage.getByText("Precio socio").first()).toBeVisible();
      await buyWithMock(memberPage, "Aprobar");
      await expect(memberPage.getByRole("heading", { name: "¡Pago confirmado!" })).toBeVisible();
      await expect(memberPage.getByText("precio socio")).toBeVisible();
      expect(await getOrderByEmail(member, "civa")).toMatchObject([{ status: "paid", totalCents: 4_500_000 }]);
      expect(await countEmailsTo(member)).toBeGreaterThanOrEqual(1);

      // Ya inscripto: "Inscribirme" no existe, y Mis compras muestra la orden.
      await memberPage.goto(`${CIVA}/mis-compras`);
      await expect(memberPage.getByText("Pagada")).toBeVisible();
    } finally {
      await deleteTestUser(guest);
      await deleteTestUser(member);
    }
  });

  test("un pago rechazado no inscribe y se puede reintentar", async ({ page }) => {
    const email = `t4-reject-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await loginAs(page, CIVA, sessionToken);
      await buyWithMock(page, "Rechazar");
      await expect(page.getByRole("heading", { name: "No se pudo procesar el pago" })).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toBeNull();

      await page.getByRole("link", { name: "Reintentar el pago" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.waitForURL("**/checkout/simulado/*");
      await page.getByRole("button", { name: "Aprobar" }).click();
      await expect(page.getByRole("heading", { name: "¡Pago confirmado!" })).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toMatchObject({ source: "purchase" });
      expect(await getOrderByEmail(email, "civa")).toHaveLength(1);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("'dejar pendiente' mantiene la orden sin inscribir", async ({ page }) => {
    const email = `t4-pending-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await loginAs(page, CIVA, sessionToken);
      await buyWithMock(page, "Dejar pendiente");
      await expect(page.getByRole("heading", { name: "Estamos confirmando tu pago" })).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toBeNull();
      expect(await getOrderByEmail(email, "civa")).toMatchObject([{ status: "pending" }]);
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("transferencia", () => {
  test("queda pendiente con instrucciones; el admin la marca pagada y el alumno queda inscripto", async ({ browser }) => {
    const email = `t4-transfer-${RUN}@civa.demo`;
    const student = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      const page = await (await browser.newContext()).newPage();
      await loginAs(page, CIVA, student.sessionToken);
      await page.goto(`${CIVA}/cursos/${COURSE}`);
      await page.getByRole("button", { name: "Inscribirme" }).first().click();
      await page.waitForURL("**/checkout/*");
      await page.getByLabel(/Transferencia bancaria/).check();
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.waitForURL("**/resultado");

      await expect(page.getByRole("heading", { name: "Falta la transferencia" })).toBeVisible();
      await expect(page.getByText("Alias: CIVA.CAMPUS.DEMO")).toBeVisible();
      await expect(page.getByRole("button", { name: "Copiar datos" })).toBeVisible();
      const [order] = await getOrderByEmail(email, "civa");
      expect(order.status).toBe("awaiting_payment");
      await expect(page.getByText(order.number).first()).toBeVisible();
      expect(await getEnrollment(email, "civa", COURSE)).toBeNull();
      expect(await countEmailsTo(email)).toBe(1);

      const adminPage = await (await browser.newContext()).newPage();
      await loginAs(adminPage, CIVA, await createSessionFor("admin@civa.demo"));
      await adminPage.goto(`${CIVA}/admin/ordenes?estado=transferencias&q=${order.number}`);
      await expect(adminPage.getByText(order.number).first()).toBeVisible();
      await adminPage.getByLabel("Nro. de operación (opcional)").fill("OP-E2E-1");
      await adminPage.getByRole("button", { name: "Marcar como pagada" }).click();
      await expect(adminPage.getByText("Orden marcada como pagada")).toBeVisible();

      expect(await getEnrollment(email, "civa", COURSE)).toMatchObject({ source: "purchase" });
      expect((await getOrderByEmail(email, "civa"))[0]).toMatchObject({ status: "paid", fulfilled: true });
      expect(await countEmailsTo(email)).toBe(2); // instrucciones + pago confirmado
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("vacantes para el equipo", () => {
  test("compra de 5, envío por email, canje desde otra cuenta y estado actualizado", async ({ browser }) => {
    const buyer = `t4-pack-${RUN}@civa.demo`;
    const employee = `t4-emp-${RUN}@civa.demo`;
    const invited = [`t4-inv-a-${RUN}@civa.demo`, `t4-inv-b-${RUN}@civa.demo`, `t4-inv-c-${RUN}@civa.demo`];
    const buyerSession = await createTestStudent({ email: buyer, tenantSlug: "civa", companyName: "Talleres Brisco S.A.", memberStatus: "verified" });
    const employeeSession = await createTestStudent({ email: employee, tenantSlug: "civa" });
    try {
      const page = await (await browser.newContext()).newPage();
      await loginAs(page, CIVA, buyerSession.sessionToken);

      await page.goto(`${CIVA}/cursos/${COURSE}`);
      await page.getByRole("link", { name: "Comprar para mi equipo" }).first().click();
      await page.waitForURL("**/empresas/comprar**");
      await page.getByLabel(/Cantidad de vacantes/).fill("5");
      await page.getByLabel("CUIT de la empresa").fill(BRISCO_CUIT);
      await page.getByRole("button", { name: "Ver el precio" }).click();
      await expect(page.getByText("Precio por vacante")).toBeVisible();
      await expect(page.getByText("$ 225.000")).toBeVisible(); // 5 × $ 45.000 (socio)
      await page.getByRole("button", { name: "Continuar al pago" }).click();
      await page.waitForURL("**/checkout/*");
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.waitForURL("**/checkout/simulado/*");
      await page.getByRole("button", { name: "Aprobar" }).click();
      await expect(page.getByRole("heading", { name: "¡Pago confirmado!" })).toBeVisible();

      await page.getByRole("link", { name: "Ver mis códigos" }).click();
      await page.waitForURL("**/mis-compras/*");
      const [order] = await getOrderByEmail(buyer, "civa");
      expect(order).toMatchObject({ type: "seat_pack", status: "paid", codes: 5 });
      await expect(page.getByText("Compradas").locator("..")).toContainText("5");
      await expect(page.getByRole("button", { name: "Copiar todos los códigos" })).toBeVisible();

      // CSV de códigos
      const csv = await page.request.get(`${CIVA}/mis-compras/${order.id}/codigos.csv`);
      expect(csv.status()).toBe(200);
      const text = await csv.text();
      expect(text.split("\r\n").filter(Boolean)).toHaveLength(6); // encabezado + 5

      // Enviar 3 códigos por email
      await page.getByLabel("Enviar códigos por email").fill(invited.join("\n"));
      await expect(page.getByText("3 emails válidos")).toBeVisible();
      await page.getByRole("button", { name: "Enviar 3 códigos" }).click();
      await expect(page.getByText("Enviamos 3 códigos")).toBeVisible();
      for (const email of invited) expect(await countEmailsTo(email)).toBe(1);
      const codes = await getSeatCodes(order.id);
      expect(codes.filter((c) => c.status === "sent")).toHaveLength(3);
      await expect(page.getByText(`Enviado a ${invited[0]}`)).toBeVisible();

      // Canjea una persona desde otra cuenta, con el link del email (código precargado).
      const sent = codes.find((c) => c.sent_to_email === invited[0])!;
      const employeePage = await (await browser.newContext()).newPage();
      await loginAs(employeePage, CIVA, employeeSession.sessionToken);
      await employeePage.goto(`${CIVA}/canjear?codigo=${sent.code}`);
      await expect(employeePage.getByLabel("Código")).toHaveValue(sent.code);
      await employeePage.getByRole("button", { name: "Canjear" }).click();
      await employeePage.waitForURL(`**/aprender/${COURSE}**`);
      expect(await getEnrollment(employee, "civa", COURSE)).toMatchObject({ source: "seat_code" });
      expect((await getMembershipOf(employee, "civa"))?.companySource).toBe("roster");

      // El mismo código no se canjea dos veces.
      await employeePage.goto(`${CIVA}/canjear?codigo=${sent.code}`);
      await employeePage.getByRole("button", { name: "Canjear" }).click();
      await expect(employeePage.getByText("Ese código ya fue canjeado.")).toBeVisible();

      // El comprador ve el estado actualizado.
      await page.reload();
      await expect(page.getByText("Canjeadas").locator("..")).toContainText("1");
      await expect(page.getByText("Canjeado", { exact: true }).first()).toBeVisible();
    } finally {
      await deleteTestUser(buyer);
      await deleteTestUser(employee);
    }
  });

  test("el CUIT inválido o una cantidad fuera de rango se rechazan en el servidor", async ({ page }) => {
    const email = `t4-bad-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa", companyName: "Talleres Brisco S.A.", memberStatus: "verified" });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/empresas/comprar?curso=${COURSE}&cantidad=5&cuit=20-12345678-0`);
      await expect(page.getByText("Revisá el CUIT")).toBeVisible();
      await page.goto(`${CIVA}/empresas/comprar?curso=${COURSE}&cantidad=1&cuit=${BRISCO_CUIT}`);
      await expect(page.getByText("La cantidad no es válida para esta cámara.")).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("volver a la compra después de ingresar", () => {
  test("sin sesión, 'Ingresar e inscribirme' → ingresar → onboarding → de vuelta en el curso", async ({ page }) => {
    const email = `t4-return-${RUN}@civa.demo`;
    try {
      await page.goto(`${CIVA}/cursos/${COURSE}`);
      await page.getByRole("button", { name: "Ingresar e inscribirme" }).first().click();
      await page.waitForURL("**/ingresar");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Enviarme el link de ingreso" }).click();
      await expect(page.getByRole("heading", { name: "Revisá tu email" })).toBeVisible();

      await page.goto((await getLatestEmailLink(email))!);
      await page.waitForURL("**/bienvenida");
      await page.getByLabel("Nombre").fill("Vuelta");
      await page.getByLabel("Apellido").fill("Prueba");
      await page.getByLabel(/Acepto los/).click();
      await page.getByRole("button", { name: "Empezar" }).click();
      await page.waitForURL(`**/cursos/${COURSE}`);
      await expect(page.getByRole("heading", { level: 1, name: "Eficiencia energética para PyMEs industriales" })).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("panel de la cámara", () => {
  test("importar el padrón: vista previa con errores por fila y confirmación", async ({ page }) => {
    const good1 = buildValidCuit("3098765401");
    const good2 = buildValidCuit("3098765402");
    const names = [`Importada Uno ${RUN} S.A.`, `Importada Dos ${RUN} S.R.L.`];
    await loginAs(page, CIVA, await createSessionFor("admin@civa.demo"));
    try {
      await page.goto(`${CIVA}/admin/empresas`);
      const csv = [
        "CUIT;Razón social;Socio;Dominios",
        `${good1};${names[0]};sí;importada1.com.ar`,
        `${good2};${names[1]};no;`,
        "20-12345678-0;CUIT roto S.A.;sí;",
      ].join("\n");
      await page.getByLabel("…o pegá el contenido").fill(csv);
      await page.getByRole("button", { name: "Ver vista previa" }).click();

      await expect(page.getByText("2 de 3 filas son válidas")).toBeVisible();
      await expect(page.getByText("Línea 4: CUIT inválido")).toBeVisible();
      await expect(page.getByText(names[0])).toBeVisible();
      // La vista previa no guardó nada.
      await page.goto(`${CIVA}/admin/empresas?q=${RUN}`);
      await expect(page.getByText("No hay empresas con ese criterio.")).toBeVisible();

      await page.getByLabel("…o pegá el contenido").fill(csv);
      await page.getByRole("button", { name: "Ver vista previa" }).click();
      await page.getByRole("button", { name: "Importar 2 empresas" }).click();
      await expect(page.getByText("Listo: 2 empresas creadas y 0 actualizadas.")).toBeVisible();

      await page.goto(`${CIVA}/admin/empresas?q=${RUN}`);
      await expect(page.getByText(names[0])).toBeVisible();
      await expect(page.getByText("Socia", { exact: true })).toBeVisible();
      await expect(page.getByText(`@importada1.com.ar`)).toBeVisible();

      // Importar de nuevo actualiza, no duplica.
      await page.goto(`${CIVA}/admin/empresas`);
      await page.getByLabel("…o pegá el contenido").fill(csv);
      await page.getByRole("button", { name: "Ver vista previa" }).click();
      await expect(page.getByText("0 empresas nuevas y 2 para actualizar")).toBeVisible();
    } finally {
      await deleteTestCompany(good1);
      await deleteTestCompany(good2);
    }
  });

  test("aprobar un pedido de socio pendiente", async ({ page }) => {
    const email = `t4-member-pending-${RUN}@civa.demo`;
    await createTestStudent({ email, tenantSlug: "civa", companyName: "Talleres Brisco S.A.", memberStatus: "none" });
    await setMemberStatus(email, "civa", "pending");
    try {
      await loginAs(page, CIVA, await createSessionFor("admin@civa.demo"));
      await page.goto(`${CIVA}/admin/socios`);
      const row = page.locator("li", { hasText: email });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Aprobar" }).click();
      await expect(page.getByText("Socio aprobado")).toBeVisible();
      expect(await getMembershipOf(email, "civa")).toMatchObject({ memberStatus: "verified" });
      expect(await countEmailsTo(email)).toBe(1);
      await expect(page.locator("li", { hasText: email })).toHaveCount(0);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("agregar y editar una empresa a mano, con CUIT validado", async ({ page }) => {
    const cuit = buildValidCuit("3098765409");
    const name = `Manual ${RUN} S.A.`;
    await loginAs(page, CIVA, await createSessionFor("admin@civa.demo"));
    try {
      await page.goto(`${CIVA}/admin/empresas`);
      await page.getByText("Agregar una empresa a mano").click();
      await page.getByLabel("CUIT").first().fill("20-12345678-0");
      await page.getByLabel("Razón social").first().fill(name);
      await page.getByRole("button", { name: "Agregar empresa" }).click();
      await expect(page.getByText("El CUIT no es válido.")).toBeVisible();

      await page.getByText("Agregar una empresa a mano").click();
      await page.getByLabel("CUIT").first().fill(cuit);
      await page.getByLabel("Razón social").first().fill(name);
      await page.getByRole("button", { name: "Agregar empresa" }).click();
      await expect(page.getByText("Empresa agregada al padrón.")).toBeVisible();

      await page.goto(`${CIVA}/admin/empresas?q=${RUN}`);
      const card = page.locator("li", { hasText: name });
      await expect(card.getByText("No socia")).toBeVisible();
      await card.getByText("Editar").click();
      await card.getByLabel("Es socia de la cámara").check();
      await card.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Empresa actualizada.")).toBeVisible();
      await page.goto(`${CIVA}/admin/empresas?q=${RUN}`);
      await expect(page.locator("li", { hasText: name }).getByText("Socia", { exact: true })).toBeVisible();
    } finally {
      await deleteCompanyByName("civa", name);
    }
  });

  test("exportar órdenes a CSV y filtrar por estado", async ({ page }) => {
    await loginAs(page, CIVA, await createSessionFor("admin@civa.demo"));
    await page.goto(`${CIVA}/admin/ordenes`);
    await expect(page.getByRole("heading", { name: "Órdenes" })).toBeVisible();
    const csv = await page.request.get(`${CIVA}/admin/ordenes/export?estado=paid`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("Orden;Fecha;Estado");
    for (const line of text.split("\r\n").slice(1).filter(Boolean)) expect(line).toContain("Pagada");
  });

  test("un alumno no entra a las pantallas del panel", async ({ page }) => {
    const email = `t4-nope-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await loginAs(page, CIVA, sessionToken);
      for (const route of ["ordenes", "vacantes", "empresas", "socios", "ordenes/export"]) {
        const response = await page.goto(`${CIVA}/admin/${route}`);
        expect(response?.status()).toBe(404);
      }
    } finally {
      await deleteTestUser(email);
    }
  });
});

test.describe("cron de vencimientos", () => {
  test("exige el secreto", async ({ request }) => {
    const denied = await request.get(`${CIVA}/api/cron/expire-orders`);
    expect(denied.status()).toBe(401);
    const wrong = await request.get(`${CIVA}/api/cron/expire-orders`, { headers: { authorization: "Bearer nope" } });
    expect(wrong.status()).toBe(401);
  });

  test("con el secreto correcto responde la cantidad de órdenes vencidas", async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET no está configurado en este entorno");
    const ok = await request.get(`${CIVA}/api/cron/expire-orders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty("expired");
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("checkout y Mis compras sin scroll horizontal", async ({ page }) => {
    const email = `t4-mobile-${RUN}@civa.demo`;
    const { sessionToken } = await createTestStudent({ email, tenantSlug: "civa" });
    try {
      await loginAs(page, CIVA, sessionToken);
      await page.goto(`${CIVA}/cursos/${COURSE}`);
      await page.getByRole("button", { name: "Inscribirme" }).first().click();
      await page.waitForURL("**/checkout/*");
      for (const url of [page.url(), `${CIVA}/mis-compras`, `${CIVA}/canjear`, `${CIVA}/empresas/comprar?curso=${COURSE}`]) {
        await page.goto(url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, url).toBeLessThanOrEqual(0);
      }
    } finally {
      await deleteTestUser(email);
    }
  });
});

