import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

import { createSeatCodes, revokeSeatCode } from "./actions";

export const metadata = { title: "Vacantes" };

const STATUS_LABEL = { available: "Disponible", sent: "Enviado", redeemed: "Canjeado", revoked: "Anulado" } as const;
const MESSAGES: Record<string, { text: string; error: boolean }> = {
  creadas: { text: "Códigos creados.", error: false },
  anulada: { text: "Código anulado.", error: false },
  cantidad: { text: "La cantidad no es válida (de 1 hasta el máximo de la cámara).", error: true },
  estado: { text: "Ese código ya no se puede anular.", error: true },
  datos: { text: "Revisá los datos del formulario.", error: true },
};
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function AdminSeatCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ ok?: string; error?: string; cantidad?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const [codes, assigned, companies] = await Promise.all([
    scoped.seatCodes.listForAdmin(),
    scoped.catalog.listAssigned(),
    scoped.companies.list(),
  ]);
  const published = assigned.filter((c) => c.status === "published");
  const message = MESSAGES[query.error ?? query.ok ?? ""];
  const counts = {
    total: codes.length,
    redeemed: codes.filter((c) => c.status === "redeemed").length,
    open: codes.filter((c) => c.status === "available" || c.status === "sent").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Vacantes</h1>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
          {query.ok === "creadas" && query.cantidad ? ` (${query.cantidad})` : ""}
        </p>
      ) : null}

      <form action={createSeatCodes} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="courseSlug" className="text-xs">Curso</Label>
          <select id="courseSlug" name="courseSlug" required className={selectClass}>
            {published.map((c) => (
              <option key={c.courseId} value={c.slug}>{c.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyId" className="text-xs">Empresa (opcional)</Label>
          <select id="companyId" name="companyId" className={selectClass} defaultValue="">
            <option value="">Sin empresa</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.legalName}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity" className="text-xs">Cantidad (máx. {tenant.seatPackMax})</Label>
          <Input id="quantity" name="quantity" type="number" min={1} max={tenant.seatPackMax} defaultValue={5} required />
        </div>
        <div className="flex items-end">
          <Button type="submit">Crear códigos sin orden</Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        {counts.total} códigos · {counts.redeemed} canjeados · {counts.open} sin canjear
      </p>

      {codes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todavía no hay códigos de vacante.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Curso</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Origen</th>
                <th className="px-4 py-2 font-medium">Persona</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono tracking-wide">{c.code}</td>
                  <td className="px-4 py-2"><Badge variant={c.status === "redeemed" ? "default" : c.status === "revoked" ? "destructive" : "secondary"}>{STATUS_LABEL[c.status]}</Badge></td>
                  <td className="px-4 py-2">{c.courseTitle}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.companyName ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.orderNumber ?? "Creado por la cámara"}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.status === "redeemed"
                      ? `${c.redeemerEmail} · ${c.redeemedAt ? formatDate(c.redeemedAt) : ""} · ${c.progressPct ?? 0}%`
                      : c.sentToEmail
                        ? `Enviado a ${c.sentToEmail}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.status === "available" || c.status === "sent" ? (
                      <form action={revokeSeatCode}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-danger">Anular</Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
