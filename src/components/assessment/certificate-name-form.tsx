"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCertificateName } from "@/lib/assessments/actions";

/** Se muestra solo si al aprobar faltaba el nombre o el apellido del alumno. */
export function CertificateNameForm({
  courseSlug,
  lessonKey,
  onIssued,
}: {
  courseSlug: string;
  lessonKey: string;
  onIssued: (code: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveCertificateName({
            courseSlug,
            lessonKey,
            firstName: String(data.get("firstName") ?? ""),
            lastName: String(data.get("lastName") ?? ""),
            dni: String(data.get("dni") ?? "") || undefined,
          });
          if (result.ok) onIssued(result.certificate?.code ?? null);
          else setError(result.error);
        });
      }}
    >
      <p className="font-medium">¿Cómo querés que figure tu nombre en el certificado?</p>
      <p className="text-sm text-muted-foreground">Una vez emitido no se puede cambiar, así que revisalo bien.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cert-first">Nombre</Label>
          <Input id="cert-first" name="firstName" required maxLength={80} autoComplete="given-name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cert-last">Apellido</Label>
          <Input id="cert-last" name="lastName" required maxLength={80} autoComplete="family-name" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cert-dni">DNI (opcional)</Label>
        <Input id="cert-dni" name="dni" inputMode="numeric" maxLength={20} />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Emitiendo…" : "Emitir mi certificado"}
      </Button>
    </form>
  );
}
