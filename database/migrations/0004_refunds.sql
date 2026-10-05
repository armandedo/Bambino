CREATE TYPE "public"."refund_method" AS ENUM('PROVIDER', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid,
	"user_id" uuid NOT NULL,
	"method" "refund_method" NOT NULL,
	"status" "refund_status" DEFAULT 'REQUESTED' NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_reference" text,
	"failure_code" text,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_key_uq" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_reference_uq" ON "refunds" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_processing_idx" ON "refunds" USING btree ("updated_at") WHERE "refunds"."status" = 'PROCESSING';--> statement-breakpoint
-- Hand-written: refunds are money records. They change status but are never deleted.
CREATE TRIGGER refunds_no_delete
  BEFORE DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_delete();
