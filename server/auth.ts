import { betterAuth } from 'better-auth'
import { config } from './config.js'
import { pool } from './database.js'
import { sendEmail } from './email.js'

export const auth = betterAuth({
  appName: 'Mira',
  baseURL: config.APP_URL,
  secret: config.betterAuthSecret,
  database: pool,
  trustedOrigins: config.trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: 'Reset your Mira password',
        text: `Reset your Mira password: ${url}`,
        html: `<p>Reset your Mira password using the secure link below.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
      }).catch((error) => console.error('Could not send password reset email', error))
    },
  },
  emailVerification: {
    sendOnSignUp: config.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: 'Verify your Mira email',
        text: `Verify your Mira email: ${url}`,
        html: `<p>Welcome to Mira. Confirm your email to finish setting up your account.</p><p><a href="${url}">Verify email</a></p>`,
      }).catch((error) => console.error('Could not send verification email', error))
    },
  },
  user: {
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
  },
  rateLimit: { enabled: true },
  advanced: {
    cookiePrefix: 'mira',
    ipAddress: { ipAddressHeaders: [config.AUTH_IP_HEADER] },
  },
})
