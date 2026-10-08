"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copia un texto al portapapeles y avisa en el mismo botón ("Código copiado"). */
export function CopyButton({
  text,
  label = "Copiar",
  doneLabel = "Copiado",
  size = "sm",
}: {
  text: string;
  label?: string;
  doneLabel?: string;
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copiá este texto:", text);
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? doneLabel : label}
    </Button>
  );
}
