import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { VerifyForm } from "@/components/certificates/verify-form";
import { normalizeCertificateCode } from "@/lib/certificates/code";

export const metadata = { title: "Verificar un certificado", robots: { index: false, follow: false } };

export default async function VerifyIndexPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code) {
    const normalized = normalizeCertificateCode(code);
    if (normalized) redirect(`/verificar/${normalized}`);
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-12">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg text-primary" style={{ background: "var(--primary-soft)" }}>
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Verificar un certificado</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Ingresá el código que figura al pie del certificado (por ejemplo PC-7K3M-Q9TD) o escaneá su QR.
      </p>
      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <VerifyForm title="Código del certificado" defaultValue={code} />
        {code ? <p role="alert" className="mt-3 text-sm text-danger">El código no tiene el formato correcto. Revisalo e intentá de nuevo.</p> : null}
      </div>
    </div>
  );
}
