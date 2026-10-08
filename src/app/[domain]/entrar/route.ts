import { auth } from "@/lib/auth/config";
import { consumeReturnTo, peekReturnTo } from "@/lib/auth/return-to";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";
import { redirectToPath } from "@/lib/tenant/redirect";

/**
 * Adonde cae el link de ingreso. Si venía de una compra o de un canje, sigue
 * ahí (pasando antes por el onboarding si es su primera vez); si no, a Mi campus.
 */
export async function GET() {
  const tenant = await getCurrentTenant();
  const session = await auth();
  const go = redirectToPath;
  if (!session?.user?.id) return go("/ingresar");

  const membership = await forTenant(tenant.id).memberships.findByUserId(session.user.id);
  if (!membership?.onboardedAt) return go("/bienvenida");

  const back = await peekReturnTo();
  if (back) {
    await consumeReturnTo();
    return go(back);
  }
  return go("/mi-campus");
}
