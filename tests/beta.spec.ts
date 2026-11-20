import { expect, test } from '@playwright/test'

test('local beta uploads a job, renders evolving snapshots and retains the scene after an error', async ({ page }, info) => {
  const id = 'a'.repeat(32)
  let revision = 0
  let stage = 'Finding camera positions'
  let status = 'processing'
  let snapshots = false
  let unavailable = false
  const fetched: number[] = []
  const splat = Buffer.alloc(32)
  splat.writeFloatLE(.3, 12); splat.writeFloatLE(.3, 16); splat.writeFloatLE(.3, 20)
  splat.fill(255, 24, 29); splat.fill(128, 29, 32)
  const job = () => ({ id, name: 'Beta apartment', status, stage, progress: status === 'completed' ? 100 : 50, live_preview: true,
    metrics: { training_iteration: revision, training_iterations: 2500, gaussian_count: snapshots ? 1 : null, psnr: snapshots ? 0 : null, elapsed_seconds: snapshots ? 120 : null } })
  await page.route('**/health', (route) => route.fulfill({ json: { live_preview: { enabled: true } } }))
  await page.route('**/v1/**', async (route) => {
    if (route.request().headers()['x-mira-worker-token'] !== 'test-token') { await route.fulfill({ status: 401, json: { detail: 'Unauthorized' } }); return }
    const path = new URL(route.request().url()).pathname
    if (path === '/v1/reconstructions') {
      if (route.request().method() === 'POST') {
        expect(route.request().postData()).toContain('name="live_preview"')
        await route.fulfill({ status: 202, json: job() })
      } else await route.fulfill({ json: { jobs: [job()] } })
    } else if (path.endsWith('/preview')) {
      await route.fulfill({ json: { available: snapshots, revision, step: revision, splats: 1, total_splats: 1 } })
    } else if (path.includes('/preview/')) {
      if (unavailable) { await route.fulfill({ status: 503, json: { detail: 'Snapshot temporarily unavailable' } }); return }
      fetched.push(revision)
      await route.fulfill({ body: splat, contentType: 'application/octet-stream' })
    } else await route.fulfill({ json: job() })
  })
  await page.goto('/beta/')
  await page.getByRole('button', { name: 'Connect & load jobs' }).click()
  await expect(page.getByRole('alert')).toContainText('Worker token not accepted')
  await page.getByLabel('Worker token', { exact: true }).fill('test-token')
  await page.getByRole('button', { name: 'Connect & load jobs' }).click()
  await expect(page.getByText('Local worker connected')).toBeVisible()
  await page.getByLabel('Walkthrough video').setInputFiles({ name: 'beta.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') })
  await page.getByLabel('Space name or order ID').fill('Beta apartment')
  await page.getByRole('button', { name: 'Build with live preview' }).click()
  await expect(page.locator('#stage')).toHaveText('Finding camera positions')
  await expect(page.locator('#empty')).toBeVisible()
  await expect(page.locator('#gaussians')).toHaveText('—')
  await expect(page.locator('#psnr')).toHaveText('—')
  await expect(page.locator('#elapsed')).toHaveText('—')
  await expect(page.getByRole('alert')).toBeHidden()
  snapshots = true; stage = 'Training Gaussian scene'
  await expect(page.locator('#scene-notice')).toContainText('step 0', { timeout: 15000 })
  await expect(page.locator('#empty')).toBeHidden()
  await expect(page.locator('#gaussians')).toHaveText('1')
  await expect(page.locator('#psnr')).toHaveText('0.00')
  await page.getByLabel('Live updates').uncheck()
  revision = 250; stage = 'Training continues while preview is paused'
  await expect(page.locator('#stage')).toHaveText(stage, { timeout: 15000 })
  expect(fetched).toEqual([0])
  await page.getByLabel('Live updates').check()
  await expect(page.locator('#scene-notice')).toContainText('step 250', { timeout: 15000 })
  unavailable = true; revision = 500
  await expect(page.getByRole('alert')).toContainText('last loaded scene is retained', { timeout: 15000 })
  await expect(page.locator('#empty')).toBeHidden()
  unavailable = false; status = 'completed'; stage = 'Ready to explore'
  await expect(page.getByRole('button', { name: 'Download final PLY' })).toBeEnabled({ timeout: 15000 })
  await expect(page.locator('#scene-notice')).toContainText('step 500', { timeout: 15000 })
  await page.screenshot({ path: `artifacts/live-beta-${info.project.name}.png`, fullPage: true })
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('test-token')
})
