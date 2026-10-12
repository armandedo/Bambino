ALTER TYPE "public"."order_status" ADD VALUE 'CONFIRMED' BEFORE 'PAID';--> statement-breakpoint
ALTER TYPE "public"."payment_provider" ADD VALUE 'CASH_ON_DELIVERY';