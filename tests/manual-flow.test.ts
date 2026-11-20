import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

test('EFT and manual fulfilment work without a GPU, with isolated files and exactly-once credits', { timeout: 60000 }, async () => {
  process.env.NODE_ENV = 'test'
  const { pool } = await import('../server/database.js')
  const portFinder = createServer()
  await new Promise<void>((done) => portFinder.listen(0, '127.0.0.1', done))
  const port = (portFinder.address() as { port: number }).port
  await new Promise<void>((done) => portFinder.close(() => done()))
  const base = `http://127.0.0.1:${port}`
  const storage = await mkdtemp(join(tmpdir(), 'mira-manual-test-'))
  const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, API_PORT: String(port), APP_URL: base, ADMIN_APP_URL: base, ADMIN_EMAILS: '',
      DEV_BYPASS_PAYWALL: 'false', REQUIRE_EMAIL_VERIFICATION: 'false', STORAGE_DIRECTORY: storage,
      RECONSTRUCTION_WORKER_URL: 'http://127.0.0.1:1' },
    windowsHide: true, stdio: 'pipe',
  })
  let logs = ''
  server.stdout.on('data', (chunk) => { logs += String(chunk) })
  server.stderr.on('data', (chunk) => { logs += String(chunk) })
  const users: string[] = []
  const scanIds: string[] = []
  const creditIds: string[] = []
  const request = (cookie: string, path: string, method = 'GET', data?: object | FormData) => fetch(`${base}/api${path}`, {
    method, headers: { cookie, origin: base, ...(data && !(data instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  })
  const register = async () => {
    const response = await request('', '/auth/sign-up/email', 'POST', {
      name: 'Manual workflow test', email: `manual-${randomUUID()}@example.com`, password: 'Strong-manual-test-password-2026',
    })
    assert.equal(response.status, 200)
    const body = await response.json() as { user: { id: string } }
    users.push(body.user.id)
    return { id: body.user.id, cookie: response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ') }
  }
  const video = (quality = 'balanced', name = 'walkthrough.mp4') => {
    const form = new FormData()
    form.append('video', new Blob(['customer video']), name)
    form.append('name', 'Manual test space')
    form.append('build_mode', quality)
    return form
  }
  const submit = async (cookie: string) => {
    const response = await request(cookie, '/scans', 'POST', video())
    assert.equal(response.status, 202)
    const scan = await response.json() as { id: string; status: string }
    scanIds.push(scan.id)
    assert.equal(scan.status, 'queued')
    return scan.id
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      ready = await fetch(`${base}/api/health`).then((response) => response.ok).catch(() => false)
      if (ready) break
      await new Promise((done) => setTimeout(done, 100))
    }
    assert.ok(ready, logs)
    const owner = await register()
    const other = await register()
    const admin = await register()
    await pool.query("INSERT INTO user_access_controls(user_id, role) VALUES ($1, 'admin')", [admin.id])
    assert.equal((await request(owner.cookie, '/admin/scans')).status, 403)
    assert.equal((await request('', '/scans')).status, 401)
    const freeScan = await submit(owner.cookie)
    assert.equal((await request(owner.cookie, '/scans', 'POST', video())).status, 402)
    const ordered = await request(owner.cookie, '/billing/checkout', 'POST', { quality: 'balanced' })
    const order = await ordered.json() as { creditId: string; reference: string; mode: string }
    creditIds.push(order.creditId)
    assert.equal(order.mode, 'eft')
    const repeated = await (await request(owner.cookie, '/billing/checkout', 'POST', { quality: 'balanced' })).json() as typeof order
    assert.equal(repeated.creditId, order.creditId)
    assert.equal((await request(owner.cookie, '/scans', 'POST', video())).status, 402)
    assert.equal((await request(owner.cookie, `/admin/credits/${order.creditId}/confirm-eft`, 'POST', { bankReference: 'not-authorized' })).status, 403)
    const bankReference = randomUUID()
    const confirmations = await Promise.all([1, 2].map(() => request(admin.cookie, `/admin/credits/${order.creditId}/confirm-eft`, 'POST', { bankReference })))
    assert.deepEqual(confirmations.map((response) => response.status).sort(), [200, 409])
    assert.equal((await request(owner.cookie, '/scans', 'POST', video('balanced', 'invalid.exe'))).status, 400)
    const paidScan = await submit(owner.cookie)
    assert.equal((await request(owner.cookie, `/admin/scans/${paidScan}/source`)).status, 403)
    const source = await request(admin.cookie, `/admin/scans/${paidScan}/source`)
    assert.equal(await source.text(), 'customer video')
    assert.match(source.headers.get('content-disposition') || '', /walkthrough.mp4/)
    assert.equal((await request(other.cookie, `/scans/${paidScan}`)).status, 404)
    assert.equal((await request(admin.cookie, `/admin/scans/${paidScan}/status`, 'PATCH', { status: 'processing' })).status, 200)
    const model = new FormData()
    const modelBytes = new Uint8Array(32)
    model.append('model', new Blob([modelBytes]), 'scene.splat')
    assert.equal((await request(admin.cookie, `/admin/scans/${paidScan}/model`, 'POST', model)).status, 200)
    assert.equal((await request(admin.cookie, `/admin/scans/${paidScan}/model`, 'POST', model)).status, 409)
    assert.equal((await request(other.cookie, `/scans/${paidScan}/model`)).status, 404)
    const served = await request(owner.cookie, `/scans/${paidScan}/model`)
    assert.equal(served.status, 200)
    assert.deepEqual(new Uint8Array(await served.arrayBuffer()), modelBytes)
    assert.equal((await request(admin.cookie, `/admin/scans/${paidScan}/status`, 'PATCH', { status: 'failed', reason: 'Too late' })).status, 409)
    assert.equal((await request(admin.cookie, `/admin/scans/${paidScan}/refund-credit`, 'POST')).status, 409)

    const next = await (await request(owner.cookie, '/billing/checkout', 'POST', { quality: 'balanced' })).json() as typeof order
    creditIds.push(next.creditId)
    assert.equal((await request(admin.cookie, `/admin/credits/${next.creditId}/confirm-eft`, 'POST', { bankReference })).status, 409)
    assert.equal((await request(admin.cookie, `/admin/credits/${next.creditId}/confirm-eft`, 'POST', { bankReference: randomUUID() })).status, 200)
    // Concurrent submissions can spend the final available credit only once.
    const competing = await Promise.all([1, 2].map(() => request(owner.cookie, '/scans', 'POST', video())))
    assert.deepEqual(competing.map((response) => response.status).sort(), [202, 402])
    const failedId = (await competing.find((response) => response.status === 202)!.json() as { id: string }).id
    scanIds.push(failedId)
    assert.equal((await request(admin.cookie, `/admin/scans/${failedId}/status`, 'PATCH', { status: 'failed', reason: 'Insufficient coverage' })).status, 200)
    const refunds = await Promise.all([1, 2].map(() => request(admin.cookie, `/admin/scans/${failedId}/refund-credit`, 'POST')))
    assert.deepEqual(refunds.map((response) => response.status).sort(), [200, 409])
    assert.equal((await request(admin.cookie, `/admin/scans/${failedId}/model`, 'POST', model)).status, 409)
    const ledger = await pool.query("SELECT status, previous_status FROM credit_events WHERE credit_id = $1 ORDER BY created_at", [next.creditId])
    assert.deepEqual(ledger.rows.map((row) => row.status), ['pending', 'available', 'consumed', 'available'])
    assert.equal((await request(admin.cookie, `/admin/scans/${freeScan}/status`, 'PATCH', { status: 'failed', reason: 'Free attempt failed' })).status, 200)
    assert.equal((await (await request(owner.cookie, '/billing/quote/balanced')).json() as { reason: string }).reason, 'free')
    // Rejected uploads leave no extra files behind.
    assert.equal((await readdir(storage)).length, 4)
    assert.equal((await request(owner.cookie, '/billing/verify/legacy', 'POST')).status, 404)
  } finally {
    server.kill()
    await new Promise<void>((done) => { if (server.exitCode !== null) done(); else server.once('exit', () => done()) })
    await pool.query('DELETE FROM admin_audit_logs WHERE actor_user_id = ANY($1::text[]) OR target_id = ANY($2::text[])', [users, [...scanIds, ...creditIds]])
    await pool.query('DELETE FROM public."user" WHERE id = ANY($1::text[])', [users])
    await pool.end()
    assert.ok(resolve(storage).startsWith(resolve(tmpdir()) + sep))
    await rm(storage, { recursive: true, force: true })
  }
})
