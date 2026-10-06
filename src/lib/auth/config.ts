import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { db } from "@/lib/db";
import { accounts, sessions, tenantMemberships, users, verificationTokens } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import { magicLinkEmail } from "@/lib/email/templates/magic-link";
import { getCurrentHost } from "@/lib/tenant/context";
import { getTenantByHost } from "@/lib/tenant/resolve";
import { env } from "@/env";

// La ampliación de tipos de Session/AdapterUser vive en ./types.d.ts; no hace
// falta importarla (TypeScript la toma sola por estar en el `include` de
// tsconfig) — importarla como módulo rompía el build (no es JS en runtime).

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  trustHost: true,
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/ingresar",
    verifyRequest: "/ingresar/revisa-tu-email",
  },
  providers: [
    Resend({
      apiKey: env.RESEND_API_KEY ?? "",
      from: env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        const { host } = new URL(url);
        const tenant = await getTenantByHost(host);
        const { subject, html, text } = magicLinkEmail({ tenant, url });
        await sendEmail({
          tenantId: tenant?.id ?? null,
          to: identifier,
          subject,
          html,
          text,
          replyTo: tenant?.contactEmail,
        });
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.isSuperadmin = user.isSuperadmin;
      return session;
    },
    // El default de Auth.js solo deja volver al mismo origin que calculó
    // `baseUrl`; en un esquema multi-dominio por cámara eso descarta el
    // subdominio y manda a cualquiera a un host genérico. Acá se permite
    // cualquier URL cuyo host sea un dominio de cámara real o de superadmin
    // (nunca uno arbitrario, para no abrir un open-redirect).
    async redirect({ url }) {
      if (url.startsWith("/")) return url;
      try {
        const target = new URL(url);
        const isKnownHost =
          env.SUPERADMIN_HOSTS.includes(target.host) || (await getTenantByHost(target.host)) !== null;
        return isKnownHost ? url : "/";
      } catch {
        return "/";
      }
    },
  },
  events: {
    // Primer login en una cámara => crea la membership (student, sin
    // onboardear todavía). docs/02-arquitectura.md. Va en `events` (no en
    // `callbacks.signIn`) porque el provider de email dispara ese callback
    // también ANTES de mandar el link, con un `user` todavía no persistido:
    // insertar la membership ahí viola la FK a `users`. `events.signIn` solo
    // corre una vez que el usuario ya existe de verdad.
    async signIn({ user }) {
      const host = await getCurrentHost();
      if (!host || !user.id) return;

      const tenant = await getTenantByHost(host);
      if (!tenant) return;

      await db
        .insert(tenantMemberships)
        .values({ tenantId: tenant.id, userId: user.id })
        .onConflictDoNothing();
    },
  },
});
