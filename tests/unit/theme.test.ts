import { describe, expect, it } from "vitest";

import {
  cssVariablesToStyleTag,
  getContrastRatio,
  hasEnoughContrastOnBackground,
  resolveForeground,
  tenantThemeToCssVariables,
} from "@/lib/tenant/theme";

describe("theme", () => {
  it("el contraste de blanco contra negro es el máximo (21)", () => {
    expect(getContrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it("el contraste de un color contra sí mismo es 1", () => {
    expect(getContrastRatio("#1E4FA3", "#1E4FA3")).toBeCloseTo(1, 5);
  });

  it("resuelve foreground blanco para un primario oscuro", () => {
    expect(resolveForeground("#1E4FA3")).toBe("#FFFFFF");
  });

  it("resuelve foreground oscuro para un primario claro", () => {
    expect(resolveForeground("#F2A900")).toBe("#0A0A0A");
  });

  it("detecta contraste insuficiente contra el fondo claro", () => {
    expect(hasEnoughContrastOnBackground("#F2A900")).toBe(false); // ámbar claro, bajo contraste
    expect(hasEnoughContrastOnBackground("#1E4FA3")).toBe(true); // azul oscuro, buen contraste
  });

  it("tenantThemeToCssVariables arma las 7 variables esperadas", () => {
    const vars = tenantThemeToCssVariables({
      primary: "#1E4FA3",
      primaryForeground: "auto",
      accent: "#F2A900",
      accentForeground: "auto",
      radius: 12,
    });
    expect(vars["--primary"]).toBe("#1E4FA3");
    expect(vars["--primary-foreground"]).toBe("#FFFFFF");
    expect(vars["--accent-foreground"]).toBe("#0A0A0A");
    expect(vars["--radius"]).toBe("12px");
    expect(vars["--primary-soft"]).toMatch(/^rgba\(/);
  });

  it("cssVariablesToStyleTag arma un bloque :root válido y filtra valores raros", () => {
    const tag = cssVariablesToStyleTag({
      "--primary": "#1E4FA3",
      "--primary-foreground": "#FFFFFF",
      "--primary-soft": "rgba(30, 79, 163, 0.08)",
      "--primary-hover": "#1a4590",
      "--accent": "#F2A900",
      "--accent-foreground": "#0A0A0A",
      "--radius": "12px",
    });
    expect(tag).toContain(":root {");
    expect(tag).toContain("--primary: #1E4FA3;");
    expect(tag).not.toContain("<"); // nunca rompe el <style>
  });
});
