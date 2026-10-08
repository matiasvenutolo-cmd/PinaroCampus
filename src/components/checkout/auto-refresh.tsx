"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Vuelve a pedir la página cada `everyMs` hasta `maxMs`: la pantalla de resultado muestra el estado de la base. */
export function AutoRefresh({ everyMs = 3000, maxMs = 60_000 }: { everyMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > maxMs) return clearInterval(id);
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxMs]);
  return null;
}
