import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// docs/02-arquitectura.md: "se agrega un lint custom o un test que falle si
// se importa `db` directo en src/app/[domain]/**". Acá va como test: evita
// que alguien se salga de tenant-scope.ts para tocar una tabla 🔒.
const TENANT_APP_DIR = join(process.cwd(), "src/app/[domain]");
const FORBIDDEN_IMPORT = /from\s+["']@\/lib\/db["']/;

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return collectFiles(fullPath);
    if (/\.(ts|tsx)$/.test(entry)) return [fullPath];
    return [];
  });
}

describe("aislamiento: src/app/[domain] nunca importa `db` directo", () => {
  it("todo acceso a datos pasa por tenant-scope u otro helper de src/lib", () => {
    const files = collectFiles(TENANT_APP_DIR);
    const offenders = files.filter((file) => FORBIDDEN_IMPORT.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("encontró al menos un archivo (si esto da 0, el test no está revisando nada)", () => {
    expect(collectFiles(TENANT_APP_DIR).length).toBeGreaterThan(0);
  });
});
