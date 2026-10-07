"use server";

import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";
import { updateTenantCertificateConfig } from "@/lib/tenant/settings";
import type { TenantCertificateConfig } from "@/lib/tenant/types";
import { env } from "@/env";

const BACK = "/admin/certificados/configuracion";
const MAX_SIGNATURE_BYTES = 500 * 1024;
const SIGNATORY_SLOTS = 3;

// Una imagen propia (https) o una de la plataforma (/demo/…); nada de `javascript:` ni `data:`.
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https:\/\//.test(value) || /^\/[\w./-]+$/.test(value), "url");

const textSchema = z.object({
  footerText: z.string().trim().max(300),
  showDni: z.boolean(),
});

/** Guarda las firmas (hasta 3), el texto de pie y si se muestra el DNI. Afecta solo a los certificados que se emitan después. */
export async function saveCertificateSettings(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user: admin } = await requireRole(tenant.id, "tenant_admin");

  const text = textSchema.safeParse({
    footerText: String(formData.get("footerText") ?? ""),
    showDni: formData.get("showDni") === "on",
  });
  if (!text.success) redirect(`${BACK}?error=datos`);

  const signatories: TenantCertificateConfig["signatories"] = [];
  for (let slot = 0; slot < SIGNATORY_SLOTS; slot++) {
    const name = String(formData.get(`name-${slot}`) ?? "").trim();
    const role = String(formData.get(`role-${slot}`) ?? "").trim();
    if (!name && !role) continue;
    if (!name || !role || name.length > 80 || role.length > 80) redirect(`${BACK}?error=firmante`);

    let signatureUrl: string | null = null;
    if (formData.get(`remove-${slot}`) !== "on") {
      const typed = imageUrl.safeParse(String(formData.get(`url-${slot}`) ?? ""));
      if (!typed.success) redirect(`${BACK}?error=url`);
      signatureUrl = typed.data || null;

      const file = formData.get(`file-${slot}`);
      if (file instanceof File && file.size > 0) {
        if (!env.BLOB_READ_WRITE_TOKEN) redirect(`${BACK}?error=sin-blob`);
        if (!["image/png", "image/jpeg"].includes(file.type) || file.size > MAX_SIGNATURE_BYTES) redirect(`${BACK}?error=archivo`);
        const extension = file.type === "image/png" ? "png" : "jpg";
        const blob = await put(`signatures/${tenant.slug}/${randomUUID()}.${extension}`, file, {
          access: "public",
          token: env.BLOB_READ_WRITE_TOKEN,
        });
        signatureUrl = blob.url;
      }
    }
    signatories.push({ name, role, signatureUrl });
  }

  const config: TenantCertificateConfig = {
    signatories,
    footerText: text.data.footerText || undefined,
    showDni: text.data.showDni,
  };
  await updateTenantCertificateConfig(tenant.id, config);
  await forTenant(tenant.id).auditLog.record({
    actorUserId: admin.id,
    action: "tenant.update_certificate_config",
    entityType: "tenant",
    entityId: tenant.id,
    data: { before: tenant.certificateConfig, after: config },
  });
  redirect(`${BACK}?ok=guardado`);
}
