import { BadgeDollarSign, Check, Clock3, Coins, LoaderCircle, ReceiptText, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildModeOptions } from '../buildModes'
import { billingApi, formatMoney, type BillingKiosk } from '../services/api'
import type { BuildMode } from '../types'

const formatDate = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function BillingPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [billing, setBilling] = useState<BillingKiosk | null>(null)
  const [purchasing, setPurchasing] = useState<BuildMode | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      setBilling(await billingApi.kiosk())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load billing information.')
    }
  }, [])

  useEffect(() => { void load() }, [load, refreshKey])
  useEffect(() => {
    const refresh = () => { void load() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])

  const availableTokens = useMemo(
    () => billing?.qualities.reduce((total, quality) => total + quality.availableTokens, 0) || 0,
    [billing],
  )

  const purchase = async (quality: BuildMode) => {
    setPurchasing(quality)
    setMessage('')
    setError('')
    try {
      const result = await billingApi.checkout(quality)
      if (result.mode === 'eft') {
        setMessage(`EFT order created. Pay ${formatMoney(result.amountCents, result.currency)} using reference ${result.reference}. Credits are added after payment is confirmed.`)
        await load()
      }

    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start this purchase.')
    } finally {
      setPurchasing(null)
    }
  }

  return (
    <main className="main-content secondary-page billing-page">
      <header className="page-header">
        <div><span className="page-kicker">SCAN TOKENS</span><h1>Usage & billing</h1><p>Choose a quality, add a token, and use it whenever you are ready to build.</p></div>
        <div className="billing-balance"><Coins size={20} /><span><strong>{availableTokens}</strong> available token{availableTokens === 1 ? '' : 's'}</span><button onClick={() => void load()}>Refresh</button></div>
      </header>

      {billing && <div className="billing-dev-banner"><ShieldCheck size={19} /><div><strong>Pay by EFT</strong><p style={{ whiteSpace: 'pre-line' }}>{billing.eftInstructions}</p><p>Create an order below, pay the quoted amount, and use its reference. Your credit becomes available once we confirm receipt.</p></div></div>}
      {message && <div className="billing-message success"><Check size={16} />{message}</div>}
      {error && <div className="billing-message error">{error}</div>}

      {!billing ? (
        <div className="billing-loading"><LoaderCircle className="spin" size={25} /> Loading prices…</div>
      ) : (
        <>
          <section className="billing-summary-grid" aria-label="Account allowance">
            <article><span><BadgeDollarSign size={19} /></span><div><small>Free scan</small><strong>{billing.freeScanRemaining ? 'Available' : 'Used'}</strong></div></article>
            <article><span><Coins size={19} /></span><div><small>Token balance</small><strong>{availableTokens}</strong></div></article>
            <article><span><ShieldCheck size={19} /></span><div><small>Payment method</small><strong>EFT / manual confirmation</strong></div></article>
          </section>

          <section className="billing-kiosk-section">
            <div className="billing-section-heading"><div><span>PRICING KIOSK</span><h2>Order a scan credit</h2><p>Tokens are tied to their quality level and remain on your account until used.</p></div></div>
            <div className="token-grid">
              {billing.qualities.map((quality) => {
                const option = buildModeOptions.find((item) => item.id === quality.id)!
                return (
                  <article key={quality.id} className={`token-card ${option.recommended ? 'recommended' : ''}`}>
                    {option.recommended && <span className="token-recommended">Most popular</span>}
                    <div className="token-card-top"><span>{option.name.slice(0, 1)}</span><div><h3>{option.name}</h3><p>{option.description}</p></div></div>
                    <strong className="token-price">{formatMoney(quality.priceCents, billing.currency)}</strong>
                    <span className="token-unit">per generated scan</span>
                    <p className="token-detail">{option.detail}</p>
                    <div className="token-owned"><Coins size={14} /> {quality.availableTokens} owned</div>
                    <button disabled={purchasing !== null} onClick={() => void purchase(quality.id)} aria-label={`Order ${option.name} credit by EFT`}>
                      {purchasing === quality.id ? <><LoaderCircle className="spin" size={15} /> Creating order...</> : 'Order by EFT'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="billing-history-section">
            <h2>Credit activity</h2>
            {billing.events.map((event) => <p key={event.id}>{formatDate(event.created_at)} / {titleCase(event.quality)} / {event.previous_status === 'consumed' && event.status === 'available' ? 'Credit returned for failed order' : event.status === 'consumed' ? 'Credit spent on order' : titleCase(event.status)}{event.scan_id ? ` / Order ${event.scan_id}` : ''}</p>)}
            {!billing.events.length && <p>No credit activity yet.</p>}
          </section>
          <section className="billing-history-section">
            <div className="billing-section-heading"><div><span>ACCOUNT ACTIVITY</span><h2>Token history</h2><p>Recent purchases, grants, token use, and refunds.</p></div><ReceiptText size={20} /></div>
            {billing.history.length ? (
              <div className="billing-history-table">
                <div className="billing-history-head"><span>Token</span><span>Source</span><span>Amount</span><span>Status</span><span>Date</span></div>
                {billing.history.map((item) => (
                  <div className="billing-history-row" key={item.id}>
                    <span><strong>{titleCase(item.quality)}</strong><small>{item.provider_reference}</small></span>
                    <span><strong>{item.provider === 'development' ? 'Development' : item.provider === 'manual' ? 'Admin grant' : titleCase(item.provider)}</strong><small>{item.payment_channel ? titleCase(item.payment_channel) : 'Account credit'}</small></span>
                    <span><strong>{item.amount_cents ? formatMoney(item.amount_cents, item.currency) : 'No charge'}</strong></span>
                    <span className={`billing-history-status ${item.status}`}>{titleCase(item.status)}</span>
                    <time><Clock3 size={12} />{formatDate(item.created_at)}</time>
                  </div>
                ))}
              </div>
            ) : <div className="billing-empty-history"><ReceiptText size={24} /><p>No token activity yet. Choose a quality above to add your first token.</p></div>}
          </section>
        </>
      )}
    </main>
  )
}
