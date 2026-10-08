import { createHmac, randomBytes } from "node:crypto";

import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";

/** Helper de los tests e2e para leer directo de la base (el link real de un
 * magic link, por ejemplo) sin depender de una bandeja de email de verdad. */
export async function getLatestEmailLink(toEmail: string): Promise<string | null> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ html: string }[]>`
      select html from email_log where to_email = ${toEmail} order by created_at desc limit 1
    `;
    const match = row?.html.match(/href="([^"]+)"/);
    return match?.[1]?.replace(/&amp;/g, "&") ?? null;
  } finally {
    await sql.end();
  }
}

export async function getMembershipOf(
  email: string,
  tenantSlug: string,
): Promise<{ memberStatus: string; companySource: string | null } | null> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ member_status: string; source: string | null }[]>`
      select tm.member_status, c.source
      from tenant_memberships tm
      join users u on u.id = tm.user_id
      join tenants t on t.id = tm.tenant_id
      left join companies c on c.id = tm.company_id
      where u.email = ${email} and t.slug = ${tenantSlug}
    `;
    return row ? { memberStatus: row.member_status, companySource: row.source } : null;
  } finally {
    await sql.end();
  }
}

export async function deleteTestUser(email: string): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    // Compras y vacantes referencian al usuario con `on delete restrict`: primero lo suyo.
    await sql`
      delete from seat_codes
      where created_by_user_id in (select id from users where email = ${email})
         or order_id in (select o.id from orders o join users u on u.id = o.buyer_user_id where u.email = ${email})`;
    await sql`delete from orders where buyer_user_id in (select id from users where email = ${email})`;
    await sql`delete from users where email = ${email}`;
  } finally {
    await sql.end();
  }
}

export async function deleteTestCompany(cuit: string): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`delete from companies where cuit = ${cuit}`;
  } finally {
    await sql.end();
  }
}

// ---- Fase 2: alumnos de prueba con sesión propia ----

/**
 * Crea un alumno descartable en una cámara (opcionalmente socio de una empresa
 * e inscripto a un curso) y le abre una sesión de base de datos: el e2e solo
 * tiene que setear la cookie. Así los tests no tocan a los alumnos de la demo.
 */
export async function createTestStudent(options: {
  email: string;
  tenantSlug: string;
  companyName?: string;
  memberStatus?: "none" | "pending" | "verified";
  enrollCourseSlug?: string;
  /** Sin nombre ni apellido: prueba el pedido de nombre antes de emitir el certificado. */
  withoutName?: boolean;
}): Promise<{ userId: string; sessionToken: string }> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = ${options.tenantSlug}`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, first_name, last_name, name)
      values (${options.email}, ${options.withoutName ? null : "Test"}, ${options.withoutName ? null : "Alumno"}, ${options.withoutName ? null : "Test Alumno"})
      on conflict (email) do update set email = excluded.email
      returning id`;
    const company = options.companyName
      ? (await sql<{ id: string }[]>`select id from companies where tenant_id = ${tenant.id} and legal_name = ${options.companyName}`)[0]
      : undefined;
    await sql`
      insert into tenant_memberships (tenant_id, user_id, role, company_id, member_status, onboarded_at, accepted_terms_at)
      values (${tenant.id}, ${user.id}, 'student', ${company?.id ?? null}, ${options.memberStatus ?? "none"}, now(), now())
      on conflict (tenant_id, user_id) do nothing`;

    if (options.enrollCourseSlug) {
      const [tc] = await sql<{ id: string; course_id: string }[]>`
        select tc.id, tc.course_id from tenant_courses tc join courses c on c.id = tc.course_id
        where tc.tenant_id = ${tenant.id} and c.slug = ${options.enrollCourseSlug}`;
      await sql`
        insert into enrollments (tenant_id, user_id, course_id, tenant_course_id, source)
        values (${tenant.id}, ${user.id}, ${tc.course_id}, ${tc.id}, 'admin')
        on conflict (tenant_id, user_id, course_id) do nothing`;
    }

    const sessionToken = randomBytes(32).toString("hex");
    await sql`
      insert into sessions (session_token, user_id, expires)
      values (${sessionToken}, ${user.id}, now() + interval '1 day')`;
    return { userId: user.id, sessionToken };
  } finally {
    await sql.end();
  }
}

