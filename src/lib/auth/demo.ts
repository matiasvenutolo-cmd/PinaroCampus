import "server-only";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import type { Tenant } from "@/lib/tenant/resolve";
import { env } from "@/env";

const SESSION_COOKIE_NAME = "authjs.session-token";
const SECURE_SESSION_COOKIE_NAME = "__Secure-authjs.session-token";
const DEMO_SESSION_HOURS = 24;

/**
 * Crea una sesión de base de datos directa para un usuario seed conocido,
 * sin pasar por el flujo de magic link (docs/02-arquitectura.md, "Login de
 * demo"). Nunca disponible fuera de tenants `is_demo`.
 */
export async function createDemoSession(tenant: Tenant, email: string) {
  if (!env.DEMO_MODE || !tenant.isDemo) {
    throw new Error("El login de demo no está habilitado para esta cámara.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user) {
    throw new Error(`No existe el usuario de demo ${email}. Corré "pnpm db:seed".`);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + DEMO_SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  const isHttps = (await headers()).get("x-forwarded-proto") === "https";
  const cookieName = isHttps ? SECURE_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;

  (await cookies()).set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
    expires,
  });
}
