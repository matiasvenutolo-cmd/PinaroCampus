import type { Tenant } from "@/lib/tenant/resolve";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Armazón común de los emails transaccionales (HTML plano, ver
 * docs/DECISIONES.md): logo o nombre de la cámara, un título, un párrafo, un
 * botón y el pie "Plataforma provista por Pinaro". `paragraphs` va como texto
 * plano y se escapa acá.
 */
export function renderEmail({
  tenant,
  heading,
  paragraphs,
  cta,
  footnote,
}: {
  tenant: Pick<Tenant, "campusName" | "logoUrl" | "theme">;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
}) {
  const campusName = escapeHtml(tenant.campusName);
  const primary = tenant.theme.primary;
  const primaryForeground =
    tenant.theme.primaryForeground && tenant.theme.primaryForeground !== "auto"
      ? tenant.theme.primaryForeground
      : "#FFFFFF";

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:32px 16px;background:#FAFAFA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:24px;text-align:center;">
          ${tenant.logoUrl ? `<img src="${escapeHtml(tenant.logoUrl)}" alt="${campusName}" height="40" style="height:40px;" />` : `<strong style="font-size:18px;color:#171717;">${campusName}</strong>`}
        </td>
      </tr>
      <tr>
        <td style="background:#FFFFFF;border:1px solid #E8E8E8;border-radius:12px;padding:32px;text-align:center;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#171717;">${escapeHtml(heading)}</h1>
          ${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.5;">${escapeHtml(p)}</p>`).join("\n          ")}
          ${
            cta
              ? `<a href="${escapeHtml(cta.url)}" style="display:inline-block;margin-top:8px;background:${primary};color:${primaryForeground};text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">${escapeHtml(cta.label)}</a>`
              : ""
          }
          ${footnote ? `<p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">${escapeHtml(footnote)}</p>` : ""}
        </td>
      </tr>
      <tr>
        <td style="padding-top:16px;text-align:center;font-size:11px;color:#9CA3AF;">
          Plataforma provista por Pinaro
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [heading, ...paragraphs, cta ? `${cta.label}: ${cta.url}` : "", footnote ?? ""]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}
