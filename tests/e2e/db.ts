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
