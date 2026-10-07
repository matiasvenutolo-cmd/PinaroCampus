"use client";

import { useMemo } from "react";

const COLORS = ["var(--primary)", "var(--accent)", "var(--success)"];

/**
 * Confeti sutil, una sola vez al aprobar. Solo CSS (`.confetti-piece` en
 * globals.css) y se apaga con `prefers-reduced-motion`.
 */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${((i * 53) % 60) / 100}s`,
        duration: `${1.6 + ((i * 29) % 12) / 10}s`,
        color: COLORS[i % COLORS.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden">
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: piece.left,
            background: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            transform: `rotate(${piece.rotate})`,
          }}
        />
      ))}
    </div>
  );
}
