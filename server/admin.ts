import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { config, isQuality, qualityOrder } from './config.js'
import { pool } from './database.js'
import { requireAdmin, requireAuth } from './middleware.js'
import { getQualityPricing, replaceQualityPricing } from './pricing.js'

export const adminRouter = Router()

adminRouter.use('/admin', requireAuth, requireAdmin)

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(''),
})

function paging(query: Request['query']) {
  const parsed = pagingSchema.safeParse(query)
  return parsed.success ? parsed.data : null
}

function actor(req: Request) {
  return req.authSession!.user
}

async function audit(
  req: Request,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  const user = actor(req)
  await pool.query(
    `INSERT INTO admin_audit_logs
      (actor_user_id, actor_email, action, target_type, target_id, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, user.email, action, targetType, targetId, JSON.stringify(metadata), req.ip || null],
  )
}

function asNumber(value: unknown) {
  return Number(value || 0)
}

adminRouter.get('/admin/me', (req, res) => {
  res.json({
    id: actor(req).id,
    name: actor(req).name,
    email: actor(req).email,
    role: req.accessControl!.role,
  })
})

const pricingUpdateSchema = z.object({
  prices: z.object({
    quick: z.number().int().min(0).max(100_000_000),
    preview: z.number().int().min(0).max(100_000_000),
    balanced: z.number().int().min(0).max(100_000_000),
    high: z.number().int().min(0).max(100_000_000),
    maximum: z.number().int().min(0).max(100_000_000),
  }),
})

adminRouter.get('/admin/pricing', async (_req, res) => {
  res.json({
    currency: config.BILLING_CURRENCY,
    qualities: await getQualityPricing(),
  })
})

adminRouter.put('/admin/pricing', async (req, res) => {
  const body = pricingUpdateSchema.safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Enter a valid non-negative price for every quality level.' })
    return
  }
  const before = await getQualityPricing()
  const client = await pool.connect()
  let qualities
  try {
    await client.query('BEGIN')
    qualities = await replaceQualityPricing(client, body.data.prices, actor(req).id)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  await audit(req, 'pricing.updated', 'billing', 'quality-prices', {
    before: Object.fromEntries(before.map((item) => [item.id, item.priceCents])),
    after: body.data.prices,
    currency: config.BILLING_CURRENCY,
  })
  res.json({ currency: config.BILLING_CURRENCY, qualities })
})

adminRouter.get('/admin/overview', async (_req, res) => {
  const [users, scans, payments, daily, recentUsers, recentScans] = await Promise.all([
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE u."createdAt" >= now() - interval '30 days')::int AS new_last_30_days,
        count(*) FILTER (WHERE COALESCE(a.status, 'active') = 'suspended')::int AS suspended,
        count(*) FILTER (WHERE COALESCE(a.role, 'customer') = 'admin')::int AS administrators
      FROM public."user" u
      LEFT JOIN user_access_controls a ON a.user_id = u.id
    `),
    pool.query(`
      SELECT
        count(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
        count(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL)::int AS completed,
        count(*) FILTER (WHERE status IN ('uploading', 'queued', 'processing') AND deleted_at IS NULL)::int AS processing,
        count(*) FILTER (WHERE status = 'failed' AND deleted_at IS NULL)::int AS failed,
        count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS removed
      FROM scans
    `),
    pool.query(`
      SELECT
        count(*) FILTER (WHERE status IN ('available', 'consumed'))::int AS successful,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'refunded')::int AS refunded,
        COALESCE(sum(amount_cents) FILTER (WHERE status IN ('available', 'consumed')), 0)::bigint AS collected_cents,
        COALESCE(sum(amount_cents) FILTER (WHERE status = 'refunded'), 0)::bigint AS refunded_cents
      FROM scan_credits
      WHERE provider NOT IN ('manual', 'development')
    `),
    pool.query(`
      WITH days AS (
        SELECT generate_series(current_date - 13, current_date, interval '1 day')::date AS day
      )
      SELECT days.day,
        count(DISTINCT s.id)::int AS scans,
        count(DISTINCT u.id)::int AS users
      FROM days
      LEFT JOIN scans s ON s.created_at::date = days.day AND s.deleted_at IS NULL
      LEFT JOIN public."user" u ON u."createdAt"::date = days.day
      GROUP BY days.day ORDER BY days.day
    `),
    pool.query(`
      SELECT id, name, email, "createdAt" AS created_at
      FROM public."user" ORDER BY "createdAt" DESC LIMIT 5
    `),
    pool.query(`
      SELECT s.id, s.name, s.status, s.quality, s.progress, s.created_at,
        u.name AS customer_name, u.email AS customer_email
      FROM scans s JOIN public."user" u ON u.id = s.user_id
      WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 8
    `),
  ])
  const paymentRow = payments.rows[0]
  res.json({
    users: users.rows[0],
    scans: scans.rows[0],
    payments: {
      ...paymentRow,
      collected_cents: asNumber(paymentRow.collected_cents),
      refunded_cents: asNumber(paymentRow.refunded_cents),
      currency: config.BILLING_CURRENCY,
    },
    daily: daily.rows,
    recentUsers: recentUsers.rows,
    recentScans: recentScans.rows,
    processingMode: 'manual',
    developmentBypass: config.devBypassPaywall,
  })
})

