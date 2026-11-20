import { mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import multer from 'multer'
import { config } from './config.js'

export const storageDirectory = resolve(config.STORAGE_DIRECTORY)
mkdirSync(storageDirectory, { recursive: true })

export function storagePath(key: string) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error('Invalid storage key.')
  return resolve(storageDirectory, key)
}

export function safeFilename(name: string) {
  // Control characters must not reach download headers or customer-facing filenames.
  // eslint-disable-next-line no-control-regex
  return basename(name.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f"\r\n]/g, '_').slice(-200)
}

export function fileUpload(extensions: string[], maxBytes: number) {
  return multer({
    dest: storageDirectory,
    limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 4096 },
    fileFilter: (_req, file, done) => done(null, extensions.includes(file.originalname.split('.').pop()?.toLowerCase() || '')),
  })
}
