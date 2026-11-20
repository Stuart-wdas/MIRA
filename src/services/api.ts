import type { BuildMode } from '../types'

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || `Request failed with status ${response.status}.`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface ScanAccess {
  allowed: boolean
  reason: 'development' | 'free' | 'credit' | 'payment_required'
  quality: BuildMode
  priceCents: number
  currency: string
  billingAvailable: boolean
}

export interface BillingQuality {
  id: BuildMode
  name: string
  priceCents: number
  availableTokens: number
}

export interface BillingHistoryItem {
  id: string
  quality: BuildMode
  amount_cents: number
  currency: string
  provider: 'paystack' | 'stripe' | 'manual' | 'development' | 'eft'
  status: string
  provider_reference: string
  payment_channel: string | null
  paid_at: string | null
  created_at: string
}

export interface BillingKiosk {
  currency: string
  freeScanRemaining: boolean
  developmentMode: boolean
  developmentBypass: boolean
  eftInstructions: string
  events: Array<{ id: string; quality: string; status: string; previous_status: string | null; scan_id: string | null; created_at: string }>
  qualities: BillingQuality[]
  history: BillingHistoryItem[]
}

export type CheckoutResult = { mode: 'eft'; creditId: string; quality: BuildMode; reference: string; amountCents: number; currency: string; instructions: string }

export const billingApi = {
  quote: (quality: BuildMode) => apiJson<ScanAccess>(`/api/billing/quote/${quality}`),
  kiosk: () => apiJson<BillingKiosk>('/api/billing/kiosk'),
  async checkout(quality: BuildMode) {
    const result = await apiJson<CheckoutResult>('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality }),
    })
    return result
  },
}

export const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
