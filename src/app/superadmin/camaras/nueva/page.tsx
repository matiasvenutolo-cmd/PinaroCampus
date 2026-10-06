import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createTenant } from "../../actions";

const ERROR_MESSAGES: Record<string, string> = {
  "datos-invalidos": "Revisá los datos: todos los campos son obligatorios.",
};

export default async function NuevaCamaraPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Nueva cámara</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createTenant} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" placeholder="civa" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shortName">Nombre corto</Label>
              <Input id="shortName" name="shortName" placeholder="CIVA" required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Razón social / nombre completo</Label>
            <Input id="name" name="name" placeholder="Cámara Industrial Valle Azul" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campusName">Nombre de la plataforma</Label>
            <Input id="campusName" name="campusName" placeholder="Campus CIVA" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contactEmail">Email de contacto</Label>
            <Input id="contactEmail" name="contactEmail" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hostname">Dominio inicial</Label>
            <Input id="hostname" name="hostname" placeholder="civa.localhost:3000" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryColor">Color primario</Label>
              <Input id="primaryColor" name="primaryColor" type="color" defaultValue="#1E4FA3" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accentColor">Color de acento</Label>
              <Input id="accentColor" name="accentColor" type="color" defaultValue="#F2A900" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memberValidationMode">Modo de validación de socios</Label>
            <select
              id="memberValidationMode"
              name="memberValidationMode"
              defaultValue="open"
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
            >
              <option value="open">open — todos pagan precio no socio</option>
              <option value="cuit">cuit — valida contra el padrón</option>
              <option value="cuit_email_domain">cuit_email_domain — CUIT + dominio de email</option>
              <option value="manual">manual — un admin aprueba cada pedido</option>
            </select>
          </div>
          {error && <p className="text-sm text-danger">{ERROR_MESSAGES[error] ?? error}</p>}
          <Button type="submit" className="w-full">
            Crear cámara
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
