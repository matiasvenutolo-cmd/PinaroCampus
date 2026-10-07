"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getUserProfile } from "@/lib/auth/user-profile";
import { requireRole } from "@/lib/auth/permissions";
import { reissueCertificate, sendCertificateEmail } from "@/lib/certificates/issue";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

const BACK = "/admin/certificados";

const reasonSchema = z.object({
  certificateId: z.uuid(),
  reason: z.string().trim().min(3, "motivo").max(500),
});

/** Revoca un certificado con motivo obligatorio; queda en `audit_log` (docs/06). */
export async function revokeCertificate(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user: admin } = await requireRole(tenant.id, "tenant_admin");

  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${BACK}?error=motivo`);

  const scoped = forTenant(tenant.id);
  const revoked = await scoped.certificates.revoke(parsed.data.certificateId, parsed.data.reason);
  if (!revoked) redirect(`${BACK}?error=no-revocable`);

  await scoped.auditLog.record({
    actorUserId: admin.id,
    action: "certificate.revoke",
    entityType: "certificate",
    entityId: revoked.id,
    data: { code: revoked.code, reason: parsed.data.reason },
  });
  redirect(`${BACK}?ok=revocado`);
}

/** Revoca el anterior (con motivo) y emite uno nuevo con otro código. */
export async function reissueCertificateAction(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user: admin } = await requireRole(tenant.id, "tenant_admin");

  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${BACK}?error=motivo`);

  const scoped = forTenant(tenant.id);
  const original = await scoped.certificates.findById(parsed.data.certificateId);
  if (!original) redirect(`${BACK}?error=no-revocable`);

  const result = await reissueCertificate(tenant.id, original.id, parsed.data.reason);
  if (result.status === "needs_name") redirect(`${BACK}?error=sin-nombre`);
  if (result.status !== "issued") redirect(`${BACK}?error=no-reemitido`);

  await scoped.auditLog.record({
    actorUserId: admin.id,
    action: "certificate.reissue",
    entityType: "certificate",
    entityId: result.certificate.id,
    data: { oldCode: original.code, newCode: result.certificate.code, reason: parsed.data.reason },
  });
  redirect(`${BACK}?ok=reemitido`);
}

/** Reenvía el email "¡Aprobaste!" a la persona titular. */
export async function resendCertificateEmail(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user: admin } = await requireRole(tenant.id, "tenant_admin");

  const parsed = z.object({ certificateId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${BACK}?error=no-revocable`);

  const scoped = forTenant(tenant.id);
  const certificate = await scoped.certificates.findById(parsed.data.certificateId);
  if (!certificate || certificate.revokedAt) redirect(`${BACK}?error=no-revocable`);
  const holder = await getUserProfile(certificate.userId);
  if (!holder) redirect(`${BACK}?error=no-revocable`);

  await sendCertificateEmail(tenant.id, certificate, holder.email);
  await scoped.auditLog.record({
    actorUserId: admin.id,
    action: "certificate.resend",
    entityType: "certificate",
    entityId: certificate.id,
    data: { code: certificate.code },
  });
  redirect(`${BACK}?ok=reenviado`);
}
