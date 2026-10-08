import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/auth/config";
import { formatCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents } from "@/lib/format";
import { startSeatPurchase } from "@/lib/payments/actions";
import { quotePurchase } from "@/lib/payments/service";
import { SEAT_PACK_MIN } from "@/lib/pricing";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Comprar para mi equipo" };

const ERRORS: Record<string, string> = {
  "cuit-invalido": "Revisá el CUIT: tiene que ser un CUIT válido de 11 dígitos.",
  "cantidad-invalida": "La cantidad no es válida para esta cámara.",
  "solo-socios": "Este curso es solo para socios verificados de la cámara.",
  "no-disponible": "Este curso no está disponible para comprar.",
};

export default async function SeatPurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ curso?: string; cantidad?: string; cuit?: string; error?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const course = query.curso ? await scoped.catalog.findBySlug(query.curso) : null;
  if (!course || course.status !== "published" || course.visibility === "hidden") notFound();

  const session = await auth();
  const membership = session?.user?.id ? await scoped.memberships.findByUserId(session.user.id) : null;
  const ownCompany = membership?.companyId ? await scoped.companies.findById(membership.companyId) : null;

  const quantity = Number(query.cantidad ?? "");
  const cuit = query.cuit ?? (ownCompany ? formatCuit(ownCompany.cuit) : "");
  const quoted =
    session?.user?.id && membership?.onboardedAt && query.cantidad && query.cuit
      ? await quotePurchase(tenant, session.user.id, { courseSlug: course.slug, type: "seat_pack", quantity, companyCuit: query.cuit })
      : null;

  const error = query.error ?? (quoted && !quoted.ok ? ({ invalid_cuit: "cuit-invalido", invalid_quantity: "cantidad-invalida", members_only: "solo-socios", not_available: "no-disponible" } as Record<string, string>)[quoted.error] : undefined);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <Link href={`/cursos/${course.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Comprar para mi equipo</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Comprás vacantes del curso y recibís un código por cada una. Se los mandás a tu equipo por email desde Mis compras y cada persona lo canjea con su
        cuenta. Vos no necesitás cursar.
      </p>

      <form method="get" className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <input type="hidden" name="curso" value={course.slug} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cantidad">Cantidad de vacantes (mínimo {SEAT_PACK_MIN}, máximo {tenant.seatPackMax})</Label>
            <Input id="cantidad" name="cantidad" type="number" min={SEAT_PACK_MIN} max={tenant.seatPackMax} defaultValue={query.cantidad ?? "5"} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cuit">CUIT de la empresa</Label>
            <Input id="cuit" name="cuit" defaultValue={cuit} inputMode="numeric" placeholder="30-12345678-9" required />
          </div>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{ERRORS[error] ?? ERRORS["no-disponible"]}</p> : null}
        <Button type="submit" variant="outline" className="self-start">
          Ver el precio
        </Button>
      </form>

      {quoted?.ok ? (
        <section aria-label="Cotización" className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Tu compra</h2>
          <dl className="mt-3 flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Empresa</dt>
              <dd>{quoted.companyName ?? formatCuit(query.cuit ?? "")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Precio por vacante</dt>
              <dd className="tabular-nums">
                {formatCents(quoted.quote.unitPriceCents)}
                {quoted.tier === "member" ? " (precio socio)" : ""}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Cantidad</dt>
              <dd className="tabular-nums">{quoted.quote.quantity}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{quoted.quote.totalCents === 0 ? "Gratis" : formatCents(quoted.quote.totalCents)}</dd>
            </div>
          </dl>
          {quoted.tier === "non_member" && tenant.memberValidationMode !== "open" ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Si la empresa es socia de la cámara y tu pedido de socio está verificado, el precio baja al de socios.
            </p>
          ) : null}
          <form action={startSeatPurchase} className="mt-4">
            <input type="hidden" name="courseSlug" value={course.slug} />
            <input type="hidden" name="quantity" value={quoted.quote.quantity} />
            <input type="hidden" name="cuit" value={query.cuit} />
            <Button type="submit" size="lg" className="h-10">
              Continuar al pago
            </Button>
          </form>
        </section>
      ) : null}

      {!session?.user ? (
        <form action={startSeatPurchase} className="mt-4 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Para comprar necesitás ingresar. Después de ingresar volvés a esta pantalla.</p>
          <input type="hidden" name="courseSlug" value={course.slug} />
          <input type="hidden" name="quantity" value={Number.isFinite(quantity) && quantity > 0 ? quantity : 5} />
          <input type="hidden" name="cuit" value={query.cuit ?? ""} />
          <Button type="submit" className="mt-3">
            Ingresar para comprar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
