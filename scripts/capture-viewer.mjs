import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: 'Open Kloof Street Loft' }).click()
await page.locator('.viewer-page').waitFor({ state: 'visible', timeout: 15_000 })
await page.locator('.viewer-loading').waitFor({ state: 'hidden', timeout: 15_000 })
await page.screenshot({ path: 'artifacts/viewer.png' })
await browser.close()
