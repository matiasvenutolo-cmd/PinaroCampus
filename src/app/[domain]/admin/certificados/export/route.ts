import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/permissions";
import { toCsv } from "@/lib/csv";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant/context";

import { parseCertificateFilters } from "../filters";

/** CSV de los certificados de la cámara, con los mismos filtros del listado. */
export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  const url = new URL(request.url);
  const filters = parseCertificateFilters(Object.fromEntries(url.searchParams));
  const rows = await forTenant(tenant.id).certificates.listForAdmin(filters);

  const csv = toCsv([
    ["Código", "Nombre", "DNI", "Email", "Empresa", "Curso", "Horas", "Nota", "Fecha de emisión", "Estado", "Fecha de revocación"],
    ...rows.map((c) => [
      c.code,
      c.holderName,
      c.holderDni,
      c.email,
      c.companyName,
      c.courseTitle,
      Number(c.hours),
      c.score,
      formatDate(c.issuedAt),
      c.revokedAt ? "Revocado" : "Vigente",
      c.revokedAt ? formatDate(c.revokedAt) : "",
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="certificados-${tenant.slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
