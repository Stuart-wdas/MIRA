import { unlink } from 'node:fs/promises'
import { Router, type Request } from 'express'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { pool } from './database.js'
import { requireAdmin, requireAuth } from './middleware.js'
import { fileUpload, safeFilename, storagePath } from './storage.js'

export const fulfilmentRouter = Router()
fulfilmentRouter.use('/admin', requireAuth, requireAdmin)
const modelUpload = fileUpload(['ply', 'splat', 'ksplat', 'spz', 'sog'], 1.5 * 1024 ** 3)

async function audit(client: PoolClient, req: Request, action: string, targetType: string, targetId: string, metadata: object = {}) {
  await client.query(`INSERT INTO admin_audit_logs
    (actor_user_id, actor_email, action, target_type, target_id, metadata, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  [req.authSession!.user.id, req.authSession!.user.email, action, targetType, targetId, JSON.stringify(metadata), req.ip])
}

fulfilmentRouter.post('/admin/credits/:id/confirm-eft', async (req, res) => {
  const body = z.object({ bankReference: z.string().trim().min(1).max(200) }).safeParse(req.body)
  if (!body.success) { res.status(400).json({ error: 'Enter the bank transaction reference after verifying receipt of the full amount.' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // A bank transaction may fund only one order; a repeated confirmation cannot grant extra credits.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`eft:${body.data.bankReference}`])
    const duplicate = await client.query(`SELECT 1 FROM scan_credits WHERE provider = 'eft' AND provider_transaction_id = $1`, [body.data.bankReference])
    if (duplicate.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ error: 'This bank transaction has already been credited.' }); return }
    const result = await client.query(`UPDATE scan_credits SET status = 'available', payment_channel = 'eft',
      paid_at = now(), provider_transaction_id = $2, updated_at = now()
      WHERE id = $1 AND provider = 'eft' AND status = 'pending' RETURNING id, user_id, quality, amount_cents`,
    [req.params.id, body.data.bankReference])
    if (!result.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Only a pending EFT order can be confirmed.' }); return }
    await audit(client, req, 'eft.confirmed', 'credit', String(req.params.id), { ...result.rows[0], bankReference: body.data.bankReference })
    await client.query('COMMIT')
    res.json({ confirmed: true })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
})

fulfilmentRouter.get('/admin/scans/:id/source', async (req, res, next) => {
  const result = await pool.query('SELECT source_storage_key, source_filename FROM scans WHERE id = $1', [req.params.id])
  const scan = result.rows[0]
  if (!scan?.source_storage_key) { res.status(404).json({ error: 'Source video not available. Legacy uploads remain on the original worker.' }); return }
  res.setHeader('Cache-Control', 'private, no-store')
  res.download(storagePath(scan.source_storage_key), safeFilename(scan.source_filename), (error) => { if (error) next(error) })
})

fulfilmentRouter.get('/admin/scans/:id/model', async (req, res, next) => {
  const result = await pool.query('SELECT model_storage_key, model_filename FROM scans WHERE id = $1', [req.params.id])
  const scan = result.rows[0]
  if (!scan?.model_storage_key) { res.status(404).json({ error: 'Finished model not available.' }); return }
  res.setHeader('Cache-Control', 'private, no-store')
  res.download(storagePath(scan.model_storage_key), safeFilename(scan.model_filename), (error) => { if (error) next(error) })
})

fulfilmentRouter.patch('/admin/scans/:id/status', async (req, res) => {
  const body = z.object({ status: z.enum(['processing', 'failed']), reason: z.string().trim().max(1000).default('') }).safeParse(req.body)
  if (!body.success || (body.data.status === 'failed' && !body.data.reason)) { res.status(400).json({ error: 'Choose processing or failed, and give a customer-facing reason for a failure.' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(`UPDATE scans SET status = $2, stage = $3, error = $4, progress = $5, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL AND status IN ('queued', 'processing', 'uploading') RETURNING id`,
    [req.params.id, body.data.status, body.data.status === 'processing' ? 'Processing your space' : 'Processing failed', body.data.reason || null, body.data.status === 'processing' ? 50 : 0])
    if (!result.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Only an active order can be updated.' }); return }
    await audit(client, req, `scan.${body.data.status}`, 'scan', String(req.params.id), body.data)
    await client.query('COMMIT')
    res.json({ updated: true })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
})

fulfilmentRouter.post('/admin/scans/:id/refund-credit', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const scan = (await client.query(`SELECT status, entitlement_type, credit_refunded_at FROM scans WHERE id = $1 FOR UPDATE`, [req.params.id])).rows[0]
    if (!scan || scan.status !== 'failed' || scan.entitlement_type !== 'credit' || scan.credit_refunded_at) {
      await client.query('ROLLBACK'); res.status(409).json({ error: 'Only a failed paid order with an unreturned credit can be refunded.' }); return
    }
    const returned = await client.query(`UPDATE scan_credits SET status = 'available', consumed_scan_id = NULL, updated_at = now()
      WHERE consumed_scan_id = $1 AND status = 'consumed' RETURNING id`, [req.params.id])
    if (!returned.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ error: 'No consumed credit remains on this order.' }); return }
    await client.query('UPDATE scans SET credit_refunded_at = now(), updated_at = now() WHERE id = $1', [req.params.id])
    await audit(client, req, 'scan.credit_returned', 'scan', String(req.params.id), { creditId: returned.rows[0].id })
    await client.query('COMMIT')
    res.json({ refunded: true })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
})

fulfilmentRouter.post('/admin/scans/:id/model', modelUpload.single('model'), async (req, res) => {
  const file = req.file
  let retained = false
  try {
    if (!file?.size) { res.status(400).json({ error: 'Choose a non-empty PLY, SPLAT, KSPLAT, SPZ, or SOG file.' }); return }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Also permits importing a completed legacy model that was stored on the old worker.
      const changed = await client.query(`UPDATE scans SET model_storage_key = $2, model_filename = $3,
        status = 'completed', progress = 100, stage = 'Ready to explore', error = NULL, completed_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL AND credit_refunded_at IS NULL AND model_storage_key IS NULL
          AND status IN ('queued', 'processing', 'completed') RETURNING id, user_id`,
      [req.params.id, file.filename, safeFilename(file.originalname)])
      if (!changed.rowCount) { await client.query('ROLLBACK'); res.status(409).json({ error: 'This order is removed, failed, refunded, or already has a model.' }); return }
      await audit(client, req, 'scan.completed', 'scan', String(req.params.id), { filename: safeFilename(file.originalname), size: file.size })
      await client.query('COMMIT')
      retained = true
      res.json({ completed: true })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } finally { if (file && !retained) await unlink(file.path).catch(() => undefined) }
})
