import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { companies, tenantMemberships, tenants, users } from "@/lib/db/schema";
import { forTenant } from "@/lib/db/tenant-scope";

// Corre contra la base real de desarrollo (igual que drizzle-kit): crea sus
// propios tenants/usuarios descartables y los borra al final, sin tocar el
// seed de la demo. Ver CLAUDE.md regla 1 y docs/02-arquitectura.md.
const runId = Math.random().toString(36).slice(2, 8);
const slugA = `test-iso-a-${runId}`;
const slugB = `test-iso-b-${runId}`;
const sameCuit = "30500010912";

let tenantAId: string;
let tenantBId: string;
let userId: string;

beforeAll(async () => {
  const [tenantA] = await db
    .insert(tenants)
    .values({
      slug: slugA,
      name: "Tenant de prueba A",
      shortName: "A",
      campusName: "Campus A",
      contactEmail: "a@test.demo",
    })
    .returning();
  const [tenantB] = await db
    .insert(tenants)
    .values({
      slug: slugB,
      name: "Tenant de prueba B",
      shortName: "B",
      campusName: "Campus B",
      contactEmail: "b@test.demo",
    })
    .returning();
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  await forTenant(tenantAId).companies.create({
    cuit: sameCuit,
    legalName: "Empresa A",
    isMember: true,
    source: "roster",
  });
  await forTenant(tenantBId).companies.create({
    cuit: sameCuit,
    legalName: "Empresa B",
    isMember: false,
    source: "self_declared",
  });

  const [user] = await db
    .insert(users)
    .values({ email: `iso-${runId}@test.demo` })
    .returning();
  userId = user.id;

  await forTenant(tenantAId).memberships.create({ userId, role: "tenant_admin" });
  await forTenant(tenantBId).memberships.create({ userId, role: "student" });
});

afterAll(async () => {
  await db.delete(tenantMemberships).where(inArray(tenantMemberships.tenantId, [tenantAId, tenantBId]));
  await db.delete(companies).where(inArray(companies.tenantId, [tenantAId, tenantBId]));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(tenants).where(inArray(tenants.id, [tenantAId, tenantBId]));
});

describe("tenant-scope: aislamiento entre cámaras", () => {
  it("el mismo CUIT en dos tenants son empresas distintas, cada una solo visible en su tenant", async () => {
    const companyA = await forTenant(tenantAId).companies.findByCuit(sameCuit);
    const companyB = await forTenant(tenantBId).companies.findByCuit(sameCuit);

    expect(companyA?.legalName).toBe("Empresa A");
    expect(companyB?.legalName).toBe("Empresa B");
    expect(companyA?.id).not.toBe(companyB?.id);
  });

  it("companies.list() de un tenant nunca incluye empresas del otro", async () => {
    const listA = await forTenant(tenantAId).companies.list();
    const listB = await forTenant(tenantBId).companies.list();

    expect(listA.every((c) => c.tenantId === tenantAId)).toBe(true);
    expect(listB.every((c) => c.tenantId === tenantBId)).toBe(true);
    expect(listA.some((c) => c.id === listB[0]?.id)).toBe(false);
  });

  it("un mismo usuario puede tener roles distintos en cada cámara", async () => {
    const membershipA = await forTenant(tenantAId).memberships.findByUserId(userId);
    const membershipB = await forTenant(tenantBId).memberships.findByUserId(userId);

    expect(membershipA?.role).toBe("tenant_admin");
    expect(membershipB?.role).toBe("student");
  });

  it("memberships.findByUserId no devuelve nada si el usuario no es miembro de ESE tenant", async () => {
    const [otherTenant] = await db
      .insert(tenants)
      .values({
        slug: `test-iso-c-${runId}`,
        name: "Tenant de prueba C",
        shortName: "C",
        campusName: "Campus C",
        contactEmail: "c@test.demo",
      })
      .returning();

    const membership = await forTenant(otherTenant.id).memberships.findByUserId(userId);
    expect(membership).toBeNull();

    await db.delete(tenants).where(eq(tenants.id, otherTenant.id));
  });
});
