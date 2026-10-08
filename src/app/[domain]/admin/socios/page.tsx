import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

import { approveMember, rejectMember } from "./actions";

export const metadata = { title: "Socios pendientes" };

const MODE_HELP: Record<string, string> = {
  cuit_email_domain: "El CUIT coincide con una empresa socia pero el dominio del email no figura entre los de la empresa.",
  manual: "Esta cámara aprueba a mano cada pedido de socio.",
};

export default async function PendingMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const pending = await forTenant(tenant.id).memberships.listPending();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Socios pendientes</h1>
        {MODE_HELP[tenant.memberValidationMode] ? <p className="text-sm text-muted-foreground">{MODE_HELP[tenant.memberValidationMode]}</p> : null}
      </div>

      {query.ok ? (
        <p role="status" className="text-sm text-success">
          {query.ok === "aprobado" ? "Socio aprobado: ya paga el precio de socio y le avisamos por email." : "Pedido rechazado. Le avisamos por email."}
        </p>
      ) : null}
      {query.error ? <p role="alert" className="text-sm text-danger">Ese pedido ya no está pendiente.</p> : null}

      {pending.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay pedidos de socio pendientes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((p) => (
            <li key={p.membershipId} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.name ?? p.email} <span className="font-normal text-muted-foreground">({p.email})</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {p.companyName ?? "Sin empresa"}
                    {p.companyCuit ? ` · CUIT ${formatCuit(p.companyCuit)}` : ""}
                    {p.companyName ? (p.companyIsMember ? " · empresa socia" : " · empresa no socia") : ""}
                    {p.jobTitle ? ` · ${p.jobTitle}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Pedido el {formatDate(p.requestedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <form action={approveMember}>
                    <input type="hidden" name="membershipId" value={p.membershipId} />
                    <Button type="submit" size="sm">Aprobar</Button>
                  </form>
                  <form action={rejectMember}>
                    <input type="hidden" name="membershipId" value={p.membershipId} />
                    <Button type="submit" size="sm" variant="outline" className="text-danger">Rechazar</Button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