export async function getEnrollment(email: string, tenantSlug: string, courseSlug: string) {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ progress_pct: number; source: string; completed_lessons: number }[]>`
      select e.progress_pct, e.source,
        (select count(*)::int from lesson_progress lp where lp.enrollment_id = e.id and lp.status = 'completed') as completed_lessons
      from enrollments e
      join users u on u.id = e.user_id
      join tenants t on t.id = e.tenant_id
      join courses c on c.id = e.course_id
      where u.email = ${email} and t.slug = ${tenantSlug} and c.slug = ${courseSlug}`;
    return row ? { progressPct: row.progress_pct, source: row.source, completedLessons: row.completed_lessons } : null;
  } finally {
    await sql.end();
  }
}

export async function deleteWaitlistEntry(email: string): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`delete from waitlist_entries where email = ${email}`;
  } finally {
    await sql.end();
  }
}

/** Mismo algoritmo que `signCoursePreviewToken` (src/lib/courses/preview-token.ts). */
export function makeCoursePreviewToken(slug: string, expiresInMs = 60_000): string {
  const expires = Date.now() + expiresInMs;
  const signature = createHmac("sha256", process.env.PREVIEW_SIGNING_SECRET!)
    .update(`course-preview:${slug}:${expires}`)
    .digest("base64url");
  return `${expires}.${signature}`;
}

/** Deja completadas las primeras `count` lecciones obligatorias y recalcula el avance. */
export async function seedProgress(email: string, tenantSlug: string, courseSlug: string, count: number) {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [enrollment] = await sql<{ id: string; course_id: string }[]>`
      select e.id, e.course_id from enrollments e
      join users u on u.id = e.user_id join tenants t on t.id = e.tenant_id join courses c on c.id = e.course_id
      where u.email = ${email} and t.slug = ${tenantSlug} and c.slug = ${courseSlug}`;
    const required = await sql<{ id: string }[]>`
      select id from lessons where course_id = ${enrollment.course_id} and is_required and archived_at is null order by sort_order`;
    const done = required.slice(0, count);
    for (const lesson of done) {
      await sql`
        insert into lesson_progress (enrollment_id, lesson_id, status, completed_at)
        values (${enrollment.id}, ${lesson.id}, 'completed', now())
        on conflict (enrollment_id, lesson_id) do nothing`;
    }
    const pct = Math.round((done.length / required.length) * 100);
    await sql`
      update enrollments set progress_pct = ${pct}, last_lesson_id = ${done.at(-1)?.id ?? null}
      where id = ${enrollment.id}`;
    return { pct, requiredCount: required.length };
  } finally {
    await sql.end();
  }
}

/** Índices tildados de un `<Checklist>` guardados para una lección. */
export async function getChecklistState(
  email: string,
  tenantSlug: string,
  courseSlug: string,
  lessonKey: string,
  checklistId: string,
): Promise<number[]> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ checked: number[] | null }[]>`
      select lp.meta -> 'checklists' -> ${checklistId} as checked
      from lesson_progress lp
      join enrollments e on e.id = lp.enrollment_id
      join users u on u.id = e.user_id
      join tenants t on t.id = e.tenant_id
      join courses c on c.id = e.course_id
      join lessons l on l.id = lp.lesson_id
      where u.email = ${email} and t.slug = ${tenantSlug} and c.slug = ${courseSlug} and l.key = ${lessonKey}`;
    return row?.checked ?? [];
  } finally {
    await sql.end();
  }
}

/** Cantidad de certificados (vigentes o no) de un alumno en una cámara. */
export async function countCertificates(email: string, tenantSlug: string): Promise<number> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ total: number }[]>`
      select count(*)::int as total from certificates c
      join users u on u.id = c.user_id join tenants t on t.id = c.tenant_id
      where u.email = ${email} and t.slug = ${tenantSlug}`;
    return row?.total ?? 0;
  } finally {
    await sql.end();
  }
}

export async function getActiveCertificateCode(email: string, tenantSlug: string): Promise<string | null> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ code: string }[]>`
      select c.code from certificates c
      join users u on u.id = c.user_id join tenants t on t.id = c.tenant_id
      where u.email = ${email} and t.slug = ${tenantSlug} and c.revoked_at is null`;
    return row?.code ?? null;
  } finally {
    await sql.end();
  }
}

