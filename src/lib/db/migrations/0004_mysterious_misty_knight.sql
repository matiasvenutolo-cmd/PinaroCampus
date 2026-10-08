CREATE TYPE "public"."order_status" AS ENUM('pending', 'awaiting_payment', 'paid', 'failed', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('individual', 'seat_pack');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('mock', 'manual', 'mercadopago');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."pricing_tier" AS ENUM('member', 'non_member');--> statement-breakpoint
CREATE TYPE "public"."seat_code_status" AS ENUM('available', 'sent', 'redeemed', 'revoked');--> statement-breakpoint
CREATE TABLE "order_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"tenant_course_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"course_title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"company_id" uuid,
	"number" text NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"pricing_tier" "pricing_tier" NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"subtotal_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"platform_fee_cents" bigint DEFAULT 0 NOT NULL,
	"collection_mode" "collection_mode" NOT NULL,
	"payment_provider" "payment_provider",
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_tenant_id_number_unique" UNIQUE("tenant_id","number")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"provider" "payment_provider" NOT NULL,
	"topic" text NOT NULL,
	"external_id" text,
	"payload" jsonb,
	"headers" jsonb,
	"signature_valid" boolean,
	"processed_at" timestamp with time zone,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"external_id" text,
	"external_reference" text NOT NULL,
	"preference_id" text,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"fee_cents" bigint DEFAULT 0 NOT NULL,
	"checkout_url" text,
	"marked_by_user_id" uuid,
	"manual_reference" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_external_id_unique" UNIQUE("provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "seat_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"tenant_course_id" uuid NOT NULL,
	"order_id" uuid,
	"company_id" uuid,
	"code" text NOT NULL,
	"status" "seat_code_status" DEFAULT 'available' NOT NULL,
	"sent_to_email" text,
	"sent_at" timestamp with time zone,
	"redeemed_by_user_id" uuid,
	"redeemed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seat_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "order_counters" ADD CONSTRAINT "order_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_course_id_tenant_courses_id_fk" FOREIGN KEY ("tenant_course_id") REFERENCES "public"."tenant_courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_marked_by_user_id_users_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_tenant_course_id_tenant_courses_id_fk" FOREIGN KEY ("tenant_course_id") REFERENCES "public"."tenant_courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_codes" ADD CONSTRAINT "seat_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_course_id_idx" ON "order_items" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_created_idx" ON "orders" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_tenant_buyer_idx" ON "orders" USING btree ("tenant_id","buyer_user_id");--> statement-breakpoint
CREATE INDEX "orders_company_id_idx" ON "orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payment_events_tenant_id_idx" ON "payment_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_id_idx" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "seat_codes_order_id_idx" ON "seat_codes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "seat_codes_tenant_status_idx" ON "seat_codes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "seat_codes_company_id_idx" ON "seat_codes" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_seat_code_id_seat_codes_id_fk" FOREIGN KEY ("seat_code_id") REFERENCES "public"."seat_codes"("id") ON DELETE set null ON UPDATE no action;