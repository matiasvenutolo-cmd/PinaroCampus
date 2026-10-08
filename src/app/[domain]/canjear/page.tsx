import { Ticket } from "lucide-react";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/auth/config";
import { loginToRedeem, redeemCode } from "@/lib/payments/actions";
import { normalizeSeatCode } from "@/lib/seat-codes";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Canjear una vacante" };

const ERRORS: Record<string, string> = {
  invalid: "El código no tiene el formato correcto (XXXX-XXXX). Revisalo.",
  not_found: "No encontramos ese código en esta plataforma.",
  redeemed: "Ese código ya fue canjeado.",
  revoked: "Ese código fue anulado. Consultá a quien te lo envió.",
  expired: "Ese código venció.",
  already_enrolled: "Ya estás inscripto en este curso. El código no se consumió: puede usarlo otra persona.",
  not_onboarded: "Primero completá tus datos.",
};

export default async function RedeemPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ codigo?: string; error?: string }>;
}) {
  const { domain } = await params;
  const { codigo, error } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const session = await auth();
  const code = codigo ? (normalizeSeatCode(codigo) ?? codigo.slice(0, 20)) : "";

  return (
    <div className="mx-auto w-full max-w-[460px] px-4 py-12">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg text-primary" style={{ background: "var(--primary-soft)" }}>
          <Ticket className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Canjear una vacante</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Ingresá el código que te mandaron para quedar inscripto en el curso.</p>

      <form action={session?.user ? redeemCode : loginToRedeem} className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <Label htmlFor="code">Código</Label>
        <Input id="code" name="code" defaultValue={code} placeholder="XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} required />
        {error ? <p role="alert" className="text-sm text-danger">{ERRORS[error] ?? "No pudimos canjear el código."}</p> : null}
        <Button type="submit" size="lg" className="h-10">
          {session?.user ? "Canjear" : "Ingresar y canjear"}
        </Button>
        {!session?.user ? (
          <p className="text-xs text-muted-foreground">Primero ingresás con tu email; después te llevamos de vuelta acá con el código cargado.</p>
        ) : null}
      </form>
    </div>
  );
}
