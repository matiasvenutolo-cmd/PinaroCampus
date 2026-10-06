/**
 * Seed idempotente de la demo (docs/09-demo-y-seed.md). Upsert por claves
 * naturales: correrlo de nuevo no duplica nada. Todo es ficticio.
 *
 * El contenido de cursos, inscripciones, órdenes y certificados se agrega en
 * las fases siguientes (el seed "crece en cada fase").
 */
import { and, eq } from "drizzle-orm";
import { config as loadEnv } from "dotenv";

import {
  companies,
  tenantDomains,
  tenantMemberships,
  tenants,
  users,
  type PaymentMethod,
} from "../src/lib/db/schema";
import { buildValidCuit } from "../src/lib/cuit";
import { defaultTenantCertificateConfig } from "../src/lib/tenant/types";

// `db` y `resolveMembershipForCuit` importan `src/env.ts` transitivamente, que
// valida `process.env` apenas se evalúa el módulo. Como los imports estáticos
// se resuelven antes que cualquier código propio del archivo, hay que cargar
// `.env.local` primero y recién después importarlos dinámicamente.
loadEnv({ path: ".env.local" });
const { db } = await import("../src/lib/db");
const { resolveMembershipForCuit } = await import("../src/lib/tenant/membership");

const FIRST_NAMES = [
  "Juan",
  "María",
  "Carlos",
  "Ana",
  "Jorge",
  "Laura",
  "Diego",
  "Sofía",
  "Martín",
  "Lucía",
  "Pablo",
  "Valentina",
  "Fernando",
  "Camila",
  "Gustavo",
  "Julieta",
  "Ricardo",
  "Agustina",
  "Sergio",
  "Florencia",
  "Alejandro",
  "Romina",
  "Daniel",
  "Paula",
  "Matías",
  "Carolina",
  "Andrés",
  "Natalia",
  "Esteban",
  "Victoria",
  "Hugo",
  "Mariana",
  "Raúl",
];

const LAST_NAMES = [
  "González",
  "Rodríguez",
  "Fernández",
  "López",
  "Martínez",
  "García",
  "Pérez",
  "Sánchez",
  "Romero",
  "Díaz",
  "Álvarez",
  "Torres",
  "Ruiz",
  "Ramírez",
  "Flores",
  "Acosta",
  "Benítez",
  "Medina",
  "Herrera",
  "Suárez",
  "Rojas",
  "Molina",
  "Ortiz",
  "Silva",
  "Castro",
  "Núñez",
  "Vega",
  "Rivas",
  "Campos",
  "Paz",
  "Ibáñez",
  "Ferreyra",
  "Luna",
];

