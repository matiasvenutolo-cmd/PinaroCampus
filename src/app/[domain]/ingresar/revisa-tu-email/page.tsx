import { notFound } from "next/navigation";

import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export default async function RevisaTuEmailPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Revisá tu email</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Te mandamos un link para entrar a {tenant.campusName}. Si no lo ves, revisá spam.
      </p>
    </div>
  );
}