adminRouter.get('/admin/users', async (req, res) => {
  const page = paging(req.query)
  const filters = z.object({
    status: z.enum(['all', 'active', 'suspended']).default('all'),
    role: z.enum(['all', 'customer', 'admin']).default('all'),
  }).safeParse(req.query)
  if (!page || !filters.success) {
    res.status(400).json({ error: 'Invalid customer filters.' })
    return
  }
  const offset = (page.page - 1) * page.limit
  const result = await pool.query(
    `SELECT
      u.id, u.name, u.email, u."emailVerified" AS email_verified,
      u."createdAt" AS created_at, u."updatedAt" AS updated_at,
      COALESCE(a.role, 'customer') AS role,
      COALESCE(a.status, 'active') AS status,
      COALESCE(a.admin_notes, '') AS admin_notes,
      COALESCE(s.total, 0)::int AS scans_total,
      COALESCE(s.completed, 0)::int AS scans_completed,
      COALESCE(s.processing, 0)::int AS scans_processing,
      COALESCE(c.available, 0)::int AS available_credits,
      COALESCE(c.paid_cents, 0)::bigint AS paid_cents,
      count(*) OVER()::int AS result_count
     FROM public."user" u
     LEFT JOIN user_access_controls a ON a.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS total,
         count(*) FILTER (WHERE status = 'completed' AND deleted_at IS NULL) AS completed,
         count(*) FILTER (WHERE status IN ('uploading', 'queued', 'processing') AND deleted_at IS NULL) AS processing
       FROM scans WHERE user_id = u.id
     ) s ON true
     LEFT JOIN LATERAL (
       SELECT count(*) FILTER (WHERE status = 'available') AS available,
         COALESCE(sum(amount_cents) FILTER (WHERE status IN ('available', 'consumed')), 0) AS paid_cents
       FROM scan_credits WHERE user_id = u.id
     ) c ON true
     WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       AND ($2 = 'all' OR COALESCE(a.status, 'active') = $2)
       AND ($3 = 'all' OR COALESCE(a.role, 'customer') = $3)
     ORDER BY u."createdAt" DESC
     LIMIT $4 OFFSET $5`,
    [page.search, filters.data.status, filters.data.role, page.limit, offset],
  )
  const total = asNumber(result.rows[0]?.result_count)
  res.json({
    items: result.rows.map(({ result_count, paid_cents, ...row }) => {
      void result_count
      return { ...row, paid_cents: asNumber(paid_cents) }
    }),
    page: page.page,
    limit: page.limit,
    total,
    pages: Math.max(1, Math.ceil(total / page.limit)),
  })
})

adminRouter.get('/admin/users/:id', async (req, res) => {
  const userId = String(req.params.id)
  const [profile, scans, credits, sessions, preferences] = await Promise.all([
    pool.query(
      `SELECT u.id, u.name, u.email, u."emailVerified" AS email_verified,
        u."createdAt" AS created_at, u."updatedAt" AS updated_at,
        COALESCE(a.role, 'customer') AS role, COALESCE(a.status, 'active') AS status,
        COALESCE(a.admin_notes, '') AS admin_notes
       FROM public."user" u LEFT JOIN user_access_controls a ON a.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT id, name, location, quality, status, progress, stage, entitlement_type,
        price_cents, currency, error, created_at, completed_at, deleted_at,
        custom_tuning, target_frames, train_steps, downscale_factor
       FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    ),
    pool.query(
      `SELECT id, quality, amount_cents, currency, status, provider, provider_reference,
        provider_transaction_id, provider_refund_id, refund_status, payment_channel,
        paid_at, consumed_scan_id, created_at, updated_at,
        (provider = 'manual') AS manual,
        (provider = 'development') AS development
       FROM scan_credits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    ),
    pool.query(`SELECT count(*)::int AS count FROM public."session" WHERE "userId" = $1`, [userId]),
    pool.query(
      `SELECT ready_emails, weekly_emails, prefer_high_quality
       FROM user_preferences WHERE user_id = $1`,
      [userId],
    ),
  ])
  if (!profile.rowCount) {
    res.status(404).json({ error: 'Customer not found.' })
    return
  }
  res.json({
    profile: profile.rows[0],
    sessions: sessions.rows[0]?.count || 0,
    preferences: preferences.rows[0] || null,
    scans: scans.rows,
    credits: credits.rows,
  })
})

