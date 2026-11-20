CREATE TABLE IF NOT EXISTS user_preferences (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  ready_emails boolean NOT NULL DEFAULT true,
  weekly_emails boolean NOT NULL DEFAULT false,
  prefer_high_quality boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
