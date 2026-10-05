CREATE TABLE "rate_limit_windows" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_windows_reset_idx" ON "rate_limit_windows" USING btree ("reset_at");