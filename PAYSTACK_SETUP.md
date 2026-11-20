> Archived: the application now uses manually confirmed EFT orders. Paystack checkout, verification, refund, and webhook routes are disabled. See README.md for the current workflow.

# Paystack setup for Mira

Mira uses Paystack Redirect Checkout. The secret key stays in Express; the browser never receives it, and a scan credit is granted only after Paystack confirms the exact reference, amount, currency, user, and quality.

## 1. Create and configure Paystack

1. Create or activate a South African Paystack business account.
2. In the Paystack Dashboard, open **Settings → API Keys & Webhooks**.
3. Start in **Test Mode** and copy the test secret key (`sk_test_...`). A public key is not required for Mira's redirect flow.
4. Enable the payment channels you want Paystack Checkout to display for ZAR transactions.

## 2. Configure Mira

Add these server-only values to `.env`:

```dotenv
PAYSTACK_SECRET_KEY=sk_test_replace_me
PAYSTACK_API_URL=https://api.paystack.co
BILLING_CURRENCY=zar
DEV_BYPASS_PAYWALL=false
```

Then apply the payment migration and restart Express:

```powershell
npm run db:migrate
npm run dev
```

## 3. Configure the webhook

Set the Paystack webhook URL to:

```text
https://app.example.com/api/billing/webhook
```

The endpoint must be publicly reachable over HTTPS. For local testing, use an HTTPS tunnel and temporarily use its origin for `APP_URL`. Nginx must allow this endpoint through to Express. Express validates `x-paystack-signature` with HMAC-SHA512 before processing `charge.success` or `refund.*` events.

The browser callback is not proof of payment. Mira also verifies the returned reference with Paystack and will not grant credit if the amount, currency, account, or scan quality differs.

## 4. Test and go live

1. Use Paystack test checkout to buy a second scan (the first account scan remains free).
2. Confirm the credit appears in the user account and the payment appears under **Admin → Payments**.
3. Test a refund and confirm its webhook status moves from pending/processing to processed or failed.
4. Complete Paystack activation before taking real payments.
5. Replace the test key with `sk_live_...`; never commit or expose either secret key.

Official references: [Transactions](https://paystack.com/docs/api/transaction/), [webhook verification](https://paystack.com/docs/payments/webhooks/), and [refunds](https://paystack.com/docs/payments/refunds/).
