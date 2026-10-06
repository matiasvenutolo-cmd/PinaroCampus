import { pgEnum } from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"]);

export const memberValidationMode = pgEnum("member_validation_mode", [
  "open",
  "cuit",
  "cuit_email_domain",
  "manual",
]);

export const collectionMode = pgEnum("collection_mode", [
  "tenant_account",
  "platform_account",
]);

export const membershipRole = pgEnum("membership_role", ["student", "tenant_admin"]);

export const memberStatus = pgEnum("member_status", [
  "none",
  "pending",
  "verified",
  "rejected",
]);

export const companySource = pgEnum("company_source", ["roster", "self_declared", "admin"]);
