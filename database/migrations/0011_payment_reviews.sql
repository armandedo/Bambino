ALTER TABLE "payments" ADD COLUMN "provider_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "unapplied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-written: payments that already ended before this migration are not re-checked with the provider.
UPDATE "payments" SET "provider_settled_at" = COALESCE("completed_at", "updated_at") WHERE "status" NOT IN ('INITIATED', 'PENDING');--> statement-breakpoint
DROP INDEX "payments_one_success_per_order_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success_per_order_uq" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'SUCCEEDED' AND NOT "payments"."unapplied";--> statement-breakpoint
CREATE INDEX "payments_watched_idx" ON "payments" USING btree ("initiated_at") WHERE "payments"."status" IN ('EXPIRED', 'CANCELLED', 'FAILED') AND "payments"."provider_settled_at" IS NULL AND "payments"."provider_reference" IS NOT NULL;--> statement-breakpoint
CREATE TABLE "payment_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid,
	"reason" text NOT NULL,
	"resolution" text,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reviews" ADD CONSTRAINT "payment_reviews_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reviews_payment_uq" ON "payment_reviews" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_reviews_open_idx" ON "payment_reviews" USING btree ("created_at") WHERE "payment_reviews"."resolved_at" IS NULL;--> statement-breakpoint
-- Hand-written: review cases are money records. They are resolved, never deleted.
CREATE TRIGGER payment_reviews_no_delete
  BEFORE DELETE ON payment_reviews
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_delete();
