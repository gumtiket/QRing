CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"display_no" integer NOT NULL,
	"nickname" varchar(30),
	"delivery_method" varchar(20) DEFAULT 'WEBPUSH' NOT NULL,
	"endpoint_data" jsonb NOT NULL,
	"device_key" varchar(64) NOT NULL,
	"client_env" varchar(30),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_channel_status_idx" ON "subscriptions" USING btree ("channel_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_channel_device_unique" ON "subscriptions" USING btree ("channel_id","device_key");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_channel_display_no_unique" ON "subscriptions" USING btree ("channel_id","display_no");