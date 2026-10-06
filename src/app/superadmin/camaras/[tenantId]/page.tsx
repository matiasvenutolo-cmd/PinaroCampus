import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandColorFields } from "@/components/superadmin/brand-color-fields";
import { db } from "@/lib/db";
import { tenantDomains, tenantMemberships, tenants, users } from "@/lib/db/schema";
import { startPreview } from "@/lib/tenant/preview-actions";

import { addTenantAdmin, addTenantDomain, updateTenantBrand } from "../../actions";

const ERROR_MESSAGES: Record<string, string> = {
  "datos-invalidos": "Revisá los datos: todos los campos son obligatorios.",
  "dominio-invalido": "Ese dominio no es válido.",
  "email-invalido": "Ingresá un email válido.",
};

export default async function CamaraDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { tenantId } = await params;
  const { error, success } = await searchParams;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) notFound();

  const domains = await db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId));
  const admins = await db
    .select({ email: users.email, name: users.name })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.role, "tenant_admin")));

  const updateBrand = updateTenantBrand.bind(null, tenantId);
  const addDomain = addTenantDomain.bind(null, tenantId);
  const addAdmin = addTenantAdmin.bind(null, tenantId);
  const viewAs = startPreview.bind(null, tenant.slug);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{tenant.campusName}</h1>
        <form action={viewAs}>
          <Button type="submit" variant="outline">
            Ver como
          </Button>
        </form>
      </div>

      {success && <p className="text-sm text-success">Guardado.</p>}
      {error && <p className="text-sm text-danger">{ERROR_MESSAGES[error] ?? error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Marca y datos</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateBrand} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shortName">Nombre corto</Label>
                <Input id="shortName" name="shortName" defaultValue={tenant.shortName} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="campusName">Nombre de la plataforma</Label>
                <Input id="campusName" name="campusName" defaultValue={tenant.campusName} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Razón social / nombre completo</Label>
              <Input id="name" name="name" defaultValue={tenant.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contactEmail">Email de contacto</Label>
                <Input id="contactEmail" name="contactEmail" type="email" defaultValue={tenant.contactEmail} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="websiteUrl">Sitio institucional</Label>
                <Input id="websiteUrl" name="websiteUrl" defaultValue={tenant.websiteUrl ?? ""} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memberValidationMode">Modo de validación de socios</Label>
              <select
                id="memberValidationMode"
                name="memberValidationMode"
                defaultValue={tenant.memberValidationMode}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm"
              >
                <option value="open">open — todos pagan precio no socio</option>
                <option value="cuit">cuit — valida contra el padrón</option>
                <option value="cuit_email_domain">cuit_email_domain — CUIT + dominio de email</option>
                <option value="manual">manual — un admin aprueba cada pedido</option>
              </select>
            </div>
            <BrandColorFields initialPrimary={tenant.theme.primary} initialAccent={tenant.theme.accent} />
            <Button type="submit" className="w-fit">
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dominios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1 text-sm">
            {domains.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <span>{d.hostname}</span>
                {d.isPrimary && <span className="text-xs text-muted-foreground">(primario)</span>}
              </li>
            ))}
          </ul>
          <form action={addDomain} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="hostname">Agregar dominio</Label>
              <Input id="hostname" name="hostname" placeholder="ribera.localhost:3000" required />
            </div>
            <Button type="submit" variant="outline">
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administradores</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-1 text-sm">
            {admins.map((a) => (
              <li key={a.email}>
                {a.name ?? "(sin nombre todavía)"} — {a.email}
              </li>
            ))}
            {admins.length === 0 && (
              <li className="text-muted-foreground">Todavía no hay administradores.</li>
            )}
          </ul>
          <form action={addAdmin} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="email">Nombrar admin por email</Label>
              <Input id="email" name="email" type="email" placeholder="admin@civa.demo" required />
            </div>
            <Button type="submit" variant="outline">
              Agregar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
