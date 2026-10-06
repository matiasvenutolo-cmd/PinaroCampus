import { notFound } from "next/navigation";

import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export default async function TerminosPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  return (
    <article className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-sm leading-7 text-foreground">
      <h1 className="mb-6 text-2xl font-semibold">Términos y condiciones</h1>
      {tenant.legalTermsMd ? (
        <pre className="whitespace-pre-wrap font-sans">{tenant.legalTermsMd}</pre>
      ) : (
        <div className="flex flex-col gap-4">
          <p>
            Al registrarte en {tenant.campusName} aceptás cursar los contenidos de buena fe, no
            compartir tu acceso con terceros y usar los certificados emitidos de forma veraz.
          </p>
          <p>
            {tenant.name} y Pinaro pueden suspender el acceso ante un uso indebido de la
            plataforma. Ante cualquier duda, escribí a {tenant.contactEmail}.
          </p>
        </div>
      )}
    </article>
  );
}
