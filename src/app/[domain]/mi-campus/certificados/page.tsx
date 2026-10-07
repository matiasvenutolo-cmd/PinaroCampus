import { Download, GraduationCap, Share2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CopyLinkButton } from "@/components/certificates/copy-link-button";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { formatHours, formatLongDate } from "@/lib/certificates/format";
import { linkedInAddUrl } from "@/lib/certificates/linkedin";
import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { buildTenantUrl } from "@/lib/tenant/urls";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mis certificados" };

export default async function MyCertificatesPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const certificates = await forTenant(tenant.id).certificates.listForUser(user.id);
  const withLinks = await Promise.all(
    certificates.map(async (c) => ({ ...c, verifyUrl: await buildTenantUrl(tenant.id, `/verificar/${c.code}`) })),
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
      <h1 className="text-2xl font-semibold">Mis certificados</h1>

      {withLinks.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full text-primary" style={{ background: "var(--primary-soft)" }}>
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <p className="font-medium">Todavía no tenés certificados</p>
          <p className="text-sm text-muted-foreground">Completá un curso y aprobá el examen final para obtener el tuyo.</p>
          <Button asChild className="mt-2">
            <Link href="/mi-campus">Ir a mi campus</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {withLinks.map((c) => {
            const revoked = c.revokedAt !== null;
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{c.courseTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatLongDate(c.issuedAt)} · {formatHours(c.hours)}
                    </p>
                    <p className="text-xs text-muted-foreground">Código {c.code}</p>
                  </div>
                  {revoked ? <Badge variant="destructive">Revocado</Badge> : <Badge variant="secondary">Vigente</Badge>}
                </div>
                {revoked ? (
                  <p className="text-sm text-muted-foreground">Este certificado fue revocado. Consultá a la cámara si creés que es un error.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/certificates/${c.code}/pdf`} className={cn(buttonVariants({ size: "sm" }))}>
                      <Download className="size-4" aria-hidden /> Descargar PDF
                    </a>
                    <CopyLinkButton url={c.verifyUrl} />
                    <a
                      href={linkedInAddUrl({
                        courseTitle: c.courseTitle,
                        issuerName: tenant.name,
                        issuedAt: c.issuedAt,
                        code: c.code,
                        verifyUrl: c.verifyUrl,
                      })}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      <Share2 className="size-4" aria-hidden /> Compartir en LinkedIn
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
