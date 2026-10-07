import { Download, Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLongDate } from "@/lib/certificates/format";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

import { reissueCertificateAction, resendCertificateEmail, revokeCertificate } from "./actions";
import { parseCertificateFilters, type CertificateSearchParams } from "./filters";

export const metadata = { title: "Certificados" };

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  motivo: { text: "El motivo es obligatorio (mínimo 3 caracteres).", error: true },
  "no-revocable": { text: "Ese certificado ya no se puede modificar.", error: true },
  "sin-nombre": { text: "Al alumno le falta el nombre o el apellido: no se puede reemitir todavía.", error: true },
  "no-reemitido": { text: "No se pudo reemitir el certificado.", error: true },
  revocado: { text: "Certificado revocado. Quedó registrado en la auditoría.", error: false },
  reemitido: { text: "Certificado reemitido con un código nuevo. El anterior quedó revocado.", error: false },
  reenviado: { text: "Email reenviado.", error: false },
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function AdminCertificatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<CertificateSearchParams & { ok?: string; error?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const filters = parseCertificateFilters(query);
  const [rows, courseOptions] = await Promise.all([scoped.certificates.listForAdmin(filters), scoped.certificates.distinctCourses()]);
  const message = MESSAGES[query.error ?? query.ok ?? ""];
  const exportParams = new URLSearchParams(
    Object.entries({ q: query.q, curso: query.curso, estado: query.estado, desde: query.desde, hasta: query.hasta }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Certificados</h1>
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Panel de la cámara
          </Link>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/certificados/configuracion" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            Firmas y texto del certificado
          </Link>
          <a href={`/admin/certificados/export${exportParams ? `?${exportParams}` : ""}`} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="q" className="text-xs">Buscar (nombre, DNI, empresa, curso, email o código)</Label>
          <Input id="q" name="q" defaultValue={query.q} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="curso" className="text-xs">Curso</Label>
          <select id="curso" name="curso" defaultValue={filters.courseId ?? ""} className={selectClass}>
            <option value="">Todos</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado" className="text-xs">Estado</Label>
          <select id="estado" name="estado" defaultValue={query.estado ?? ""} className={selectClass}>
            <option value="">Todos</option>
            <option value="vigente">Vigentes</option>
            <option value="revocado">Revocados</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desde" className="text-xs">Desde</Label>
            <Input id="desde" name="desde" type="date" defaultValue={query.desde} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hasta" className="text-xs">Hasta</Label>
            <Input id="hasta" name="hasta" type="date" defaultValue={query.hasta} />
          </div>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Filtrar</Button>
          <Link href="/admin/certificados" className={cn(buttonVariants({ variant: "ghost" }))}>Limpiar</Link>
          <p className="ml-auto text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "certificado" : "certificados"}</p>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay certificados con esos filtros.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => {
            const revoked = c.revokedAt !== null;
            return (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.holderName}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        {c.holderDni ? `· DNI ${c.holderDni} ` : ""}· {c.email}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.courseTitle} · nota {c.score}/100 · {formatLongDate(c.issuedAt)}
                      {c.companyName ? ` · ${c.companyName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Código {c.code}
                      {c.replacesCertificateId ? " · reemplaza a uno anterior" : ""}
                      {revoked ? ` · revocado el ${formatDate(c.revokedAt!)} (${c.revokedReason})` : ""}
                    </p>
                  </div>
                  {revoked ? <Badge variant="destructive">Revocado</Badge> : <Badge variant="secondary">Vigente</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap items-start gap-2">
                  {!revoked ? (
                    <>
                      <a href={`/api/certificates/${c.code}/pdf`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                        <Download className="size-4" aria-hidden /> PDF
                      </a>
                      <Link href={`/verificar/${c.code}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                        Ver verificación
                      </Link>
                      <form action={resendCertificateEmail}>
                        <input type="hidden" name="certificateId" value={c.id} />
                        <Button type="submit" variant="outline" size="sm">
                          <Mail className="size-4" aria-hidden /> Reenviar email
                        </Button>
                      </form>
                    </>
                  ) : null}
                  <ReasonAction label="Reemitir" description="Revoca este certificado y emite uno nuevo con otro código, con el nombre y el DNI actuales del alumno." action={reissueCertificateAction} certificateId={c.id} />
                  {!revoked ? (
                    <ReasonAction label="Revocar" description="El certificado deja de ser válido y el PDF deja de poder descargarse." action={revokeCertificate} certificateId={c.id} destructive />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReasonAction({
  label,
  description,
  action,
  certificateId,
  destructive,
}: {
  label: string;
  description: string;
  action: (formData: FormData) => Promise<void>;
  certificateId: string;
  destructive?: boolean;
}) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className={cn("flex h-7 cursor-pointer list-none items-center rounded-lg px-2.5 text-sm font-medium", destructive ? "text-danger" : "")}>
        {label}
      </summary>
      <form action={action} className="flex w-72 flex-col gap-2 border-t border-border p-3">
        <input type="hidden" name="certificateId" value={certificateId} />
        <p className="text-xs text-muted-foreground">{description}</p>
        <Label htmlFor={`reason-${label}-${certificateId}`} className="text-xs">Motivo (obligatorio)</Label>
        <Input id={`reason-${label}-${certificateId}`} name="reason" required minLength={3} maxLength={500} />
        <Button type="submit" size="sm" variant={destructive ? "destructive" : "default"}>
          Confirmar: {label.toLowerCase()}
        </Button>
      </form>
    </details>
  );
}
