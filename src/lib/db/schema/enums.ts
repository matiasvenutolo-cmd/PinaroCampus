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

export const courseLevel = pgEnum("course_level", ["inicial", "intermedio", "avanzado"]);

export const courseStatus = pgEnum("course_status", [
  "draft",
  "coming_soon",
  "published",
  "archived",
]);

export const lessonType = pgEnum("lesson_type", ["text", "video", "resource", "quiz", "exam"]);

export const assessmentKind = pgEnum("assessment_kind", ["quiz", "exam"]);

export const courseVisibility = pgEnum("course_visibility", ["public", "members_only", "hidden"]);

export const enrollmentSource = pgEnum("enrollment_source", [
  "purchase",
  "seat_code",
  "admin",
  "free",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "completed",
  "expired",
  "revoked",
]);

export const lessonProgressStatus = pgEnum("lesson_progress_status", ["started", "completed"]);

// ---- Comercial (Fase 4) ----

export const orderType = pgEnum("order_type", ["individual", "seat_pack"]);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "awaiting_payment",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);

export const pricingTier = pgEnum("pricing_tier", ["member", "non_member"]);

export const paymentProviderEnum = pgEnum("payment_provider", ["mock", "manual", "mercadopago"]);

export const paymentStatus = pgEnum("payment_status", [
  "created",
  "pending",
  "in_process",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
]);

export const seatCodeStatus = pgEnum("seat_code_status", ["available", "sent", "redeemed", "revoked"]);
