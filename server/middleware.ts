import type { NextFunction, Request, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './auth.js'
import { config } from './config.js'
import { pool } from './database.js'

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

declare global {
  // Express exposes its request type through this global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authSession?: AuthSession
      accessControl?: { role: 'customer' | 'admin'; status: 'active' | 'suspended' }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session) {
      res.status(401).json({ error: 'Sign in to continue.' })
      return
    }
    req.authSession = session
    const access = await pool.query<{ role: 'customer' | 'admin'; status: 'active' | 'suspended' }>(
      `SELECT role, status FROM user_access_controls WHERE user_id = $1`,
      [session.user.id],
    )
    const stored = access.rows[0]
    req.accessControl = {
      role: config.adminEmails.includes(session.user.email.toLowerCase()) ? 'admin' : stored?.role || 'customer',
      status: stored?.status || 'active',
    }
    if (req.accessControl.status === 'suspended') {
      res.status(403).json({ error: 'This account has been suspended. Contact support for assistance.' })
      return
    }
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.authSession || !req.accessControl) {
      res.status(401).json({ error: 'Sign in to continue.' })
      return
    }
    if (req.accessControl.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access is required.' })
      return
    }
    if (config.adminEmails.includes(req.authSession.user.email.toLowerCase())) {
      await pool.query(
        `INSERT INTO user_access_controls(user_id, role)
         VALUES ($1, 'admin')
         ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = now()`,
        [req.authSession.user.id],
      )
    }
    next()
  } catch (error) {
    next(error)
  }
}

export function verifyRequestOrigin(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (!origin || config.trustedOrigins.includes(origin)) return next()
  res.status(403).json({ error: 'Request origin is not trusted.' })
}
