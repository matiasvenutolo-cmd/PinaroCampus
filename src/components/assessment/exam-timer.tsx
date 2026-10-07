"use client";

import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Cuenta regresiva. `serverNow` corrige el desfasaje entre el reloj del
 * dispositivo y el del servidor; al llegar a cero llama a `onExpire` una vez.
 */
export function ExamTimer({
  expiresAt,
  serverNow,
  onExpire,
}: {
  expiresAt: string;
  serverNow: string;
  onExpire: () => void;
}) {
  const end = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);
  const fired = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Desfasaje entre el reloj del dispositivo y el del servidor, medido una vez al montar.
    const offset = new Date(serverNow).getTime() - Date.now();
    const tick = () => {
      const left = end - (Date.now() + offset);
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end, serverNow]);

  const low = remaining !== null && remaining <= 5 * 60_000;
  return (
    <div
      role="timer"
      aria-label="Tiempo restante"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium tabular-nums",
        low ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-card",
      )}
    >
      <Clock className="size-4" aria-hidden />
      {remaining === null ? "--:--" : format(remaining)}
    </div>
  );
}
