"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { decideMember } from "@/lib/payments/service";
import { getCurrentTenant } from "@/lib/tenant/context";

const BACK = "/admin/socios";

async function decide(formData: FormData, approve: boolean) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = z.object({ membershipId: z.uuid() }).safeParse({ membershipId: formData.get("membershipId") });
  if (!parsed.success) redirect(`${BACK}?error=datos`);

  const result = await decideMember(tenant, user.id, parsed.data.membershipId, approve);
  redirect(result.ok ? `${BACK}?ok=${approve ? "aprobado" : "rechazado"}` : `${BACK}?error=estado`);
}

export async function approveMember(formData: FormData) {
  await decide(formData, true);
}

export async function rejectMember(formData: FormData) {
  await decide(formData, false);
}
