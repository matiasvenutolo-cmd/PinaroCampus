import type { TenantTheme } from "./types";

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = Number.parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(c: number) {
  const srgb = c / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Ratio de contraste WCAG entre dos colores hex, de 1 (igual) a 21 (máximo). */
export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = "#FFFFFF";
const NEAR_BLACK = "#0A0A0A";

/** docs/08-diseno-ui.md: "auto" elige blanco o casi-negro según contraste WCAG. */
export function resolveForeground(hex: string): string {
  const contrastWithWhite = getContrastRatio(hex, WHITE);
  const contrastWithBlack = getContrastRatio(hex, NEAR_BLACK);
  return contrastWithWhite >= contrastWithBlack ? WHITE : NEAR_BLACK;
}

function toRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r * (1 - amount))}${toHex(g * (1 - amount))}${toHex(b * (1 - amount))}`;
}

export interface TenantCssVariables {
  "--primary": string;
  "--primary-foreground": string;
  "--primary-soft": string;
  "--primary-hover": string;
  "--accent": string;
  "--accent-foreground": string;
  "--radius": string;
}

/** Convierte el `theme` jsonb de una cámara en las variables CSS que consume
 * `[domain]/layout.tsx` (ver docs/08-diseno-ui.md). */
export function tenantThemeToCssVariables(theme: TenantTheme): TenantCssVariables {
  const primaryForeground =
    theme.primaryForeground === "auto" ? resolveForeground(theme.primary) : theme.primaryForeground;
  const accentForeground =
    theme.accentForeground === "auto" ? resolveForeground(theme.accent) : theme.accentForeground;

  return {
    "--primary": theme.primary,
    "--primary-foreground": primaryForeground,
    "--primary-soft": toRgba(theme.primary, 0.08),
    "--primary-hover": darken(theme.primary, 0.12),
    "--accent": theme.accent,
    "--accent-foreground": accentForeground,
    "--radius": `${theme.radius}px`,
  };
}

/** Para la advertencia en el panel de marca: contraste del primario contra el
 * fondo claro de la plataforma (texto y links sobre `--background`). */
export function hasEnoughContrastOnBackground(hex: string): boolean {
  return getContrastRatio(hex, "#FAFAFA") >= 4.5;
}

const SAFE_CSS_VALUE = /^[#a-zA-Z0-9(),.%\s-]+$/;

/**
 * El `<style>` del layout de cada cámara (docs/02-arquitectura.md) interpola
 * estas variables en HTML crudo. Es la única defensa en profundidad real:
 * si por lo que sea un valor no pasó por `tenantThemeSchema` (o la validación
 * cambia en el futuro), esto evita que termine rompiendo el `<style>`.
 */
export function cssVariablesToStyleTag(vars: TenantCssVariables): string {
  const declarations = Object.entries(vars)
    .filter(([, value]) => SAFE_CSS_VALUE.test(value))
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
  return `:root { ${declarations} }`;
}
