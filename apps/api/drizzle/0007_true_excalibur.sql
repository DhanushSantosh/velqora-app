CREATE TYPE "public"."net_worth_account_type" AS ENUM('asset', 'liability');--> statement-breakpoint
CREATE TABLE "net_worth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"account_type" "net_worth_account_type" NOT NULL,
	"subtype" varchar(40) NOT NULL,
	"balance" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "net_worth_accounts" ADD CONSTRAINT "net_worth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "net_worth_accounts_user_idx" ON "net_worth_accounts" USING btree ("user_id","updated_at");