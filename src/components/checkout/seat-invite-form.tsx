"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseEmailList } from "@/lib/seat-codes";

/** Pegá emails (uno por línea o desde Excel); muestra cuántos son válidos antes de enviar. */
export function SeatInviteForm({
  action,
  available,
}: {
  action: (formData: FormData) => Promise<void>;
  available: number;
}) {
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => parseEmailList(raw), [raw]);
  const over = parsed.valid.length > available;

  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="invite-emails" className="text-sm font-medium">
        Enviar códigos por email
      </Label>
      <textarea
        id="invite-emails"
        name="emails"
        rows={4}
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        placeholder={"ana@empresa.com\nluis@empresa.com"}
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {parsed.valid.length} {parsed.valid.length === 1 ? "email válido" : "emails válidos"}
        {parsed.invalid.length > 0 ? ` · ${parsed.invalid.length} con error (se van a omitir)` : ""}
        {` · ${available} ${available === 1 ? "código disponible" : "códigos disponibles"}`}
      </p>
      {over ? (
        <p role="alert" className="text-xs text-danger">
          Hay más emails que códigos disponibles: los que sobren no se van a enviar.
        </p>
      ) : null}
      <Button type="submit" disabled={parsed.valid.length === 0 || available === 0} className="self-start">
        Enviar {parsed.valid.length > 0 ? parsed.valid.length : ""} {parsed.valid.length === 1 ? "código" : "códigos"}
      </Button>
    </form>
  );
}
