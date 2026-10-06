import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMagicLink } from "@/lib/auth/actions";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

const ERROR_MESSAGES: Record<string, string> = {
  "email-invalido": "Ingresá un email válido.",
  "demasiados-intentos": "Pediste demasiados links. Probá de nuevo en un rato.",
};

export default async function IngresarPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ingresá a {tenant.campusName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={requestMagicLink} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="vos@empresa.com" />
            </div>
            {error && <p className="text-sm text-danger">{ERROR_MESSAGES[error] ?? error}</p>}
            <Button type="submit" className="w-full">
              Enviarme el link de ingreso
            </Button>
          </form>
          {tenant.isDemo && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              ¿Vení a mostrar la plataforma?{" "}
              <Link href="/demo" className="text-primary underline underline-offset-4">
                Entrá con un usuario de demo
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
