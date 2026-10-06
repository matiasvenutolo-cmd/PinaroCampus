import { notFound } from "next/navigation";

import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export default async function TenantHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span
        className="rounded-full px-3 py-1 text-xs font-medium"
        style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
      >
        {tenant.campusName}
      </span>
      <h1 className="max-w-lg text-3xl font-semibold text-balance">
        {tenant.homeContent.heroTitle ?? `Capacitación para las empresas de ${tenant.name}`}
      </h1>
      <p className="max-w-md text-muted-foreground">
        {tenant.homeContent.heroSubtitle ??
          "El catálogo de cursos está en construcción. Mientras tanto, podés ingresar con tu email."}
      </p>
    </div>
  );
}
