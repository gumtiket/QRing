CREATE TABLE "deliveries" (
	"notification_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"http_status" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_notification_id_subscription_id_pk" PRIMARY KEY("notification_id","subscription_id")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;