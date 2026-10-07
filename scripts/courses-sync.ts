/**
 * `pnpm courses:sync`: valida y sincroniza content/courses/** a la base.
 * Corre en el build de Vercel (script `vercel-build`) y a mano.
 * `--force` re-sincroniza aunque el hash no haya cambiado.
 */
import { config as loadEnv } from "dotenv";

// `src/lib/courses/sync` importa `src/env.ts` transitivamente: hay que cargar
// `.env.local` antes (en Vercel las variables ya vienen del entorno).
loadEnv({ path: ".env.local" });
const { syncAllCourses } = await import("../src/lib/courses/sync");

const force = process.argv.includes("--force");
const results = await syncAllCourses({ force });

let invalid = 0;
for (const r of results) {
  const detail = r.lessons ? ` (${r.lessons} lecciones)` : "";
  console.log(`${r.status === "invalid" ? "✗" : "✓"} ${r.slug}: ${r.status}${detail}`);
  for (const issue of r.issues) {
    const where = `${issue.file}${issue.line ? `:${issue.line}` : ""}`;
    console.log(`    ${issue.level === "error" ? "ERROR  " : "warning"} ${where}: ${issue.message}`);
  }
  if (r.status === "invalid") invalid++;
}

process.exit(invalid > 0 ? 1 : 0);
