CREATE TABLE IF NOT EXISTS scan_quality_prices (
  quality text PRIMARY KEY CHECK (quality IN ('quick', 'preview', 'balanced', 'high', 'maximum')),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  updated_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scan_credits
  DROP CONSTRAINT IF EXISTS scan_credits_provider_check,
  ADD CONSTRAINT scan_credits_provider_check
    CHECK (provider IN ('paystack', 'stripe', 'manual', 'development'));

