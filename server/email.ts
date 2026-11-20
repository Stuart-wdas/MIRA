import nodemailer from 'nodemailer'
import { config } from './config.js'

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
    })
  : null

export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  if (!transporter) {
    if (config.NODE_ENV === 'production') {
      throw new Error('SMTP_HOST must be configured before transactional email can be sent.')
    }
    console.info(`[development email] ${message.subject} -> ${message.to}\n${message.text}`)
    return
  }

  await transporter.sendMail({ from: config.EMAIL_FROM, ...message })
}
