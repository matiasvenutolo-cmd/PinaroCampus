import { describe, expect, it } from "vitest";

import { formatCents, formatDate, formatDuration, formatNumber, formatPesos } from "@/lib/format";

describe("format (es-AR)", () => {
  it("separa miles con punto, incluso en 4 dígitos", () => {
    expect(formatNumber(1234)).toBe("1.234");
    expect(formatNumber(12345.5, 1)).toBe("12.345,5");
  });

  it("montos en centavos", () => {
    expect(formatCents(4500000)).toBe("$ 45.000");
    expect(formatCents(0)).toBe("$ 0");
    expect(formatPesos(9504000)).toBe("$ 9.504.000");
  });

  it("duraciones", () => {
    expect(formatDuration(360)).toBe("6 h");
    expect(formatDuration(95)).toBe("1 h 35 min");
    expect(formatDuration(20)).toBe("20 min");
  });

  it("fechas en hora argentina (no se corre un día cerca de medianoche UTC)", () => {
    expect(formatDate(new Date("2026-10-15T02:30:00Z"))).toBe("14/10/2026");
  });
});
