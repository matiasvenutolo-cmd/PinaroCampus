/**
 * `pnpm courses:validate`: valida content/courses/** (docs/05, sección
 * "Validador"). Errores => exit 1 (falla el CI); warnings se muestran igual.
 */
import { validateAllCourses } from "../src/lib/courses/validate";

async function main() {
  const results = await validateAllCourses();
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    const base = `content/courses/${result.slug}`;
    const courseErrors = result.issues.filter((i) => i.level === "error").length;
    const courseWarnings = result.issues.length - courseErrors;
    errors += courseErrors;
    warnings += courseWarnings;

    console.log(`${courseErrors ? "✗" : "✓"} ${result.slug}  (${courseErrors} errores, ${courseWarnings} warnings)`);
    for (const issue of result.issues) {
      const location = `${base}/${issue.file}${issue.line ? `:${issue.line}` : ""}`;
      console.log(`    ${issue.level === "error" ? "ERROR  " : "warning"} ${location}\n            ${issue.message}`);
    }
  }

  console.log(`\n${results.length} cursos · ${errors} errores · ${warnings} warnings`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