adminRouter.patch('/admin/users/:id/access', async (req, res) => {
  const userId = String(req.params.id)
  const body = z.object({
    role: z.enum(['customer', 'admin']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    adminNotes: z.string().trim().max(2000).optional(),
  }).refine((value) => Object.values(value).some((item) => item !== undefined)).safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Choose a valid role, status, or support note.' })
    return
  }
  if (userId === actor(req).id && (body.data.status === 'suspended' || body.data.role === 'customer')) {
    res.status(409).json({ error: 'You cannot suspend or remove your own administrator access.' })
    return
  }
  const existing = await pool.query(
    `SELECT u.email, COALESCE(a.role, 'customer') AS role, COALESCE(a.status, 'active') AS status,
      COALESCE(a.admin_notes, '') AS admin_notes
     FROM public."user" u LEFT JOIN user_access_controls a ON a.user_id = u.id WHERE u.id = $1`,
    [userId],
  )
  if (!existing.rowCount) {
    res.status(404).json({ error: 'Customer not found.' })
    return
  }
  const previous = existing.rows[0]
  const updated = await pool.query(
    `INSERT INTO user_access_controls(user_id, role, status, admin_notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       role = EXCLUDED.role, status = EXCLUDED.status,
       admin_notes = EXCLUDED.admin_notes, updated_at = now()
     RETURNING role, status, admin_notes, updated_at`,
    [userId, body.data.role || previous.role, body.data.status || previous.status,
      body.data.adminNotes === undefined ? previous.admin_notes : body.data.adminNotes],
  )
  if (body.data.status === 'suspended') {
    await pool.query(`DELETE FROM public."session" WHERE "userId" = $1`, [userId])
  }
  await audit(req, 'user.access_updated', 'user', userId, { before: previous, after: updated.rows[0] })
  res.json(updated.rows[0])
})