/** Cantidad de intentos de examen de un alumno en un curso. */
export async function countAttempts(email: string, tenantSlug: string, courseSlug: string): Promise<number> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ total: number }[]>`
      select count(*)::int as total from assessment_attempts a
      join enrollments e on e.id = a.enrollment_id
      join users u on u.id = e.user_id join tenants t on t.id = e.tenant_id join courses c on c.id = e.course_id
      where u.email = ${email} and t.slug = ${tenantSlug} and c.slug = ${courseSlug}`;
    return row?.total ?? 0;
  } finally {
    await sql.end();
  }
}

/** Hace "viejos" los intentos enviados de un alumno, para saltear la espera entre intentos. */
export async function ageAttempts(email: string, minutes: number): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`
      update assessment_attempts set submitted_at = submitted_at - make_interval(mins => ${minutes})
      where submitted_at is not null and enrollment_id in (
        select e.id from enrollments e join users u on u.id = e.user_id where u.email = ${email})`;
  } finally {
    await sql.end();
  }
}

/** Sesión de base de datos para un usuario que ya existe (p. ej. `admin@civa.demo`). */
export async function createSessionFor(email: string): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [user] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
    const sessionToken = randomBytes(32).toString("hex");
    await sql`insert into sessions (session_token, user_id, expires) values (${sessionToken}, ${user.id}, now() + interval '1 day')`;
    return sessionToken;
  } finally {
    await sql.end();
  }
}

export async function countAudit(action: string, entityCode: string): Promise<number> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ total: number }[]>`
      select count(*)::int as total from audit_log
      where action = ${action} and (data->>'code' = ${entityCode} or data->>'oldCode' = ${entityCode})`;
    return row?.total ?? 0;
  } finally {
    await sql.end();
  }
}

/** Estado de una orden por número (para los e2e de compras). */
export async function getOrderByEmail(email: string, tenantSlug: string) {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const rows = await sql<{ id: string; number: string; status: string; total_cents: string; type: string; fulfilled: boolean; codes: number }[]>`
      select o.id, o.number, o.status, o.total_cents::text, o.type, (o.fulfilled_at is not null) as fulfilled,
        (select count(*)::int from seat_codes sc where sc.order_id = o.id) as codes
      from orders o join users u on u.id = o.buyer_user_id join tenants t on t.id = o.tenant_id
      where u.email = ${email} and t.slug = ${tenantSlug} order by o.created_at desc`;
    return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, totalCents: Number(r.total_cents), type: r.type, fulfilled: r.fulfilled, codes: r.codes }));
  } finally {
    await sql.end();
  }
}

export async function countEmailsTo(email: string): Promise<number> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [row] = await sql<{ total: number }[]>`select count(*)::int as total from email_log where to_email = ${email}`;
    return row?.total ?? 0;
  } finally {
    await sql.end();
  }
}

/** Código de vacante disponible de una orden (para canjearlo en un e2e). */
export async function getSeatCodes(orderId: string) {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    return await sql<{ code: string; status: string; sent_to_email: string | null }[]>`
      select code, status, sent_to_email from seat_codes where order_id = ${orderId} order by code`;
  } finally {
    await sql.end();
  }
}

/** Deja el pedido de socio de un alumno de prueba como `pending` (para probar la aprobación). */
export async function setMemberStatus(email: string, tenantSlug: string, status: "none" | "pending" | "verified" | "rejected") {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`
      update tenant_memberships set member_status = ${status}
      where user_id in (select id from users where email = ${email}) and tenant_id in (select id from tenants where slug = ${tenantSlug})`;
  } finally {
    await sql.end();
  }
}

export async function deleteCompanyByName(tenantSlug: string, legalName: string): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`delete from companies where legal_name = ${legalName} and tenant_id in (select id from tenants where slug = ${tenantSlug})`;
  } finally {
    await sql.end();
  }
}

/**
 * El alumno de la demo (`alumno@civa.demo`) es compartido: cada test que abre
 * lecciones con esa cuenta mueve su "dónde seguir". Lo devuelve a la última
 * lección que tiene completada, que es como lo deja el seed.
 */
export async function resetDemoStudentPosition(email = "alumno@civa.demo", tenantSlug = "civa"): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    await sql`
      update enrollments set last_lesson_id = (
        select l.id from lesson_progress lp join lessons l on l.id = lp.lesson_id
        where lp.enrollment_id = enrollments.id and lp.status = 'completed'
        order by l.sort_order desc limit 1)
      where user_id in (select id from users where email = ${email})
        and tenant_id in (select id from tenants where slug = ${tenantSlug})`;
  } finally {
    await sql.end();
  }
}
