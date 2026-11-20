ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS custom_tuning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_frames integer CHECK (target_frames BETWEEN 60 AND 1200),
  ADD COLUMN IF NOT EXISTS train_steps integer CHECK (train_steps BETWEEN 1000 AND 15000),
  ADD COLUMN IF NOT EXISTS downscale_factor integer CHECK (downscale_factor IN (1, 2, 4, 8));