adminRouter.post('/admin/users/:id/credits', async (req, res) => {
  const userId = String(req.params.id)
  const body = z.object({
    quality: z.string().refine(isQuality),
    quantity: z.number().int().min(1).max(20).default(1),
    note: z.string().trim().max(500).default(''),
  }).safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Choose a quality and a quantity between 1 and 20.' })
    return
  }
  const exists = await pool.query('SELECT email FROM public."user" WHERE id = $1', [userId])
  if (!exists.rowCount) {
    res.status(404).json({ error: 'Customer not found.' })
    return
  }
  const ids: string[] = []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (let index = 0; index < body.data.quantity; index += 1) {
      const reference = `admin_grant:${randomUUID()}`
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO scan_credits
          (user_id, quality, amount_cents, currency, provider, provider_reference, status)
         VALUES ($1, $2, 0, $3, 'manual', $4, 'available') RETURNING id`,
        [userId, body.data.quality, config.BILLING_CURRENCY, reference],
      )
      ids.push(inserted.rows[0]!.id)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  await audit(req, 'credit.granted', 'user', userId, { quality: body.data.quality, quantity: body.data.quantity, note: body.data.note, creditIds: ids })
  res.status(201).json({ granted: ids.length, ids })
})

adminRouter.delete('/admin/credits/:id', async (req, res) => {
  const creditId = String(req.params.id)
  const result = await pool.query(
    `UPDATE scan_credits SET status = 'refunded', updated_at = now()
     WHERE id = $1 AND status = 'available' AND provider = 'manual'
     RETURNING id, user_id, quality`,
    [creditId],
  )
  if (!result.rowCount) {
    res.status(409).json({ error: 'Only an unused manually granted credit can be revoked.' })
    return
  }
  await audit(req, 'credit.revoked', 'credit', creditId, result.rows[0])
  res.status(204).end()
})

adminRouter.get('/admin/scans', async (req, res) => {
  const page = paging(req.query)
  const filters = z.object({
    status: z.enum(['all', 'uploading', 'queued', 'processing', 'completed', 'failed', 'removed']).default('all'),
    quality: z.enum(['all', ...qualityOrder] as [string, ...string[]]).default('all'),
  }).safeParse(req.query)
  if (!page || !filters.success) {
    res.status(400).json({ error: 'Invalid scan filters.' })
    return
  }
  const result = await pool.query(
    `SELECT s.id, s.user_id, s.worker_job_id, s.name, s.location, s.quality,
      s.entitlement_type, s.price_cents, s.currency, s.status, s.progress, s.stage,
      s.source_filename, s.source_size, s.credit_refunded_at, (s.model_storage_key IS NOT NULL) AS has_model,
      s.splat_count, s.error, s.created_at, s.updated_at, s.completed_at, s.deleted_at,
      s.custom_tuning, s.target_frames, s.train_steps, s.downscale_factor,
      u.name AS customer_name, u.email AS customer_email,
      count(*) OVER()::int AS result_count
     FROM scans s JOIN public."user" u ON u.id = s.user_id
     WHERE ($1 = '' OR s.name ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
       AND ($2 = 'all' OR ($2 = 'removed' AND s.deleted_at IS NOT NULL) OR ($2 <> 'removed' AND s.status = $2 AND s.deleted_at IS NULL))
       AND ($3 = 'all' OR s.quality = $3)
       AND ($2 = 'removed' OR s.deleted_at IS NULL)
     ORDER BY s.created_at DESC LIMIT $4 OFFSET $5`,
    [page.search, filters.data.status, filters.data.quality, page.limit, (page.page - 1) * page.limit],
  )
  const total = asNumber(result.rows[0]?.result_count)
  res.json({
    items: result.rows.map(({ result_count, ...row }) => {
      void result_count
      return row
    }),
    page: page.page,
    limit: page.limit,
    total,
    pages: Math.max(1, Math.ceil(total / page.limit)),
  })
})

adminRouter.patch('/admin/scans/:id/visibility', async (req, res) => {
  const scanId = String(req.params.id)
  const body = z.object({ removed: z.boolean() }).safeParse(req.body)
  if (!body.success) {
    res.status(400).json({ error: 'Choose whether the scan should be removed or restored.' })
    return
  }
  const result = await pool.query(
    `UPDATE scans SET deleted_at = $2, updated_at = now() WHERE id = $1
     RETURNING id, user_id, name, deleted_at`,
    [scanId, body.data.removed ? new Date() : null],
  )
  if (!result.rowCount) {
    res.status(404).json({ error: 'Scan not found.' })
    return
  }
  await audit(req, body.data.removed ? 'scan.removed' : 'scan.restored', 'scan', scanId, result.rows[0])
  res.json(result.rows[0])
})

adminRouter.get('/admin/payments', async (req, res) => {
  const page = paging(req.query)
  const filters = z.object({
    status: z.enum(['all', 'pending', 'available', 'consumed', 'refund_pending', 'refunded']).default('all'),
  }).safeParse(req.query)
  if (!page || !filters.success) {
    res.status(400).json({ error: 'Invalid payment filters.' })
    return
  }
  const result = await pool.query(
    `SELECT c.id, c.user_id, c.quality, c.amount_cents, c.currency, c.status,
      c.provider, c.provider_reference, c.provider_transaction_id, c.provider_refund_id,
      c.refund_status, c.payment_channel, c.paid_at, c.consumed_scan_id,
      c.created_at, c.updated_at, u.name AS customer_name, u.email AS customer_email,
      (c.provider = 'manual') AS manual,
      (c.provider = 'development') AS development,
      count(*) OVER()::int AS result_count
     FROM scan_credits c JOIN public."user" u ON u.id = c.user_id
     WHERE ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR c.provider_reference ILIKE '%' || $1 || '%')
       AND ($2 = 'all' OR c.status = $2)
     ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
    [page.search, filters.data.status, page.limit, (page.page - 1) * page.limit],
  )
  const total = asNumber(result.rows[0]?.result_count)
  res.json({
    items: result.rows.map(({ result_count, ...row }) => {
      void result_count
      return row
    }),
    page: page.page,
    limit: page.limit,
    total,
    pages: Math.max(1, Math.ceil(total / page.limit)),
  })
})

adminRouter.get('/admin/audit', async (req, res) => {
  const page = paging(req.query)
  if (!page) {
    res.status(400).json({ error: 'Invalid audit filters.' })
    return
  }
  const result = await pool.query(
    `SELECT id, actor_user_id, actor_email, action, target_type, target_id,
      metadata, ip_address, created_at, count(*) OVER()::int AS result_count
     FROM admin_audit_logs
     WHERE ($1 = '' OR actor_email ILIKE '%' || $1 || '%' OR action ILIKE '%' || $1 || '%' OR target_id ILIKE '%' || $1 || '%')
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [page.search, page.limit, (page.page - 1) * page.limit],
  )
  const total = asNumber(result.rows[0]?.result_count)
  res.json({
    items: result.rows.map(({ result_count, ...row }) => {
      void result_count
      return row
    }),
    page: page.page,
    limit: page.limit,
    total,
    pages: Math.max(1, Math.ceil(total / page.limit)),
  })
})
