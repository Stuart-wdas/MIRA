import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from './config.js'

interface PaystackEnvelope<T> {
  status: boolean
  message: string
  data: T
}

export interface PaystackTransaction {
  id?: number | string
  domain?: string
  status: string
  reference: string
  amount: number
  currency: string
  channel?: string | null
  paid_at?: string | null
  metadata?: Record<string, unknown> | string | null
  customer?: { email?: string } | null
}

export interface PaystackRefund {
  id: number | string
  status: 'pending' | 'processing' | 'needs-attention' | 'failed' | 'processed'
  transaction?: number | string | { reference?: string }
  refund_reference?: string | null
}

export const paystackConfigured = Boolean(config.PAYSTACK_SECRET_KEY)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!config.PAYSTACK_SECRET_KEY) throw new Error('Paystack is not configured.')
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${config.PAYSTACK_SECRET_KEY}`)
  headers.set('Accept', 'application/json')
  if (init?.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${config.PAYSTACK_API_URL}${path}`, {
    ...init,
    headers,
    signal: init?.signal || AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null) as PaystackEnvelope<T> | null
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || `Paystack returned status ${response.status}.`)
  }
  return payload.data
}

export function verifyPaystackSignature(payload: Buffer, signature: string | undefined, secret = config.PAYSTACK_SECRET_KEY) {
  if (!secret || !signature || !/^[a-f\d]{128}$/i.test(signature)) return false
  const expected = createHmac('sha512', secret).update(payload).digest('hex')
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

export function initializePaystackTransaction(input: {
  email: string
  amountCents: number
  currency: string
  reference: string
  callbackUrl: string
  metadata: Record<string, unknown>
}) {
  return request<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amountCents),
      currency: input.currency.toUpperCase(),
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: JSON.stringify(input.metadata),
    }),
  })
}

export function verifyPaystackTransaction(reference: string) {
  return request<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
}

export function createPaystackRefund(reference: string, administratorEmail: string) {
  return request<PaystackRefund>('/refund', {
    method: 'POST',
    body: JSON.stringify({
      transaction: reference,
      customer_note: 'Refund for a Mira scan credit',
      merchant_note: `Mira administrator refund initiated by ${administratorEmail}`,
    }),
  })
}
