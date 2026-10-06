import { notFound } from "next/navigation";

import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export default async function PrivacidadPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  return (
    <article className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 text-sm leading-7 text-foreground">
      <h1 className="mb-6 text-2xl font-semibold">Política de privacidad</h1>
      {tenant.legalPrivacyMd ? (
        <pre className="whitespace-pre-wrap font-sans">{tenant.legalPrivacyMd}</pre>
      ) : (
        <div className="flex flex-col gap-4">
          <p>
            {tenant.campusName} recolecta los datos que cargás al registrarte (nombre, email, CUIT
            de tu empresa) para gestionar tu inscripción a los cursos, emitir tus certificados y
            armar reportes para la cámara, conforme a la Ley 25.326 de Protección de Datos
            Personales.
          </p>
          <p>
            Podés pedir que te mostremos los datos que tenemos sobre vos, o que los eliminemos,
            escribiendo a {tenant.contactEmail}.
          </p>
        </div>
      )}
    </article>
  );
}
