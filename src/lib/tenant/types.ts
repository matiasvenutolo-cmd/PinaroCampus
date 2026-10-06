import { z } from "zod";

// Formas de los jsonb de `tenants` (docs/03-modelo-de-datos.md, docs/08-diseno-ui.md).
// "auto" en *Foreground se resuelve a blanco o casi-negro según contraste WCAG
// (ver src/lib/tenant/theme.ts) en vez de guardar un valor fijo.

export const tenantThemeSchema = z.object({
  primary: z.string().min(1),
  primaryForeground: z.union([z.literal("auto"), z.string()]).default("auto"),
  accent: z.string().min(1),
  accentForeground: z.union([z.literal("auto"), z.string()]).default("auto"),
  radius: z.number().min(0).max(32).default(12),
});
export type TenantTheme = z.infer<typeof tenantThemeSchema>;

export const tenantHomeContentSchema = z.object({
  heroTitle: z.string().optional(),
  heroSubtitle: z.string().optional(),
  heroCtaLabel: z.string().optional(),
  aboutText: z.string().optional(),
  companiesCtaText: z.string().optional(),
});
export type TenantHomeContent = z.infer<typeof tenantHomeContentSchema>;

export const tenantCertificateSignatorySchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  signatureUrl: z.string().url().nullable().default(null),
});

export const tenantCertificateConfigSchema = z.object({
  signatories: z.array(tenantCertificateSignatorySchema).max(3).default([]),
  footerText: z.string().optional(),
  showDni: z.boolean().default(true),
});
export type TenantCertificateConfig = z.infer<typeof tenantCertificateConfigSchema>;

export const defaultTenantTheme: TenantTheme = {
  primary: "#171717",
  primaryForeground: "auto",
  accent: "#F4F6F8",
  accentForeground: "auto",
  radius: 12,
};

export const defaultTenantHomeContent: TenantHomeContent = {};

export const defaultTenantCertificateConfig: TenantCertificateConfig = {
  signatories: [],
  showDni: true,
};
