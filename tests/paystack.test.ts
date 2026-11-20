import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import test from 'node:test'

test('Paystack signatures and paid transaction values are verified before granting credit', async () => {
  process.env.NODE_ENV = 'test'
  const secret = 'sk_test_mira_signature_secret'
  const payload = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'mira-test' } }))
  const signature = createHmac('sha512', secret).update(payload).digest('hex')
  const [{ verifyPaystackSignature }, { finalizeSuccessfulTransaction }, { pool }] = await Promise.all([
    import('../server/paystack.js'),
    import('../server/billing.js'),
    import('../server/database.js'),
  ])
  assert.equal(verifyPaystackSignature(payload, signature, secret), true)
  assert.equal(verifyPaystackSignature(Buffer.from('{}'), signature, secret), false)
  assert.equal(verifyPaystackSignature(payload, undefined, secret), false)

  const userId = randomUUID()
  const reference = `mira-${randomUUID()}`
  try {
    await pool.query(
      `INSERT INTO public."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Paystack Test', $2, true, now(), now())`,
      [userId, `paystack-${userId}@example.com`],
    )
    await pool.query(
      `INSERT INTO scan_credits
        (user_id, quality, amount_cents, currency, provider, provider_reference, status)
       VALUES ($1, 'balanced', 7900, 'zar', 'paystack', $2, 'pending')`,
      [userId, reference],
    )

    await assert.rejects(
      finalizeSuccessfulTransaction({ status: 'success', reference, amount: 7800, currency: 'ZAR' }, userId),
      /amount does not match/,
    )
    const pending = await pool.query(`SELECT status FROM scan_credits WHERE provider_reference = $1`, [reference])
    assert.equal(pending.rows[0]?.status, 'pending')

    await finalizeSuccessfulTransaction({
      id: '4099260516',
      status: 'success',
      reference,
      amount: 7900,
      currency: 'ZAR',
      channel: 'card',
      paid_at: '2026-09-02T10:00:00.000Z',
      metadata: { userId, quality: 'balanced' },
    }, userId)
    const available = await pool.query(
      `SELECT status, provider_transaction_id, payment_channel, paid_at
       FROM scan_credits WHERE provider_reference = $1`,
      [reference],
    )
    assert.equal(available.rows[0]?.status, 'available')
    assert.equal(available.rows[0]?.provider_transaction_id, '4099260516')
    assert.equal(available.rows[0]?.payment_channel, 'card')
    assert.ok(available.rows[0]?.paid_at)
  } finally {
    await pool.query('DELETE FROM public."user" WHERE id = $1', [userId])
    await pool.end()
  }
})
