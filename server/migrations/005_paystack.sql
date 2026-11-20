ALTER TABLE scan_credits
  RENAME COLUMN stripe_checkout_session_id TO provider_reference;

ALTER TABLE scan_credits
  RENAME COLUMN stripe_payment_intent_id TO provider_transaction_id;

ALTER TABLE scan_credits
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_refund_id text,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_previous_status text,
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE scan_credits
SET provider = CASE
  WHEN provider_reference LIKE 'admin_grant:%' THEN 'manual'
  ELSE 'stripe'
END
WHERE provider IS NULL;

ALTER TABLE scan_credits
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN provider SET DEFAULT 'paystack';

ALTER TABLE scan_credits
  DROP CONSTRAINT IF EXISTS scan_credits_status_check,
  ADD CONSTRAINT scan_credits_status_check
    CHECK (status IN ('pending', 'available', 'consumed', 'refund_pending', 'refunded')),
  ADD CONSTRAINT scan_credits_provider_check
    CHECK (provider IN ('paystack', 'stripe', 'manual')),
  ADD CONSTRAINT scan_credits_refund_status_check
    CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processing', 'needs-attention', 'failed', 'processed')),
  ADD CONSTRAINT scan_credits_refund_previous_status_check
    CHECK (refund_previous_status IS NULL OR refund_previous_status IN ('available', 'consumed'));

CREATE INDEX IF NOT EXISTS scan_credits_provider_idx
  ON scan_credits(provider, provider_reference);
