import { CircleCheck, CircleX, SearchX } from "lucide-react";

import { VerifyForm } from "@/components/certificates/verify-form";
import { getPublicCertificate } from "@/lib/certificates/verify";
import { formatHours, formatLongDate } from "@/lib/certificates/format";

export const metadata = { title: "Verificación de certificado", robots: { index: false, follow: false } };

type Params = Promise<{ domain: string; code: string }>;

export default async function VerifyCertificatePage({ params }: { params: Params }) {
  const { code } = await params;
  const certificate = await getPublicCertificate(decodeURIComponent(code));

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-12">
      {certificate.state === "valid" ? (
        <section aria-label="Certificado válido" className="rounded-xl border border-success/40 bg-card p-6">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-9 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-xl font-semibold text-success">Válido</p>
              <p className="text-sm text-muted-foreground">Este certificado es auténtico y está vigente.</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 text-sm">
            <Item label="Otorgado a" value={certificate.holderName ?? ""} large />
            <Item label="Curso" value={certificate.courseTitle} />
            <Item label="Carga horaria" value={formatHours(certificate.hours)} />
            <Item label="Fecha de emisión" value={formatLongDate(certificate.issuedAt)} />
            <Item label="Emitido por" value={certificate.issuerName} />
            <Item label="Código" value={certificate.code} />
          </dl>
        </section>
      ) : certificate.state === "revoked" ? (
        <section aria-label="Certificado revocado" className="rounded-xl border border-danger/40 bg-card p-6">
          <div className="flex items-center gap-3">
            <CircleX className="size-9 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="text-xl font-semibold text-danger">Revocado</p>
              <p className="text-sm text-muted-foreground">
                Este certificado fue revocado el {formatLongDate(certificate.revokedAt!)} y ya no es válido.
              </p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 text-sm">
            <Item label="Curso" value={certificate.courseTitle} />
            <Item label="Emitido por" value={certificate.issuerName} />
            <Item label="Código" value={certificate.code} />
          </dl>
        </section>
      ) : (
        <section aria-label="Certificado inexistente" className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <SearchX className="size-9 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xl font-semibold">No lo encontramos</p>
              <p className="text-sm text-muted-foreground">No encontramos un certificado con ese código.</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Código consultado: {certificate.code}</p>
        </section>
      )}

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <VerifyForm />
      </div>
    </div>
  );
}

function Item({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={large ? "text-lg font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}
