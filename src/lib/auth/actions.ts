"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { checkAndIncrementRateLimit } from "@/lib/rate-limit";

import { signIn, signOut } from "./config";

const emailSchema = z.object({ email: z.email() });

export async function requestMagicLink(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    redirect("/ingresar?error=email-invalido");
  }
  const email = parsed.data.email.toLowerCase();

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  const [okEmail, okIp] = await Promise.all([
    checkAndIncrementRateLimit(`magic:email:${email}`, 5),
    checkAndIncrementRateLimit(`magic:ip:${ip}`, 20),
  ]);
  if (!okEmail || !okIp) {
    redirect("/ingresar?error=demasiados-intentos");
  }

  // `signIn` redirige a `pages.verifyRequest` ("/ingresar/revisa-tu-email")
  // una vez que el provider de email manda el link.
  // `/entrar` decide adónde sigue (la compra que había empezado, el onboarding o Mi campus).
  await signIn("resend", { email, redirectTo: "/entrar" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
