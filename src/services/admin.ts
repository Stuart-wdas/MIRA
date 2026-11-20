import { apiJson } from './api'

export type AdminRole = 'customer' | 'admin'
export type AccountStatus = 'active' | 'suspended'

export interface AdminIdentity {
  id: string
  name: string
  email: string
  role: 'admin'
}

export interface AdminOverview {
  users: { total: number; new_last_30_days: number; suspended: number; administrators: number }
  scans: { total: number; completed: number; processing: number; failed: number; removed: number }
  payments: { successful: number; pending: number; refunded: number; collected_cents: number; refunded_cents: number; currency: string }
  daily: Array<{ day: string; scans: number; users: number }>
  recentUsers: Array<{ id: string; name: string; email: string; created_at: string }>
  recentScans: AdminScan[]
  processingMode: 'manual'
  developmentBypass: boolean
}

export interface AdminUser {
  id: string
  name: string
  email: string
  email_verified: boolean
  created_at: string
  updated_at: string
  role: AdminRole
  status: AccountStatus
  admin_notes: string
  scans_total: number
  scans_completed: number
  scans_processing: number
  available_credits: number
  paid_cents: number
}

export interface AdminScan {
  id: string
  user_id?: string
  source_filename?: string | null
  source_size?: string | null
  has_model?: boolean
  credit_refunded_at?: string | null
  worker_job_id?: string | null
  name: string
  location?: string
  quality: string
  entitlement_type?: string
  price_cents?: number
  currency?: string
  status: string
  progress: number
  stage?: string
  splat_count?: string | null
  error?: string | null
  created_at: string
  updated_at?: string
  completed_at?: string | null
  deleted_at?: string | null
  customer_name?: string
  customer_email?: string
  custom_tuning?: boolean
  target_frames?: number | null
  train_steps?: number | null
  downscale_factor?: number | null
}

export interface AdminPayment {
  id: string
  user_id: string
  quality: string
  amount_cents: number
  currency: string
  status: string
  provider: 'paystack' | 'stripe' | 'manual' | 'development' | 'eft'
  provider_reference: string
  provider_transaction_id: string | null
  provider_refund_id: string | null
  refund_status: string | null
  payment_channel: string | null
  paid_at: string | null
  consumed_scan_id: string | null
  created_at: string
  updated_at: string
  customer_name: string
  customer_email: string
  manual: boolean
  development: boolean
}

export interface AdminPricing {
  currency: string
  qualities: Array<{ id: 'quick' | 'preview' | 'balanced' | 'high' | 'maximum'; name: string; priceCents: number }>
}

export interface AuditEvent {
  id: string
  actor_user_id: string | null
  actor_email: string
  action: string
  target_type: string
  target_id: string
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  limit: number
  total: number
  pages: number
}

export interface AdminUserDetail {
  profile: AdminUser
  sessions: number
  preferences: { ready_emails: boolean; weekly_emails: boolean; prefer_high_quality: boolean } | null
  scans: AdminScan[]
  credits: AdminPayment[]
}

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return params.toString()
}

export const adminApi = {
  me: () => apiJson<AdminIdentity>('/api/admin/me'),
  overview: () => apiJson<AdminOverview>('/api/admin/overview'),
  pricing: () => apiJson<AdminPricing>('/api/admin/pricing'),
  updatePricing: (prices: Record<'quick' | 'preview' | 'balanced' | 'high' | 'maximum', number>) => apiJson<AdminPricing>('/api/admin/pricing', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prices }),
  }),
  users: (filters: Record<string, string | number | undefined>) => apiJson<PageResult<AdminUser>>(`/api/admin/users?${query(filters)}`),
  user: (id: string) => apiJson<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  updateAccess: (id: string, body: { role?: AdminRole; status?: AccountStatus; adminNotes?: string }) => apiJson(`/api/admin/users/${encodeURIComponent(id)}/access`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  grantCredits: (id: string, body: { quality: string; quantity: number; note: string }) => apiJson(`/api/admin/users/${encodeURIComponent(id)}/credits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  revokeCredit: (id: string) => apiJson<void>(`/api/admin/credits/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  confirmEft: (id: string, bankReference: string) => apiJson(`/api/admin/credits/${id}/confirm-eft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankReference }),
  }),
  scanStatus: (id: string, status: 'processing' | 'failed', reason = '') => apiJson(`/api/admin/scans/${id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason }),
  }),
  refundScanCredit: (id: string) => apiJson(`/api/admin/scans/${id}/refund-credit`, { method: 'POST' }),
  uploadModel: (id: string, file: File) => {
    const body = new FormData()
    body.append('model', file)
    return apiJson(`/api/admin/scans/${id}/model`, { method: 'POST', body })
  },
  scans: (filters: Record<string, string | number | undefined>) => apiJson<PageResult<AdminScan>>(`/api/admin/scans?${query(filters)}`),
  setScanRemoved: (id: string, removed: boolean) => apiJson(`/api/admin/scans/${encodeURIComponent(id)}/visibility`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removed }),
  }),
  payments: (filters: Record<string, string | number | undefined>) => apiJson<PageResult<AdminPayment>>(`/api/admin/payments?${query(filters)}`),
  audit: (filters: Record<string, string | number | undefined>) => apiJson<PageResult<AuditEvent>>(`/api/admin/audit?${query(filters)}`),
}
