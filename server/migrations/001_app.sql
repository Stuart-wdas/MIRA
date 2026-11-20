CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  worker_job_id text UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  location text NOT NULL DEFAULT 'Location not added',
  quality text NOT NULL CHECK (quality IN ('quick', 'preview', 'balanced', 'high', 'maximum')),
  entitlement_type text NOT NULL CHECK (entitlement_type IN ('free', 'credit', 'development')),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'zar',
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'queued', 'processing', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 1 CHECK (progress BETWEEN 0 AND 100),
  stage text NOT NULL DEFAULT 'Uploading walkthrough',
  model_filename text,
  splat_count bigint,
  metrics jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS scans_user_created_idx ON scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_worker_job_idx ON scans(worker_job_id) WHERE worker_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS scan_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  quality text NOT NULL CHECK (quality IN ('quick', 'preview', 'balanced', 'high', 'maximum')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'consumed', 'refunded')),
  consumed_scan_id uuid REFERENCES scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_credits_available_idx ON scan_credits(user_id, quality, created_at)
  WHERE status = 'available';
