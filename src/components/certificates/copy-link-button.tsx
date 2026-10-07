"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url, label = "Copiar link de verificación" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copiá este link:", url);
        }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
      {copied ? "Link copiado" : label}
    </Button>
  );
}
