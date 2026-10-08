"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { cancelOrder, markManualPaymentAsPaid } from "@/lib/payments/service";
import { getCurrentTenant } from "@/lib/tenant/context";

const BACK = "/admin/ordenes";
const markSchema = z.object({ orderId: z.uuid(), reference: z.string().trim().max(100).optional() });

/** Marca una transferencia como pagada: inscribe o genera los códigos, avisa por email y queda en `audit_log`. */
export async function markOrderPaid(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = markSchema.safeParse({ orderId: formData.get("orderId"), reference: formData.get("reference") || undefined });
  if (!parsed.success) redirect(`${BACK}?error=datos`);

  const result = await markManualPaymentAsPaid(tenant, user.id, parsed.data.orderId, parsed.data.reference);
  redirect(result.ok ? `${BACK}?ok=pagada` : `${BACK}?error=${result.error === "invalid_state" ? "estado" : "datos"}`);
}

export async function cancelOrderAsAdmin(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = z.object({ orderId: z.uuid() }).safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) redirect(`${BACK}?error=datos`);

  const result = await cancelOrder(tenant, user.id, parsed.data.orderId);
  redirect(result.ok ? `${BACK}?ok=cancelada` : `${BACK}?error=estado`);
}
