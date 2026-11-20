import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config, isQuality, type Quality } from './config.js'
import { pool } from './database.js'
import { getScanAccess } from './entitlements.js'
import { getQualityPrice, getQualityPricing } from './pricing.js'
import { requireAuth } from './middleware.js'
import {
  paystackConfigured,
  type PaystackTransaction,
  verifyPaystackSignature,
} from './paystack.js'

const checkoutLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false })

export const billingRouter = Router()

function transactionMetadata(transaction: PaystackTransaction) {
  if (!transaction.metadata) return null
  if (typeof transaction.metadata === 'object') return transaction.metadata
  try { return JSON.parse(transaction.metadata) as Record<string, unknown> }
  catch { return null }
}

export async function finalizeSuccessfulTransaction(transaction: PaystackTransaction, expectedUserId?: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pending = await client.query<{
      id: string
      user_id: string
      quality: Quality
      amount_cents: number
      currency: string
      status: string
    }>(
      `SELECT id, user_id, quality, amount_cents, currency, status
       FROM scan_credits
       WHERE provider = 'paystack' AND provider_reference = $1
       FOR UPDATE`,
      [transaction.reference],
    )
    const credit = pending.rows[0]
    if (!credit) throw new Error('No pending Mira payment matches this Paystack reference.')
    if (expectedUserId && credit.user_id !== expectedUserId) throw new Error('This payment belongs to a different account.')
    if (transaction.status !== 'success') throw new Error('Paystack has not marked this transaction successful.')
    if (Number(transaction.amount) !== credit.amount_cents) throw new Error('Paystack payment amount does not match the selected scan.')
    if (transaction.currency.toLowerCase() !== credit.currency.toLowerCase()) throw new Error('Paystack payment currency does not match the selected scan.')
    const metadata = transactionMetadata(transaction)
    if (metadata?.userId && metadata.userId !== credit.user_id) throw new Error('Paystack customer metadata does not match the Mira account.')
    if (metadata?.quality && metadata.quality !== credit.quality) throw new Error('Paystack quality metadata does not match the purchased scan.')

    await client.query(
      `UPDATE scan_credits SET
        status = CASE WHEN status IN ('consumed', 'refund_pending', 'refunded') THEN status ELSE 'available' END,
        provider_transaction_id = COALESCE($2, provider_transaction_id),
        payment_channel = COALESCE($3, payment_channel),
        paid_at = COALESCE($4, paid_at), updated_at = now()
       WHERE id = $1`,
      [credit.id, transaction.id === undefined ? null : String(transaction.id), transaction.channel || null,
        transaction.paid_at ? new Date(transaction.paid_at) : new Date()],
    )
    await client.query('COMMIT')
    return { creditId: credit.id, quality: credit.quality }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function updateRefund(event: string, data: Record<string, unknown>) {
  const reference = typeof data.transaction_reference === 'string'
    ? data.transaction_reference
    : typeof data.reference === 'string' ? data.reference : null
  if (!reference) return
  const status = event.replace('refund.', '')
  if (!['pending', 'processing', 'needs-attention', 'failed', 'processed'].includes(status)) return
  const refundReference = typeof data.refund_reference === 'string' ? data.refund_reference : null
  await pool.query(
    `UPDATE scan_credits SET
      status = CASE
        WHEN $2 = 'processed' THEN 'refunded'
        WHEN $2 = 'failed' THEN COALESCE(refund_previous_status, 'available')
        ELSE 'refund_pending'
      END,
      refund_status = $2,
      provider_refund_id = COALESCE($3, provider_refund_id),
      updated_at = now()
     WHERE provider = 'paystack' AND provider_reference = $1`,
    [reference, status, refundReference],
  )
}

billingRouter.get('/pricing', async (_req, res) => {
  res.json({
    currency: config.BILLING_CURRENCY,
    freeScans: 1,
    developmentBypass: config.devBypassPaywall,
    developmentPurchase: false,
    paymentProvider: 'eft',
    eftInstructions: config.EFT_INSTRUCTIONS,
    qualities: await getQualityPricing(),
  })
})

billingRouter.get('/billing/kiosk', requireAuth, async (req, res) => {
  const userId = req.authSession!.user.id
  const [pricing, credits, history, freeUse, events] = await Promise.all([
    getQualityPricing(),
    pool.query<{ quality: Quality; count: number }>(
      `SELECT quality, count(*)::int AS count
       FROM scan_credits
       WHERE user_id = $1 AND status = 'available'
       GROUP BY quality`,
      [userId],
    ),
    pool.query(
      `SELECT id, quality, amount_cents, currency, provider, status,
        provider_reference, payment_channel, paid_at, created_at
       FROM scan_credits
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 40`,
      [userId],
    ),
    pool.query(
      `SELECT 1 FROM scans
       WHERE user_id = $1 AND entitlement_type = 'free' AND status <> 'failed'
       LIMIT 1`,
      [userId],
    ),
    pool.query(`SELECT id, quality, status, previous_status, scan_id, created_at FROM credit_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]),
  ])
  const balances = new Map(credits.rows.map((row) => [row.quality, Number(row.count)]))
  res.json({
    currency: config.BILLING_CURRENCY,
    freeScanRemaining: freeUse.rowCount === 0,
    developmentMode: false,
    developmentBypass: config.devBypassPaywall,
    paymentProvider: 'eft',
    eftInstructions: config.EFT_INSTRUCTIONS,
    events: events.rows,
    qualities: pricing.map((quality) => ({ ...quality, availableTokens: balances.get(quality.id) || 0 })),
    history: history.rows,
  })
})

billingRouter.get('/billing/quote/:quality', requireAuth, async (req, res) => {
  if (!isQuality(req.params.quality)) {
    res.status(400).json({ error: 'Unknown quality level.' })
    return
  }
  res.json(await getScanAccess(req.authSession!.user.id, req.params.quality))
})

billingRouter.post('/billing/checkout', requireAuth, checkoutLimiter, async (req, res) => {
  const body = z.object({ quality: z.string() }).safeParse(req.body)
  if (!body.success || !isQuality(body.data.quality)) {
    res.status(400).json({ error: 'Choose a valid quality level.' })
    return
  }
  const quality = body.data.quality
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.authSession!.user.id])
    // Reuse an outstanding order so retries and double clicks cannot create duplicate requests.
    let order = (await client.query(`SELECT id, provider_reference, amount_cents FROM scan_credits
      WHERE user_id = $1 AND quality = $2 AND provider = 'eft' AND status = 'pending' ORDER BY created_at LIMIT 1`,
      [req.authSession!.user.id, quality])).rows[0]
    if (!order) {
      const price = await getQualityPrice(client, quality)
      order = (await client.query(`INSERT INTO scan_credits
        (user_id, quality, amount_cents, currency, provider, provider_reference, status)
        VALUES ($1, $2, $3, $4, 'eft', $5, 'pending') RETURNING id, provider_reference, amount_cents`,
        [req.authSession!.user.id, quality, price, config.BILLING_CURRENCY, `EFT-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`])).rows[0]
    }
    await client.query('COMMIT')
    res.status(201).json({ mode: 'eft', creditId: order.id, quality, reference: order.provider_reference,
      amountCents: order.amount_cents, currency: config.BILLING_CURRENCY, instructions: config.EFT_INSTRUCTIONS })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
})

export async function paystackWebhook(req: Request, res: Response) {
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
  if (!paystackConfigured) {
    res.status(503).send('Paystack is not configured.')
    return
  }
  if (!verifyPaystackSignature(payload, req.get('x-paystack-signature'))) {
    res.status(401).send('Invalid Paystack signature.')
    return
  }
  let event: { event?: string; data?: Record<string, unknown> }
  try { event = JSON.parse(payload.toString('utf8')) as typeof event }
  catch { res.status(400).send('Invalid Paystack webhook payload.'); return }

  if (event.event === 'charge.success' && event.data) {
    await finalizeSuccessfulTransaction(event.data as unknown as PaystackTransaction)
  } else if (event.event?.startsWith('refund.') && event.data) {
    await updateRefund(event.event, event.data)
  }
  res.json({ received: true })
}
