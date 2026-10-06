"use server";

import { redirect } from "next/navigation";

import { createDemoSession } from "@/lib/auth/demo";
import { getCurrentTenant } from "@/lib/tenant/context";

export async function demoLoginAction(formData: FormData) {
  const tenant = await getCurrentTenant();
  const role = formData.get("role") === "admin" ? "admin" : "student";
  const email = role === "admin" ? `admin@${tenant.slug}.demo` : `alumno@${tenant.slug}.demo`;

  await createDemoSession(tenant, email);

  redirect(role === "admin" ? "/admin" : "/mi-campus");
}
