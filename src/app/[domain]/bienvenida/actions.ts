"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/permissions";
import { consumeReturnTo } from "@/lib/auth/return-to";
import { updateUserProfile } from "@/lib/auth/user-profile";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";
import { resolveMembershipForCuit } from "@/lib/tenant/membership";

const schema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  dni: z.string().trim().optional(),
  cuit: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  acceptedTerms: z.literal("on"),
});

export async function completeOnboarding(formData: FormData) {
  const user = await requireUser();
  const tenant = await getCurrentTenant();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/bienvenida?error=datos-invalidos");
  }

  const cuitDigits = parsed.data.cuit ? normalizeCuit(parsed.data.cuit) : null;
  if (cuitDigits && !isValidCuit(cuitDigits)) {
    redirect("/bienvenida?error=cuit-invalido");
  }

  const { companyId, memberStatus } = await resolveMembershipForCuit({
    tenant,
    cuit: cuitDigits,
    userEmail: user.email ?? "",
  });

  await updateUserProfile(user.id, {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    dni: parsed.data.dni || null,
  });

  const scoped = forTenant(tenant.id);
  const membership = await scoped.memberships.findByUserId(user.id);
  if (!membership) {
    // No debería pasar: la membership se crea en el primer login (callbacks.signIn).
    redirect("/ingresar");
  }

  await scoped.memberships.update(membership.id, {
    companyId,
    memberStatus,
    jobTitle: parsed.data.jobTitle || null,
    onboardedAt: new Date(),
    acceptedTermsAt: new Date(),
  });

  // Si venía de una compra o de un canje, vuelve ahí.
  redirect((await consumeReturnTo()) ?? "/mi-campus");
}
