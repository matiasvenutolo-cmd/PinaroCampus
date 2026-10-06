import type { Tenant } from "@/lib/tenant/resolve";

/**
 * HTML plano (sin librería de componentes) para el email de ingreso.
 * Ver docs/DECISIONES.md: se descartó `@react-email/components` por un
 * problema de cadena de suministro detectado en npm.
 */
export function magicLinkEmail({ tenant, url }: { tenant: Tenant | null; url: string }) {
  const campusName = tenant?.campusName ?? "Pinaro Campus";
  const primary = tenant?.theme.primary ?? "#171717";
  const primaryForeground =
    tenant?.theme.primaryForeground && tenant.theme.primaryForeground !== "auto"
      ? tenant.theme.primaryForeground
      : "#FFFFFF";
  const logo = tenant?.logoUrl;

  const subject = `Ingresá a ${campusName}`;

  const html = `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:32px 16px;background:#FAFAFA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
      <tr>
        <td style="padding-bottom:24px;text-align:center;">
          ${logo ? `<img src="${logo}" alt="${campusName}" height="40" style="height:40px;" />` : `<strong style="font-size:18px;color:#171717;">${campusName}</strong>`}
        </td>
      </tr>
      <tr>
        <td style="background:#FFFFFF;border:1px solid #E8E8E8;border-radius:12px;padding:32px;text-align:center;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#171717;">Entrá a ${campusName}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.5;">
            Hacé clic en el botón para ingresar. El link vence en 24 horas y es válido una sola vez.
          </p>
          <a href="${url}"
            style="display:inline-block;background:${primary};color:${primaryForeground};text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">
            Ingresar
          </a>
          <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">
            Si no pediste este email, lo podés ignorar.
          </p>
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

  const text = `Entrá a ${campusName}\n\n${url}\n\nSi no pediste este email, lo podés ignorar.`;

  return { subject, html, text };
}
