"use server";

import { redirect } from "next/navigation";

import { createDemoSession } from "@/lib/auth/demo";
import { getCurrentTenant } from "@/lib/tenant/context";

export async function demoLoginAction(formData: FormData) {
  const tenant = await getCurrentTenant();
  const requested = formData.get("role");
  const role = requested === "admin" ? "admin" : requested === "advanced" ? "advanced" : "student";
  const prefix = role === "admin" ? "admin" : role === "advanced" ? "avanzado" : "alumno";

  await createDemoSession(tenant, `${prefix}@${tenant.slug}.demo`);

  // "Alumno con curso avanzado" (docs/09): cae directo en el examen final.
  redirect(role === "admin" ? "/admin" : role === "advanced" ? "/aprender/eficiencia-energetica-pymes-industriales/cierre-examen-final" : "/mi-campus");
}
