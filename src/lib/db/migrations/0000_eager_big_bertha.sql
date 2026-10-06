CREATE TYPE "public"."collection_mode" AS ENUM('tenant_account', 'platform_account');--> statement-breakpoint
CREATE TYPE "public"."company_source" AS ENUM('roster', 'self_declared', 'admin');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('none', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."member_validation_mode" AS ENUM('open', 'cuit', 'cuit_email_domain', 'manual');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('student', 'tenant_admin');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"campus_name" text NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"contact_email" text NOT NULL,
	"website_url" text,
	"logo_url" text,
	"logo_on_dark_url" text,
	"favicon_url" text,
	"theme" jsonb DEFAULT '{"primary":"#171717","primaryForeground":"auto","accent":"#F4F6F8","accentForeground":"auto","radius":12}'::jsonb NOT NULL,
	"home_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"certificate_config" jsonb DEFAULT '{"signatories":[],"showDni":true}'::jsonb NOT NULL,
	"member_validation_mode" "member_validation_mode" DEFAULT 'open' NOT NULL,
	"collection_mode" "collection_mode" DEFAULT 'platform_account' NOT NULL,
	"platform_fee_bps" integer DEFAULT 0 NOT NULL,
	"payment_methods" text[] DEFAULT '{}' NOT NULL,
	"manual_payment_instructions" text,
	"manual_payment_expiry_days" integer DEFAULT 7 NOT NULL,
	"seat_pack_max" integer DEFAULT 200 NOT NULL,
	"legal_privacy_md" text,
	"legal_terms_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"first_name" text,
	"last_name" text,
	"dni" text,
	"phone" text,
	"is_superadmin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cuit" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"is_member" boolean DEFAULT false NOT NULL,
	"member_since" date,
	"email_domains" text[] DEFAULT '{}' NOT NULL,
	"source" "company_source" DEFAULT 'self_declared' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_tenant_id_cuit_unique" UNIQUE("tenant_id","cuit")
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'student' NOT NULL,
	"company_id" uuid,
	"job_title" text,
	"member_status" "member_status" DEFAULT 'none' NOT NULL,
	"member_reviewed_by" uuid,
	"member_reviewed_at" timestamp with time zone,
	"onboarded_at" timestamp with time zone,
	"accepted_terms_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_user_id_unique" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_id_slug_unique" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"data" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_unique" UNIQUE("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_member_reviewed_by_users_id_fk" FOREIGN KEY ("member_reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_id_idx" ON "tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_company_idx" ON "tenant_memberships" USING btree ("tenant_id","company_id");--> statement-breakpoint
CREATE INDEX "tenant_memberships_reviewed_by_idx" ON "tenant_memberships" USING btree ("member_reviewed_by");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_id_idx" ON "audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log" USING btree ("actor_user_id");