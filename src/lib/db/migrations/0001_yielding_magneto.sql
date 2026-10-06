CREATE TYPE "public"."email_channel" AS ENUM('resend', 'console');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"channel" "email_channel" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_created_at_idx" ON "email_log" USING btree ("created_at");