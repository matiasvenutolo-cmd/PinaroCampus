import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { env } from "@/env";

import { demoLoginAction } from "./actions";

export default async function DemoPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant || !tenant.isDemo || !env.DEMO_MODE) notFound();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Demo de {tenant.campusName}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Entrá directo con un usuario de prueba, sin esperar ningún email.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={demoLoginAction}>
          <input type="hidden" name="role" value="student" />
          <Button type="submit" size="lg">
            Entrar como alumno
          </Button>
        </form>
        <form action={demoLoginAction}>
          <input type="hidden" name="role" value="admin" />
          <Button type="submit" size="lg" variant="outline">
            Entrar como admin de la cámara
          </Button>
        </form>
      </div>
    </div>
  );
}
