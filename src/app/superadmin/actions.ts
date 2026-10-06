"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { tenantDomains, tenantMemberships, tenants, users } from "@/lib/db/schema";
import { requireSuperadmin } from "@/lib/auth/permissions";
import { recordGlobalAudit } from "@/lib/db/tenant-scope";
import { defaultTenantCertificateConfig, defaultTenantHomeContent } from "@/lib/tenant/types";

const createTenantSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  campusName: z.string().trim().min(1),
  contactEmail: z.email(),
  hostname: z.string().trim().toLowerCase().min(1),
  memberValidationMode: z.enum(["open", "cuit", "cuit_email_domain", "manual"]),
  primaryColor: z.string().trim().min(1),
  accentColor: z.string().trim().min(1),
});

export async function createTenant(formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = createTenantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/superadmin/camaras/nueva?error=datos-invalidos");
  }
  const data = parsed.data;

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: data.slug,
      name: data.name,
      shortName: data.shortName,
      campusName: data.campusName,
      contactEmail: data.contactEmail,
      memberValidationMode: data.memberValidationMode,
      theme: {
        primary: data.primaryColor,
        primaryForeground: "auto",
        accent: data.accentColor,
        accentForeground: "auto",
        radius: 12,
      },
      homeContent: defaultTenantHomeContent,
      certificateConfig: defaultTenantCertificateConfig,
    })
    .returning();

  await db.insert(tenantDomains).values({ tenantId: tenant.id, hostname: data.hostname, isPrimary: true });

  await recordGlobalAudit({
    actorUserId: admin.id,
    action: "tenant.create",
    entityType: "tenant",
    entityId: tenant.id,
    data: { slug: tenant.slug, hostname: data.hostname },
  });

  redirect(`/superadmin/camaras/${tenant.id}`);
}

const updateBrandSchema = z.object({
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  campusName: z.string().trim().min(1),
  contactEmail: z.email(),
  websiteUrl: z.string().trim().optional(),
  memberValidationMode: z.enum(["open", "cuit", "cuit_email_domain", "manual"]),
  primaryColor: z.string().trim().min(1),
  accentColor: z.string().trim().min(1),
});

export async function updateTenantBrand(tenantId: string, formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = updateBrandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/superadmin/camaras/${tenantId}?error=datos-invalidos`);
  }
  const data = parsed.data;

  const [current] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!current) redirect("/superadmin");

  await db
    .update(tenants)
    .set({
      name: data.name,
      shortName: data.shortName,
      campusName: data.campusName,
      contactEmail: data.contactEmail,
      websiteUrl: data.websiteUrl || null,
      memberValidationMode: data.memberValidationMode,
      theme: {
        ...current.theme,
        primary: data.primaryColor,
        accent: data.accentColor,
      },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  await recordGlobalAudit({
    actorUserId: admin.id,
    action: "tenant.update_brand",
    entityType: "tenant",
    entityId: tenantId,
    data: { before: current.theme, after: { primary: data.primaryColor, accent: data.accentColor } },
  });

  redirect(`/superadmin/camaras/${tenantId}?success=1`);
}

const addDomainSchema = z.object({
  hostname: z.string().trim().toLowerCase().min(1),
});

export async function addTenantDomain(tenantId: string, formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = addDomainSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/superadmin/camaras/${tenantId}?error=dominio-invalido`);

  await db.insert(tenantDomains).values({ tenantId, hostname: parsed.data.hostname });
  await recordGlobalAudit({
    actorUserId: admin.id,
    action: "tenant.add_domain",
    entityType: "tenant",
    entityId: tenantId,
    data: { hostname: parsed.data.hostname },
  });

  redirect(`/superadmin/camaras/${tenantId}?success=1`);
}

const addAdminSchema = z.object({ email: z.email() });

export async function addTenantAdmin(tenantId: string, formData: FormData) {
  const admin = await requireSuperadmin();
  const parsed = addAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/superadmin/camaras/${tenantId}?error=email-invalido`);

  const email = parsed.data.email.toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await db.insert(users).values({ email }).returning();
  }

  await db
    .insert(tenantMemberships)
    .values({
      tenantId,
      userId: user.id,
      role: "tenant_admin",
      onboardedAt: new Date(),
      acceptedTermsAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [tenantMemberships.tenantId, tenantMemberships.userId],
      set: { role: "tenant_admin" },
    });

  await recordGlobalAudit({
    actorUserId: admin.id,
    action: "tenant.add_admin",
    entityType: "tenant",
    entityId: tenantId,
    data: { email },
  });

  redirect(`/superadmin/camaras/${tenantId}?success=1`);
}
