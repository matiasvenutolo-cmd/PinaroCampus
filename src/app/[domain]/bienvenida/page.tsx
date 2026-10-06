import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

import { completeOnboarding } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  "datos-invalidos": "Revisá los datos: falta el nombre, el apellido o aceptar los términos.",
  "cuit-invalido": "Ese CUIT no es válido. Verificá los 11 dígitos.",
};

export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const tenant = await getCurrentTenant();
  const membership = await forTenant(tenant.id).memberships.findByUserId(user.id);
  if (membership?.onboardedAt) redirect("/mi-campus");

  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Bienvenido a {tenant.campusName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={completeOnboarding} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Apellido</Label>
                <Input id="lastName" name="lastName" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dni">DNI (opcional, para el certificado)</Label>
              <Input id="dni" name="dni" inputMode="numeric" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cuit">CUIT de tu empresa (opcional)</Label>
              <Input id="cuit" name="cuit" placeholder="20123456789" inputMode="numeric" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jobTitle">Cargo (opcional)</Label>
              <Input id="jobTitle" name="jobTitle" />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="acceptedTerms" name="acceptedTerms" required />
              <Label htmlFor="acceptedTerms" className="text-sm font-normal text-muted-foreground">
                Acepto los{" "}
                <Link href="/legal/terminos" className="underline underline-offset-4">
                  términos
                </Link>{" "}
                y la{" "}
                <Link href="/legal/privacidad" className="underline underline-offset-4">
                  política de privacidad
                </Link>
                .
              </Label>
            </div>
            {error && <p className="text-sm text-danger">{ERROR_MESSAGES[error] ?? error}</p>}
            <Button type="submit" className="w-full">
              Empezar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
