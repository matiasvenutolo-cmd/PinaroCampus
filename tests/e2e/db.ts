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
}): Promise<{ userId: string; sessionToken: string }> {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = ${options.tenantSlug}`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (email, first_name, last_name, name)
      values (${options.email}, 'Test', 'Alumno', 'Test Alumno')
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
