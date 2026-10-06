import "server-only";

import { Resend } from "resend";

import { db } from "@/lib/db";
import { emailLog } from "@/lib/db/schema";
import { env } from "@/env";

const resendClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface SendEmailInput {
  tenantId: string | null;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * docs/09-demo-y-seed.md: los destinatarios `*.demo` (y cualquier envío sin
 * RESEND_API_KEY configurada) se loguean en `email_log` en vez de salir de
 * verdad. El superadmin los ve en `/superadmin/salud`.
 */
export async function sendEmail({ tenantId, to, subject, html, text, replyTo }: SendEmailInput) {
  const isDemoRecipient = to.toLowerCase().endsWith(".demo");
  const shouldLogOnly = !resendClient || isDemoRecipient;

  if (shouldLogOnly) {
    console.log(`[email:console] to=${to} subject="${subject}"`);
    await db.insert(emailLog).values({ tenantId, toEmail: to, subject, html, channel: "console" });
    return;
  }

  await resendClient.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
    replyTo,
  });
  await db.insert(emailLog).values({ tenantId, toEmail: to, subject, html, channel: "resend" });
}
