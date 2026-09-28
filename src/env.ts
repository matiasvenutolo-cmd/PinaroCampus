import { z } from "zod";

/**
 * Fuente única de las variables de entorno (docs/02-arquitectura.md).
 * Muchas quedan `optional()` en la Fase 0 porque todavía no hay código que
 * las use (Auth.js, Resend, Mercado Pago llegan en fases posteriores); se
 * van marcando requeridas a medida que la fase correspondiente las consume.
 */
const boolFromString = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Base de datos (Neon) — requeridas desde la Fase 0
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL (Neon, conexión pooled)"),
  DATABASE_URL_UNPOOLED: z
    .string()
    .min(1, "Falta DATABASE_URL_UNPOOLED (Neon, conexión directa para migraciones)"),

  // Auth.js — Fase 1
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_TRUST_HOST: boolFromString("true"),

  // Email transaccional — Fase 1
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Campus <campus@pinaro.ar>"),

  // Archivos (logos, firmas, PDFs) — Fase 1+
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  // Secretos propios
  ENCRYPTION_KEY: z.string().min(1).optional(), // Fase 5: AES-256-GCM para tokens de MP
  PREVIEW_SIGNING_SECRET: z.string().min(1).optional(), // Fase 2: "ver como" y preview de cursos
  CRON_SECRET: z.string().min(1).optional(), // Fase 4+: crons

  // Multi-tenant
  SUPERADMIN_HOSTS: z
    .string()
    .default("localhost:3000,civa.localhost:3000,plataforma.pinaro.ar")
    .transform((value) =>
      value
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
    ),
  PLATFORM_ROOT_DOMAIN: z.string().min(1).default("pinaro.ar"),
  DEV_TENANT_OVERRIDE: z.string().min(1).optional(),
  DEMO_MODE: boolFromString("true"),
  SEED_SUPERADMIN_EMAIL: z.email().optional(),

  // Mercado Pago — Fase 5
  MP_CLIENT_ID: z.string().min(1).optional(),
  MP_CLIENT_SECRET: z.string().min(1).optional(),
  MP_PLATFORM_ACCESS_TOKEN: z.string().min(1).optional(),
  MP_WEBHOOK_SECRET: z.string().min(1).optional(),
  MP_SANDBOX: boolFromString("true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Variables de entorno inválidas. Revisá .env.example y tu .env.local:\n${detail}`,
  );
}

export const env = parsed.data;
