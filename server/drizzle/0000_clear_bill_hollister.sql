CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(6) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"admin_token_hash" text NOT NULL,
	"sns_topic_arn" text,
	"qr_s3_key" text,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"creator_ip_hash" text,
	CONSTRAINT "channels_code_unique" UNIQUE("code")
);
