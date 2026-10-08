"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { createAdminSeatCodes } from "@/lib/payments/service";
import { getCurrentTenant } from "@/lib/tenant/context";

const BACK = "/admin/vacantes";

const createSchema = z.object({
  courseSlug: z.string().min(1).max(200),
  companyId: z.string().optional(),
  quantity: z.coerce.number().int(),
});

/** Crea vacantes sin orden (una empresa que pagó por fuera). Queda en `audit_log`. */
export async function createSeatCodes(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = createSchema.safeParse({
    courseSlug: formData.get("courseSlug"),
    companyId: formData.get("companyId") || undefined,
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) redirect(`${BACK}?error=datos`);

  const result = await createAdminSeatCodes(tenant, user.id, {
    courseSlug: parsed.data.courseSlug,
    companyId: parsed.data.companyId ?? null,
    quantity: parsed.data.quantity,
  });
  redirect(result.ok ? `${BACK}?ok=creadas&cantidad=${result.count}` : `${BACK}?error=${result.error === "invalid_quantity" ? "cantidad" : "datos"}`);
}

export async function revokeSeatCode(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) redirect(`${BACK}?error=datos`);

  const scoped = forTenant(tenant.id);
  const revoked = await scoped.seatCodes.revoke(parsed.data.id);
  if (revoked) {
    await scoped.auditLog.record({
      actorUserId: user.id,
      action: "seat_code.revoke",
      entityType: "seat_code",
      entityId: revoked.id,
      data: { code: revoked.code },
    });
  }
  redirect(revoked ? `${BACK}?ok=anulada` : `${BACK}?error=estado`);
}
