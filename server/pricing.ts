import type { PoolClient } from 'pg'
import { config, qualityOrder, qualityPrices, type Quality } from './config.js'
import { pool } from './database.js'

type Queryable = Pick<PoolClient, 'query'>

export interface QualityPrice {
  id: Quality
  name: string
  priceCents: number
}

const qualityNames: Record<Quality, string> = {
  quick: 'Quick',
  preview: 'Preview',
  balanced: 'Balanced',
  high: 'High',
  maximum: 'Maximum',
}

async function ensurePrices(database: Queryable) {
  await database.query(
    `INSERT INTO scan_quality_prices (quality, price_cents)
     SELECT * FROM unnest($1::text[], $2::integer[])
     ON CONFLICT (quality) DO NOTHING`,
    [qualityOrder, qualityOrder.map((quality) => qualityPrices[quality])],
  )
}

export async function getQualityPricing(database: Queryable = pool): Promise<QualityPrice[]> {
  await ensurePrices(database)
  const result = await database.query<{ quality: Quality; price_cents: number }>(
    `SELECT quality, price_cents
     FROM scan_quality_prices
     ORDER BY array_position($1::text[], quality)`,
    [qualityOrder],
  )
  const prices = new Map(result.rows.map((row) => [row.quality, Number(row.price_cents)]))
  return qualityOrder.map((quality) => ({
    id: quality,
    name: qualityNames[quality],
    priceCents: prices.get(quality) ?? qualityPrices[quality],
  }))
}

export async function getQualityPrice(database: Queryable, quality: Quality) {
  const pricing = await getQualityPricing(database)
  return pricing.find((item) => item.id === quality)?.priceCents ?? qualityPrices[quality]
}

export async function replaceQualityPricing(
  database: Queryable,
  prices: Record<Quality, number>,
  administratorId: string,
) {
  await ensurePrices(database)
  for (const quality of qualityOrder) {
    await database.query(
      `UPDATE scan_quality_prices
       SET price_cents = $2, updated_by = $3, updated_at = now()
       WHERE quality = $1`,
      [quality, prices[quality], administratorId],
    )
  }
  return getQualityPricing(database)
}

export const billingCurrency = config.BILLING_CURRENCY
