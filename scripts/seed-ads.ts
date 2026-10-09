/**
 * Campus ADS: tenant demo de Ascensores del Sur (marca en
 * /Users/…/campus-ads/marca/marca.md). Se siembra en dos pasos porque el curso
 * propio (`ownerTenant: "ads"`) necesita que el tenant exista antes del sync,
 * y el catálogo y los alumnos necesitan que el curso ya esté sincronizado:
 *
 *   seedAdsTenant()   antes de `seedCourses()`: tenant, dominio, admin y empresas
 *   seedAdsCatalog()  después: categorías, catálogo, alumnos, progreso y certificados
 *
 * Idempotente y sin pisar nada que ya exista. Todo es ficticio.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  assessments,
  categories,
  companies,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  tenantCourses,
  tenantDomains,
  tenantMemberships,
  tenants,
  users,
} from "../src/lib/db/schema";
import { buildValidCuit } from "../src/lib/cuit";

export const ADS_SLUG = "ads";
const ADS_COURSE = "mantenimiento-maquina-traccion-adsur";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const COMPANIES = [
  { legalName: "Ascensores Altamira S.R.L.", cuitSeed: 301, emailDomain: "altamira.demo" },
  { legalName: "Elevadores del Plata S.A.", cuitSeed: 302, emailDomain: "elevadoresplata.demo" },
  { legalName: "Conservadora Sur S.R.L.", cuitSeed: 303, emailDomain: "conservadorasur.demo" },
];

export async function seedAdsTenant() {
  const values = {
    slug: ADS_SLUG,
    name: "Ascensores del Sur",
    shortName: "ADS",
    campusName: "Campus ADS",
    isDemo: true,
    contactEmail: "campus@ads.demo",
    logoUrl: "/brand/ads-logo.png",
    theme: { primary: "#034EA2", primaryForeground: "auto", accent: "#FAA61A", accentForeground: "auto", radius: 12 },
    homeContent: {
      heroTitle: "Potenciamos la seguridad",
      heroSubtitle:
        "Capacitación técnica para quienes mantienen los ascensores. Cursá a tu ritmo, con el manual del fabricante convertido en rutinas claras, y obtené un certificado verificable.",
    },
    certificateConfig: {
      signatories: [
        { name: "Ing. Responsable Técnico", role: "Ascensores del Sur", signatureUrl: "/demo/firma-laura-benitez.svg" },
        { name: "Coordinación de Capacitación", role: "Ascensores del Sur", signatureUrl: "/demo/firma-diego-salvatierra.svg" },
      ],
      footerText: "Actividad de capacitación de Ascensores del Sur (ADS) · Unidad de máquinas de tracción ADSUR.",
      showDni: true,
    },
    memberValidationMode: "open" as const,
    collectionMode: "platform_account" as const,
    platformFeeBps: 0,
    paymentMethods: ["mock" as const, "manual" as const],
    manualPaymentInstructions:
      "Transferí a la cuenta de Ascensores del Sur. Alias: ADS.CAMPUS.DEMO. Enviá el comprobante a campus@ads.demo indicando el número de orden.",
  };

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, ADS_SLUG));
  // La marca se pisa (es del seed); lo demás que la cámara haya tocado, no.
  const tenant = existing
    ? (await db.update(tenants).set({ name: values.name, campusName: values.campusName, logoUrl: values.logoUrl, theme: values.theme, updatedAt: new Date() }).where(eq(tenants.id, existing.id)).returning())[0]
    : (await db.insert(tenants).values(values).returning())[0];

  await db
    .insert(tenantDomains)
    .values({ tenantId: tenant.id, hostname: "ads.localhost:3000", isPrimary: true })
    .onConflictDoUpdate({ target: tenantDomains.hostname, set: { tenantId: tenant.id, isPrimary: true } });

  for (const c of COMPANIES) {
    await db
      .insert(companies)
      .values({
        tenantId: tenant.id,
        cuit: buildValidCuit(`30${String(c.cuitSeed * 10).padStart(8, "0")}`),
        legalName: c.legalName,
        isMember: false,
        emailDomains: [c.emailDomain],
        source: "roster",
      })
      .onConflictDoNothing();
  }

  const [admin] = await db
    .insert(users)
    .values({ email: "admin@ads.demo", firstName: "Admin", lastName: "ADS", name: "Admin ADS" })
    .onConflictDoUpdate({ target: users.email, set: { email: "admin@ads.demo" } })
    .returning();
  await db
    .insert(tenantMemberships)
    .values({ tenantId: tenant.id, userId: admin.id, role: "tenant_admin", onboardedAt: new Date(), acceptedTermsAt: new Date() })
    .onConflictDoNothing();
  return tenant;
}

const CATEGORIES = [
  { slug: "mantenimiento-tecnico", name: "Mantenimiento técnico", icon: "wrench" },
  { slug: "energia-y-sustentabilidad", name: "Energía y sustentabilidad", icon: "zap" },
  { slug: "seguridad-e-higiene", name: "Seguridad e higiene", icon: "hard-hat" },
  { slug: "gestion-y-liderazgo", name: "Gestión y liderazgo", icon: "users" },
  { slug: "tecnologia-e-ia", name: "Tecnología e IA", icon: "cpu" },
  { slug: "comercio-exterior", name: "Comercio exterior", icon: "globe" },
  { slug: "costos-y-finanzas", name: "Costos y finanzas", icon: "calculator" },
];

// Ocho alumnos con progreso variado: dos con examen aprobado (certificado), uno con todo
// listo para rendir (`avanzado@`), el de la demo a ~40% y cuatro más en distintos puntos.
const STUDENTS: { email: string; first: string; last: string; company: number; pct: number; exam?: { correct: number; daysAgo: number } }[] = [
  { email: "alumno@ads.demo", first: "Nicolás", last: "Ferreyra", company: 0, pct: 40 },
  { email: "avanzado@ads.demo", first: "Laura", last: "Montes", company: 0, pct: 100 },
  { email: "marcos.pereyra@altamira.demo", first: "Marcos", last: "Pereyra", company: 0, pct: 100, exam: { correct: 14, daysAgo: 21 } },
  { email: "silvia.arroyo@elevadoresplata.demo", first: "Silvia", last: "Arroyo", company: 1, pct: 100, exam: { correct: 13, daysAgo: 9 } },
  { email: "diego.sosa@elevadoresplata.demo", first: "Diego", last: "Sosa", company: 1, pct: 87 },
  { email: "paula.rinaldi@conservadorasur.demo", first: "Paula", last: "Rinaldi", company: 2, pct: 60 },
  { email: "tomas.acuna@conservadorasur.demo", first: "Tomás", last: "Acuña", company: 2, pct: 20 },
  { email: "romina.duarte@altamira.demo", first: "Romina", last: "Duarte", company: 0, pct: 7 },
];

export async function seedAdsCatalog() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, ADS_SLUG));
  const [course] = await db.select().from(courses).where(eq(courses.slug, ADS_COURSE));
  if (!tenant || !course) throw new Error("Falta el tenant ads o el curso: corré el seed completo.");
  if (course.ownerTenantId !== tenant.id) throw new Error("El curso de ADS no quedó con ads como dueño: corré `pnpm courses:sync`.");

  // Categorías y catálogo: el curso de ADS (gratis, destacado) y los cursos "Próximamente" de la biblioteca.
  const categoryRows = await db
    .insert(categories)
    .values(CATEGORIES.map((c, index) => ({ tenantId: tenant.id, ...c, sortOrder: index })))
    .onConflictDoUpdate({
      target: [categories.tenantId, categories.slug],
      set: { name: sql`excluded.name`, icon: sql`excluded.icon`, sortOrder: sql`excluded.sort_order` },
    })
    .returning();
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  const library = await db.select().from(courses);
  const toAssign = library.filter((c) => c.id === course.id || (c.status === "coming_soon" && !c.ownerTenantId));
  for (const [index, item] of toAssign.entries()) {
    const own = item.id === course.id;
    await db
      .insert(tenantCourses)
      .values({
        tenantId: tenant.id,
        courseId: item.id,
        categoryId: categoryBySlug.get(item.meta.suggestedCategory.slug) ?? null,
        visibility: "public",
        priceMemberCents: 0,
        priceNonMemberCents: 0,
        isFeatured: own,
        sortOrder: own ? 0 : index + 1,
        publishedAt: new Date(),
      })
      // Si el superadmin ya ajustó precios o visibilidad, el seed no los pisa.
      .onConflictDoNothing();
  }
  const [assignment] = await db
    .select()
    .from(tenantCourses)
    .where(and(eq(tenantCourses.tenantId, tenant.id), eq(tenantCourses.courseId, course.id)));

  // Alumnos, inscripciones, progreso y certificados.
  const companyRows = await db.select().from(companies).where(eq(companies.tenantId, tenant.id)).orderBy(asc(companies.legalName));
  const companyByName = new Map(companyRows.map((c) => [c.legalName, c.id]));
  const required = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, course.id), eq(lessons.isRequired, true)))
    .orderBy(asc(lessons.sortOrder));
  const [finalExam] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.courseId, course.id), eq(assessments.key, "examen-final")));
  const { seedExamAttempt } = await import("./seed-courses");

  for (const [index, student] of STUDENTS.entries()) {
    const [user] = await db
      .insert(users)
      .values({ email: student.email, firstName: student.first, lastName: student.last, name: `${student.first} ${student.last}` })
      .onConflictDoUpdate({ target: users.email, set: { email: student.email } })
      .returning();
    await db
      .insert(tenantMemberships)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        role: "student",
        companyId: companyByName.get(COMPANIES[student.company].legalName) ?? null,
        onboardedAt: new Date(),
        acceptedTermsAt: new Date(),
      })
      .onConflictDoNothing();

    const done = Math.min(required.length, Math.round((student.pct / 100) * required.length));
    const progressPct = required.length === 0 ? 0 : Math.round((done / required.length) * 100);
    const enrolledAt = daysAgo(60 - index * 6);
    const lastLesson = done > 0 ? required[done - 1] : null;
    const [enrollment] = await db
      .insert(enrollments)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        courseId: course.id,
        tenantCourseId: assignment.id,
        source: "free",
        progressPct,
        lastLessonId: lastLesson?.id ?? null,
        enrolledAt,
      })
      .onConflictDoNothing()
      .returning({ id: enrollments.id });
    if (!enrollment) continue; // ya estaba sembrado: no se pisa

    if (done > 0) {
      await db
        .insert(lessonProgress)
        .values(
          required.slice(0, done).map((lesson, i) => ({
            enrollmentId: enrollment.id,
            lessonId: lesson.id,
            status: "completed" as const,
            completedAt: new Date(enrolledAt.getTime() + (i + 1) * DAY),
            lastViewedAt: i === done - 1 ? daysAgo(1 + index) : new Date(enrolledAt.getTime() + (i + 1) * DAY),
          })),
        )
        .onConflictDoNothing();
    }
    if (student.exam && finalExam) {
      await seedExamAttempt({
        tenantId: tenant.id,
        enrollmentId: enrollment.id,
        assessment: finalExam,
        correct: student.exam.correct,
        submittedAt: daysAgo(student.exam.daysAgo),
        passes: true,
      });
    }
  }
}
