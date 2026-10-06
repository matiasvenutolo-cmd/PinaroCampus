/**
 * Borra TODO el schema público y lo vuelve a crear desde cero (migraciones +
 * seed). Pensado solo para una base de desarrollo propia — nunca correrlo
 * contra una base compartida o de producción.
 *
 * Por seguridad no alcanza con NODE_ENV=development: hace falta pasar
 * explícitamente CONFIRM_RESET=yes.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import postgres from "postgres";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:reset no corre con NODE_ENV=production.");
  }
  if (process.env.CONFIRM_RESET !== "yes") {
    throw new Error(
      'Esto borra TODAS las tablas de la base. Si estás seguro, corré: CONFIRM_RESET=yes pnpm db:reset',
    );
  }

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("Falta DATABASE_URL_UNPOOLED en .env.local.");

  const sql = postgres(url, { max: 1 });
  console.log("Borrando schemas public y drizzle...");
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql.end();

  console.log("Aplicando migraciones...");
  execSync("pnpm db:migrate", { stdio: "inherit" });

  console.log("Sembrando datos de demo...");
  execSync("pnpm db:seed", { stdio: "inherit" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
