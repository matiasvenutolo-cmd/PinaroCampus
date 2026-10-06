"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getContrastRatio, resolveForeground } from "@/lib/tenant/theme";

export function BrandColorFields({
  initialPrimary,
  initialAccent,
}: {
  initialPrimary: string;
  initialAccent: string;
}) {
  const [primary, setPrimary] = useState(initialPrimary);
  const [accent, setAccent] = useState(initialAccent);

  const contrastOk = getContrastRatio(primary, "#FAFAFA") >= 4.5;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryColor">Color primario</Label>
          <Input
            id="primaryColor"
            name="primaryColor"
            type="color"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accentColor">Color de acento</Label>
          <Input
            id="accentColor"
            name="accentColor"
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          />
        </div>
      </div>

      {!contrastOk && (
        <p className="text-xs text-warning">
          Ese primario tiene poco contraste contra el fondo claro ({primary}). Elegí una variante
          más oscura para que el texto y los links se lean bien.
        </p>
      )}

      <div
        className="flex items-center gap-3 rounded-lg border border-border p-4"
        style={{ background: `${primary}14` }}
      >
        <span
          className="rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: primary, color: resolveForeground(primary) }}
        >
          Botón primario
        </span>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: accent, color: resolveForeground(accent) }}
        >
          Etiqueta de acento
        </span>
        <span className="text-sm text-muted-foreground">Vista previa en vivo</span>
      </div>
    </div>
  );
}
