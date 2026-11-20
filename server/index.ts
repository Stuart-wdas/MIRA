import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import { accountRouter } from './account.js'
import { adminRouter } from './admin.js'
import { billingRouter } from './billing.js'
import { config } from './config.js'
import { pool } from './database.js'
import { verifyRequestOrigin } from './middleware.js'
import { scansRouter } from './scans.js'
import { fulfilmentRouter } from './fulfilment.js'

const app = express()

app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
if (config.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    const header = config.AUTH_IP_HEADER.toLowerCase()
    if (!req.headers[header] && req.socket.remoteAddress) req.headers[header] = req.socket.remoteAddress
    next()
  })
}

app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json({ limit: '1mb' }))
app.use(verifyRequestOrigin)
app.use('/api', accountRouter)
app.use('/api', adminRouter)
app.use('/api', fulfilmentRouter)
app.use('/api', billingRouter)
app.use('/api', scansRouter)
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }) })

if (config.NODE_ENV === 'production') {
  const publicDirectory = resolve('dist')
  if (existsSync(publicDirectory)) {
    app.use(express.static(publicDirectory, { maxAge: '1d', index: false }))
    app.get('*splat', (_req, res) => res.sendFile(resolve(publicDirectory, 'index.html')))
  }
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) { _next(error); return }
  console.error(error)
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'The file exceeds the upload limit (3 GB for videos, 1.5 GB for splats).' })
    return
  }
  res.status(500).json({ error: config.NODE_ENV === 'production' ? 'Something went wrong.' : error instanceof Error ? error.message : 'Something went wrong.' })
}

app.use(errorHandler)

const server = app.listen(config.API_PORT, '0.0.0.0', (error?: Error) => {
  if (error) throw error
  console.info(`Mira API listening on http://localhost:${config.API_PORT}`)
  console.info(`Manual processing enabled. Persistent file storage: ${config.STORAGE_DIRECTORY}`)
  if (config.devBypassPaywall) console.info('Development paywall bypass is enabled.')
})

async function shutdown() {
  server.close()
  await pool.end()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