function slugifyName(firstName: string, lastName: string) {
  return `${firstName}.${lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z.]/g, "");
}

async function upsertTenant(data: typeof tenants.$inferInsert) {
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, data.slug));
  if (existing) {
    const [updated] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(tenants).values(data).returning();
  return created;
}

async function upsertDomain(tenantId: string, hostname: string, isPrimary: boolean) {
  await db
    .insert(tenantDomains)
    .values({ tenantId, hostname, isPrimary })
    .onConflictDoUpdate({ target: tenantDomains.hostname, set: { tenantId, isPrimary } });
}

async function upsertUser(data: Partial<typeof users.$inferInsert> & { email: string }) {
  const [existing] = await db.select().from(users).where(eq(users.email, data.email));
  if (existing) {
    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(users).values(data).returning();
  return created;
}

async function upsertCompany(data: typeof companies.$inferInsert) {
  const [existing] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.tenantId, data.tenantId), eq(companies.cuit, data.cuit)));
  if (existing) {
    const [updated] = await db
      .update(companies)
      .set(data)
      .where(eq(companies.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(companies).values(data).returning();
  return created;
}

async function upsertMembership(data: typeof tenantMemberships.$inferInsert) {
  await db
    .insert(tenantMemberships)
    .values(data)
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: data,
    });
}

async function seedTenant({
  slug,
  name,
  shortName,
  campusName,
  theme,
  memberValidationMode,
  collectionMode,
  platformFeeBps,
  paymentMethods,
  manualPaymentInstructions,
  heroTitle,
  heroSubtitle,
  domains,
  companiesSeed,
  adminEmail,
  studentCount,
  studentDomain,
  pendingStudent,
}: {
  slug: string;
  name: string;
  shortName: string;
  campusName: string;
  theme: { primary: string; accent: string };
  memberValidationMode: "cuit" | "cuit_email_domain";
  collectionMode: "tenant_account" | "platform_account";
  platformFeeBps: number;
  paymentMethods: PaymentMethod[];
  manualPaymentInstructions: string;
  heroTitle: string;
  heroSubtitle: string;
  domains: { hostname: string; isPrimary: boolean }[];
  companiesSeed: { legalName: string; cuitSeed: number; isMember: boolean; emailDomain: string }[];
  adminEmail: string;
  studentCount: number;
  studentDomain: string;
  pendingStudent?: { company: string };
}) {
  const tenant = await upsertTenant({
    slug,
    name,
    shortName,
    campusName,
    contactEmail: `campus@${slug}.demo`,
    isDemo: true,
    theme: { primary: theme.primary, primaryForeground: "auto", accent: theme.accent, accentForeground: "auto", radius: 12 },
    homeContent: { heroTitle, heroSubtitle },
    certificateConfig: defaultTenantCertificateConfig,
    memberValidationMode,
    collectionMode,
    platformFeeBps,
    paymentMethods,
    manualPaymentInstructions,
  });

  for (const domain of domains) {
    await upsertDomain(tenant.id, domain.hostname, domain.isPrimary);
  }

  const companyRows = new Map<string, typeof companies.$inferSelect>();
  for (const c of companiesSeed) {
    // ×10: dos seeds nunca quedan a una unidad de distancia, así el
    // corrimiento de `buildValidCuit` ante un dígito verificador imposible
    // (ver src/lib/cuit.ts) no puede chocar con el CUIT de otra empresa.
    const cuit = buildValidCuit(`30${String(c.cuitSeed * 10).padStart(8, "0")}`);
    const row = await upsertCompany({
      tenantId: tenant.id,
      cuit,
      legalName: c.legalName,
      isMember: c.isMember,
      memberSince: c.isMember ? "2022-03-01" : null,
      emailDomains: [c.emailDomain],
      source: c.isMember || c.emailDomain ? "roster" : "self_declared",
    });
    companyRows.set(c.legalName, row);
  }

  const admin = await upsertUser({ email: adminEmail });
  await upsertMembership({
    tenantId: tenant.id,
    userId: admin.id,
    role: "tenant_admin",
    onboardedAt: new Date(),
    acceptedTermsAt: new Date(),
  });

  const memberCompanies = companiesSeed.filter((c) => c.isMember);

  for (let i = 0; i < studentCount; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    const company = memberCompanies[i % memberCompanies.length];
    const email = `${slugifyName(firstName, lastName)}@${studentDomain}`;

    const student = await upsertUser({ email, firstName, lastName, name: `${firstName} ${lastName}` });
    const companyRow = companyRows.get(company.legalName)!;
    const { companyId, memberStatus } = await resolveMembershipForCuit({
      tenant,
      cuit: companyRow.cuit,
      userEmail: email,
    });

    await upsertMembership({
      tenantId: tenant.id,
      userId: student.id,
      role: "student",
      companyId,
      memberStatus,
      onboardedAt: new Date(),
      acceptedTermsAt: new Date(),
    });
  }

  // Dos usuarios fijos del guion de demo (docs/09): alumno@<slug>.demo entra
  // por el botón "Entrar como alumno" de /demo, siempre socio verificado de
  // la primera empresa socia.
  const firstMemberCuit = companyRows.get(memberCompanies[0].legalName)!.cuit;
  for (const fixedEmail of [`alumno@${slug}.demo`, `avanzado@${slug}.demo`]) {
    const student = await upsertUser({
      email: fixedEmail,
      firstName: "Alumno",
      lastName: "Demo",
      name: "Alumno Demo",
    });
    const { companyId, memberStatus } = await resolveMembershipForCuit({
      tenant,
      cuit: firstMemberCuit,
      userEmail: fixedEmail,
    });
    await upsertMembership({
      tenantId: tenant.id,
      userId: student.id,
      role: "student",
      companyId,
      memberStatus,
      onboardedAt: new Date(),
      acceptedTermsAt: new Date(),
    });
  }

  if (pendingStudent) {
    const pendingCompanyRow = companyRows.get(pendingStudent.company)!;
    // Dominio de email que a propósito NO matchea `email_domains` de la
    // empresa, para dejar un caso `pending` real en cuit_email_domain.
    const email = "pendiente@otro-dominio.demo";
    const student = await upsertUser({ email, firstName: "Pendiente", lastName: "Demo", name: "Pendiente Demo" });
    const { companyId, memberStatus } = await resolveMembershipForCuit({
      tenant,
      cuit: pendingCompanyRow.cuit,
      userEmail: email,
    });
    await upsertMembership({
      tenantId: tenant.id,
      userId: student.id,
      role: "student",
      companyId,
      memberStatus,
      onboardedAt: new Date(),
      acceptedTermsAt: new Date(),
    });
  }

  return tenant;
}

async function main() {
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL;
  if (!superadminEmail) {
    throw new Error("Falta SEED_SUPERADMIN_EMAIL en .env.local para correr el seed.");
  }
  await upsertUser({ email: superadminEmail, isSuperadmin: true });

  await seedTenant({
    slug: "civa",
    name: "Cámara Industrial Valle Azul",
    shortName: "CIVA",
    campusName: "Campus CIVA",
    theme: { primary: "#1E4FA3", accent: "#F2A900" },
    memberValidationMode: "cuit",
    collectionMode: "platform_account",
    platformFeeBps: 3000,
    paymentMethods: ["mock", "manual", "mercadopago"],
    manualPaymentInstructions:
      "Transferí a la cuenta de la Cámara. Alias: CIVA.CAMPUS.DEMO · Titular: Cámara Industrial Valle Azul. Enviá el comprobante a campus@civa.demo indicando el número de orden.",
    heroTitle: "Capacitación para la industria del Valle",
    heroSubtitle:
      "Cursos prácticos pensados para las empresas socias de la Cámara. Cursá a tu ritmo y obtené un certificado verificable.",
    domains: [
      { hostname: "plataforma.pinaro.ar", isPrimary: true },
      { hostname: "civa.localhost:3000", isPrimary: false },
    ],
    companiesSeed: [
      { legalName: "Talleres Brisco S.A.", cuitSeed: 1, isMember: true, emailDomain: "talleresbrisco.demo" },
      { legalName: "Fundición Los Aromos S.R.L.", cuitSeed: 2, isMember: true, emailDomain: "losaromos.demo" },
      { legalName: "Plásticos Del Arroyo S.A.", cuitSeed: 3, isMember: true, emailDomain: "delarroyo.demo" },
      { legalName: "Metalmecánica Quintana Hnos.", cuitSeed: 4, isMember: true, emailDomain: "quintanahnos.demo" },
      { legalName: "Alimentos Santa Brígida S.A.", cuitSeed: 5, isMember: true, emailDomain: "santabrigida.demo" },
      { legalName: "Envases Pampa Norte S.R.L.", cuitSeed: 6, isMember: false, emailDomain: "pampanorte.demo" },
      { legalName: "Tornería Ferrari & Cía.", cuitSeed: 7, isMember: false, emailDomain: "" },
    ],
    adminEmail: "admin@civa.demo",
    studentCount: 25,
    studentDomain: "talleresbrisco.demo",
  });

  await seedTenant({
    slug: "ribera",
    name: "Centro Empresario Ribera",
    shortName: "Ribera",
    campusName: "Aula Ribera",
    theme: { primary: "#0F7B5F", accent: "#E4572E" },
    memberValidationMode: "cuit_email_domain",
    collectionMode: "tenant_account",
    platformFeeBps: 5000,
    paymentMethods: ["mock", "manual"],
    manualPaymentInstructions:
      "Transferí a la cuenta del Centro Empresario Ribera. Enviá el comprobante a campus@ribera.demo indicando el número de orden.",
    heroTitle: "Capacitación para los comercios y servicios de Ribera",
    heroSubtitle: "Cursos cortos para que tu equipo se capacite sin salir del local.",
    domains: [{ hostname: "ribera.localhost:3000", isPrimary: true }],
    companiesSeed: [
      { legalName: "Comercial Ribera Norte S.A.", cuitSeed: 101, isMember: true, emailDomain: "riberanorte.demo" },
      { legalName: "Servicios Integrales del Puerto S.R.L.", cuitSeed: 102, isMember: true, emailDomain: "puertoservicios.demo" },
      { legalName: "Distribuidora Costanera S.A.", cuitSeed: 103, isMember: true, emailDomain: "costanera.demo" },
      { legalName: "Insumos Ribera Sur S.R.L.", cuitSeed: 104, isMember: false, emailDomain: "" },
    ],
    adminEmail: "admin@ribera.demo",
    studentCount: 8,
    studentDomain: "riberanorte.demo",
    pendingStudent: { company: "Comercial Ribera Norte S.A." },
  });

  console.log("Seed completo.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
