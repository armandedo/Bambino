-- Integrity rules that the table definitions cannot express.
-- Hand-written; drizzle-kit does not manage functions or triggers.

-- 1. Append-only tables: history may be added to, never rewritten or removed.
CREATE FUNCTION bambino_forbid_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER garment_lifecycle_events_append_only
  BEFORE UPDATE OR DELETE ON garment_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER payment_transactions_append_only
  BEFORE UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER exchange_credits_append_only
  BEFORE UPDATE OR DELETE ON exchange_credits
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint
CREATE TRIGGER subscription_events_append_only
  BEFORE UPDATE OR DELETE ON subscription_events
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_modification();
--> statement-breakpoint

-- 2. Garments are never deleted; they leave circulation by reaching RETIRED.
CREATE FUNCTION bambino_forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER garments_no_delete
  BEFORE DELETE ON garments
  FOR EACH ROW EXECUTE FUNCTION bambino_forbid_delete();
