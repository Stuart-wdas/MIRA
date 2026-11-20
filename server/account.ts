import { Router } from 'express'
import { z } from 'zod'
import { config } from './config.js'
import { pool } from './database.js'
import { requireAuth } from './middleware.js'

export const accountRouter = Router()

accountRouter.use('/account', requireAuth)

accountRouter.get('/account/summary', async (req, res) => {
  const result = await pool.query(
    `SELECT
      count(*) FILTER (WHERE status <> 'failed')::int AS scans_created,
      count(*) FILTER (WHERE status = 'completed')::int AS scans_completed,
      count(*) FILTER (WHERE status IN ('uploading', 'queued', 'processing'))::int AS scans_processing
     FROM scans WHERE user_id = $1 AND deleted_at IS NULL`,
    [req.authSession!.user.id],
  )
  const credits = await pool.query(
    `SELECT quality, count(*)::int AS count FROM scan_credits
     WHERE user_id = $1 AND status = 'available' GROUP BY quality`,
    [req.authSession!.user.id],
  )
  res.json({ ...result.rows[0], credits: credits.rows, developmentBypass: config.devBypassPaywall })
})

accountRouter.get('/account/preferences', async (req, res) => {
  const result = await pool.query(
    `INSERT INTO user_preferences(user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING ready_emails, weekly_emails, prefer_high_quality`,
    [req.authSession!.user.id],
  )
  res.json(result.rows[0])
})

accountRouter.put('/account/preferences', async (req, res) => {
  const body = z.object({
    readyEmails: z.boolean(),
    weeklyEmails: z.boolean(),
    preferHighQuality: z.boolean(),
  }).safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Invalid account preferences.' })
    return
  }
  const result = await pool.query(
    `INSERT INTO user_preferences(user_id, ready_emails, weekly_emails, prefer_high_quality)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       ready_emails = EXCLUDED.ready_emails,
       weekly_emails = EXCLUDED.weekly_emails,
       prefer_high_quality = EXCLUDED.prefer_high_quality,
       updated_at = now()
     RETURNING ready_emails, weekly_emails, prefer_high_quality`,
    [req.authSession!.user.id, body.data.readyEmails, body.data.weeklyEmails, body.data.preferHighQuality],
  )
  res.json(result.rows[0])
})
