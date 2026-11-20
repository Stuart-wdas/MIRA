ALTER TABLE scans
  ADD COLUMN source_storage_key text,
  ADD COLUMN source_filename text,
  ADD COLUMN source_size bigint,
  ADD COLUMN model_storage_key text,
  ADD COLUMN credit_refunded_at timestamptz;

ALTER TABLE scan_credits DROP CONSTRAINT scan_credits_provider_check;
ALTER TABLE scan_credits ADD CONSTRAINT scan_credits_provider_check
  CHECK (provider IN ('paystack', 'stripe', 'manual', 'development', 'eft'));
ALTER TABLE scan_credits ALTER COLUMN provider SET DEFAULT 'eft';

-- Preserve credit changes, including consumption and return of the same credit.
CREATE TABLE credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL REFERENCES scan_credits(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  quality text NOT NULL,
  status text NOT NULL,
  previous_status text,
  scan_id uuid REFERENCES scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_events_user_idx ON credit_events(user_id, created_at DESC);
CREATE FUNCTION record_credit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO credit_events(credit_id, user_id, quality, status, scan_id)
    VALUES (NEW.id, NEW.user_id, NEW.quality, NEW.status, NEW.consumed_scan_id);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO credit_events(credit_id, user_id, quality, status, previous_status, scan_id)
    VALUES (NEW.id, NEW.user_id, NEW.quality, NEW.status, OLD.status,
      COALESCE(NEW.consumed_scan_id, OLD.consumed_scan_id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scan_credit_history AFTER INSERT OR UPDATE ON scan_credits
  FOR EACH ROW EXECUTE FUNCTION record_credit_event();
