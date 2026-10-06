import "server-only";

import { notFound, redirect } from "next/navigation";

import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentHost } from "@/lib/tenant/context";
import { env } from "@/env";

import { auth } from "./config";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/ingresar");
  return session.user;
}

/** Para páginas de alumno: si todavía no hay membership o falta onboardear,
 * manda a `/bienvenida` (docs/01-producto.md, flujo de onboarding). */
export async function requireMembership(tenantId: string) {
  const user = await requireUser();
  const membership = await forTenant(tenantId).memberships.findByUserId(user.id);
  if (!membership || !membership.onboardedAt) redirect("/bienvenida");
  return { user, membership };
}

/**
 * Para páginas de admin: ausencia de membership o rol equivocado es un 404,
 * nunca un redirect a onboarding — así un admin de otra cámara (o un alumno)
 * no puede ni enterarse de que el panel existe. Cubre el criterio de
 * aceptación de la Fase 1 sobre aislamiento entre cámaras.
 */
export async function requireRole(tenantId: string, role: "tenant_admin") {
  const user = await requireUser();
  const membership = await forTenant(tenantId).memberships.findByUserId(user.id);
  if (!membership || membership.role !== role) notFound();
  return { user, membership };
}

export async function requireSuperadmin() {
  const session = await auth();
  const host = await getCurrentHost();
  if (!session?.user?.isSuperadmin || !host || !env.SUPERADMIN_HOSTS.includes(host)) {
    notFound();
  }
  return session.user;
}
