import type { PoolClient } from 'pg'
import { config, type Quality } from './config.js'
import { pool } from './database.js'
import { getQualityPrice } from './pricing.js'

export class PaymentRequiredError extends Error {
  status = 402
  constructor(public quality: Quality, public priceCents: number) {
    super('This account has used its free scan. Order a credit by EFT and wait for payment confirmation to continue.')
  }
}

export interface ScanAccess {
  allowed: boolean
  reason: 'development' | 'free' | 'credit' | 'payment_required'
  quality: Quality
  priceCents: number
  currency: string
  billingAvailable: boolean
}

async function accessWithClient(client: PoolClient, userId: string, quality: Quality): Promise<ScanAccess> {
  const priceCents = await getQualityPrice(client, quality)
  const base = {
    quality,
    priceCents,
    currency: config.BILLING_CURRENCY,
    billingAvailable: true,
  }
  if (config.devBypassPaywall) return { ...base, allowed: true, reason: 'development' }

  const [freeUse, credit] = await Promise.all([
    client.query(
      `SELECT 1 FROM scans
       WHERE user_id = $1 AND entitlement_type = 'free' AND status <> 'failed'
       LIMIT 1`,
      [userId],
    ),
    client.query(
      `SELECT 1 FROM scan_credits
       WHERE user_id = $1 AND quality = $2 AND status = 'available'
       LIMIT 1`,
      [userId, quality],
    ),
  ])
  if (!freeUse.rowCount) return { ...base, allowed: true, reason: 'free' }
  if (credit.rowCount) return { ...base, allowed: true, reason: 'credit' }
  return { ...base, allowed: false, reason: 'payment_required' }
}

export async function getScanAccess(userId: string, quality: Quality) {
  const client = await pool.connect()
  try {
    return await accessWithClient(client, userId, quality)
  } finally {
    client.release()
  }
}

export async function reserveScan(input: {
  userId: string
  quality: Quality
  name: string
  location: string
  source?: { key: string; filename: string; size: number }
  tuning?: { targetFrames: number; trainSteps: number; downscaleFactor: 1 | 2 | 4 | 8 }
}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.userId])
    const access = await accessWithClient(client, input.userId, input.quality)
    if (!access.allowed) throw new PaymentRequiredError(input.quality, access.priceCents)

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO scans
        (user_id, name, location, quality, entitlement_type, price_cents, currency,
         custom_tuning, target_frames, train_steps, downscale_factor, source_storage_key, source_filename, source_size, status, stage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'queued', 'Submitted - awaiting processing')
       RETURNING id`,
      [
        input.userId,
        input.name,
        input.location || 'Location not added',
        input.quality,
        access.reason,
        access.reason === 'credit' ? access.priceCents : 0,
        access.currency,
        Boolean(input.tuning),
        input.tuning?.targetFrames || null,
        input.tuning?.trainSteps || null,
        input.tuning?.downscaleFactor || null,
        input.source?.key || null,
        input.source?.filename || null,
        input.source?.size || null,
      ],
    )
    const scanId = inserted.rows[0]!.id

    if (access.reason === 'credit') {
      const consumed = await client.query(
        `UPDATE scan_credits SET status = 'consumed', consumed_scan_id = $1, updated_at = now()
         WHERE id = (
           SELECT id FROM scan_credits
           WHERE user_id = $2 AND quality = $3 AND status = 'available'
           ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
         ) RETURNING amount_cents, currency`,
        [scanId, input.userId, input.quality],
      )
      if (!consumed.rowCount) throw new PaymentRequiredError(input.quality, access.priceCents)
      await client.query('UPDATE scans SET price_cents = $2, currency = $3 WHERE id = $1',
        [scanId, consumed.rows[0].amount_cents, consumed.rows[0].currency])
    }

    await client.query('COMMIT')
    return { scanId, entitlement: access.reason }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function failScan(scanId: string, message: string, stage = 'Build failed') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const changed = await client.query(
      `UPDATE scans SET status = 'failed', stage = $2, error = $3, updated_at = now()
       WHERE id = $1 AND status IN ('uploading', 'queued', 'processing') RETURNING entitlement_type`,
      [scanId, stage, message],
    )
    if (changed.rowCount && changed.rows[0]?.entitlement_type === 'credit') {
      await client.query(
        `UPDATE scan_credits SET status = 'available', consumed_scan_id = NULL, updated_at = now()
         WHERE consumed_scan_id = $1 AND status = 'consumed'`,
        [scanId],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
