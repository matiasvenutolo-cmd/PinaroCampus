import { notFound } from "next/navigation";

import { RosterImport } from "@/components/admin/roster-import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

import { addCompany, saveCompany } from "./actions";

export const metadata = { title: "Empresas" };

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  alta: { text: "Empresa agregada al padrón.", error: false },
  editada: { text: "Empresa actualizada.", error: false },
  datos: { text: "Revisá los datos del formulario.", error: true },
  cuit: { text: "El CUIT no es válido.", error: true },
  dominios: { text: "Algún dominio de email no es válido (ejemplo: empresa.com.ar).", error: true },
  existe: { text: "Ya hay una empresa con ese CUIT.", error: true },
};
const SOURCE_LABEL = { roster: "Padrón", self_declared: "Autodeclarada", admin: "Alta manual" } as const;

export default async function AdminCompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const companies = await forTenant(tenant.id).companies.listWithStats(query.q);
  const message = MESSAGES[query.error ?? query.ok ?? ""];
  const members = companies.filter((c) => c.isMember).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          {companies.length} {companies.length === 1 ? "empresa" : "empresas"} · {members} socias · las autodeclaradas son empresas no socias que usan la plataforma.
        </p>
      </div>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <RosterImport />

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Agregar una empresa a mano</summary>
        <form action={addCompany} className="mt-3 grid gap-3 sm:grid-cols-2">
          <CompanyFields />
          <Button type="submit" className="w-fit">Agregar empresa</Button>
        </form>
      </details>

      <form method="get" className="flex gap-2">
        <Input name="q" defaultValue={query.q} placeholder="Buscar por razón social, fantasía o CUIT" aria-label="Buscar empresas" />
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      {companies.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay empresas con ese criterio.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {companies.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.legalName}
                    {c.tradeName ? <span className="font-normal text-muted-foreground"> · {c.tradeName}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CUIT {formatCuit(c.cuit)} · {SOURCE_LABEL[c.source]} · {c.people} {c.people === 1 ? "persona" : "personas"} · {c.enrolled} {c.enrolled === 1 ? "inscripción" : "inscripciones"}
                    {c.emailDomains.length > 0 ? ` · @${c.emailDomains.join(", @")}` : ""}
                  </p>
                </div>
                <Badge variant={c.isMember ? "default" : "secondary"}>{c.isMember ? "Socia" : "No socia"}</Badge>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-primary">Editar</summary>
                <form action={saveCompany} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <CompanyFields company={c} />
                  <Button type="submit" size="sm" className="w-fit">Guardar</Button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompanyFields({
  company,
}: {
  company?: { cuit: string; legalName: string; tradeName: string | null; emailDomains: string[]; isMember: boolean; id: string };
}) {
  const key = company?.id ?? "new";
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`cuit-${key}`} className="text-xs">CUIT</Label>
        {company ? (
          <>
            <input type="hidden" name="cuit" value={company.cuit} />
            <Input id={`cuit-${key}`} value={formatCuit(company.cuit)} disabled readOnly />
          </>
        ) : (
          <Input id={`cuit-${key}`} name="cuit" inputMode="numeric" placeholder="30-12345678-9" required />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`legal-${key}`} className="text-xs">Razón social</Label>
        <Input id={`legal-${key}`} name="legalName" defaultValue={company?.legalName} maxLength={200} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`trade-${key}`} className="text-xs">Nombre de fantasía (opcional)</Label>
        <Input id={`trade-${key}`} name="tradeName" defaultValue={company?.tradeName ?? ""} maxLength={200} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`domains-${key}`} className="text-xs">Dominios de email (opcional, separados por coma)</Label>
        <Input id={`domains-${key}`} name="domains" defaultValue={company?.emailDomains.join(", ")} placeholder="empresa.com.ar" />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="isMember" defaultChecked={company?.isMember} className="size-4" />
        Es socia de la cámara
      </label>
    </>
  );
}
