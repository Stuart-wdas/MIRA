import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

test('free, payment-required, and paid-credit access are enforced in order', async () => {
  process.env.DEV_BYPASS_PAYWALL = 'false'
  process.env.NODE_ENV = 'test'
  const [{ pool }, { getScanAccess, reserveScan }] = await Promise.all([
    import('../server/database.js'),
    import('../server/entitlements.js'),
  ])
  const userId = randomUUID()
  const email = `entitlement-${userId}@example.com`
  try {
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Entitlement Test', $2, true, now(), now())`,
      [userId, email],
    )
    assert.equal((await getScanAccess(userId, 'high')).reason, 'free')

    const scan = await pool.query<{ id: string }>(
      `INSERT INTO scans (user_id, name, quality, entitlement_type, status, progress, stage)
       VALUES ($1, 'Free scan test', 'high', 'free', 'completed', 100, 'Ready to explore') RETURNING id`,
      [userId],
    )
    const paywalled = await getScanAccess(userId, 'high')
    assert.equal(paywalled.allowed, false)
    assert.equal(paywalled.reason, 'payment_required')

    await pool.query(
      `INSERT INTO scan_credits
        (user_id, quality, amount_cents, currency, provider, provider_reference, status)
       VALUES
         ($1, 'high', 12900, 'zar', 'paystack', $2, 'available'),
         ($1, 'maximum', 19900, 'zar', 'paystack', $3, 'available')`,
      [userId, `cs_test_high_${userId}`, `cs_test_maximum_${userId}`],
    )
    assert.equal((await getScanAccess(userId, 'high')).reason, 'credit')
    assert.equal((await getScanAccess(userId, 'balanced')).reason, 'payment_required')

    const reserved = await reserveScan({
      userId,
      quality: 'maximum',
      name: 'Long capture tuning test',
      location: '',
      tuning: { targetFrames: 1200, trainSteps: 2500, downscaleFactor: 4 },
    })
    assert.equal(reserved.entitlement, 'credit')
    const stored = await pool.query<{
      custom_tuning: boolean
      target_frames: number
      train_steps: number
      downscale_factor: number
    }>(
      `SELECT custom_tuning, target_frames, train_steps, downscale_factor
       FROM scans WHERE id = $1`,
      [reserved.scanId],
    )
    assert.deepEqual(stored.rows[0], {
      custom_tuning: true,
      target_frames: 1200,
      train_steps: 2500,
      downscale_factor: 4,
    })
    assert.ok(scan.rows[0]?.id)
  } finally {
    await pool.query('DELETE FROM public.user WHERE id = $1', [userId])
    await pool.end()
  }
})
