import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { pool } from './database.js'
import { storagePath } from './storage.js'

const run = promisify(execFile)
const args = process.argv.slice(2)
const container = args[0] === '--container' ? args[1] : undefined
const directory = args[0] === '--directory' ? args[1] : undefined

async function importFiles() {
  if ((!container && !directory) || args.length !== 2) throw new Error('Usage: npm run storage:import-worker -- --container NAME (or --directory PATH_TO_WORKER_DATA)')
  const scans = await pool.query<{ id: string; worker_job_id: string; status: string; source_storage_key: string | null; model_storage_key: string | null }>(
    `SELECT id, worker_job_id, status, source_storage_key, model_storage_key FROM scans
     WHERE worker_job_id IS NOT NULL AND (source_storage_key IS NULL OR (status = 'completed' AND model_storage_key IS NULL))`,
  )
  let imported = 0
  let missing = 0
  for (const scan of scans.rows) {
    if (!/^[a-f0-9]{32}$/.test(scan.worker_job_id)) { console.warn(`Skipping unrecognized worker job for scan ${scan.id}`); missing++; continue }
    for (const kind of ['source', 'model'] as const) {
      if (kind === 'source' ? scan.source_storage_key : scan.model_storage_key || scan.status !== 'completed') continue
      const candidates = kind === 'model' ? ['scene.ply'] : ['walkthrough.mp4', 'walkthrough.mov', 'walkthrough.m4v', 'walkthrough.webm']
      const key = randomBytes(16).toString('hex')
      const destination = storagePath(key)
      let filename: string | undefined
      let retained = false
      try {
        for (const candidate of candidates) {
          try {
            if (container) await run('docker', ['cp', `${container}:/data/${scan.worker_job_id}/${candidate}`, destination], { windowsHide: true })
            else await copyFile(resolve(directory!, scan.worker_job_id, candidate), destination)
            filename = candidate
            break
          } catch { await unlink(destination).catch(() => undefined) }
        }
        if (!filename || !(await stat(destination)).size) {
          console.warn(`Missing ${kind} for scan ${scan.id}; original data was not changed.`)
          missing++
          continue
        }
        const size = (await stat(destination)).size
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const changed = kind === 'model'
            ? await client.query(`UPDATE scans SET model_storage_key = $2, model_filename = $3, updated_at = now()
                WHERE id = $1 AND model_storage_key IS NULL AND status = 'completed' RETURNING id`, [scan.id, key, filename])
            : await client.query(`UPDATE scans SET source_storage_key = $2, source_filename = $3, source_size = $4, updated_at = now()
                WHERE id = $1 AND source_storage_key IS NULL RETURNING id`, [scan.id, key, filename, size])
          if (changed.rowCount) {
            await client.query(`INSERT INTO admin_audit_logs(actor_email, action, target_type, target_id, metadata)
              VALUES ('system:worker-file-import', 'scan.files_imported', 'scan', $1, $2)`, [scan.id, JSON.stringify({ kind, filename, size })])
          }
          await client.query('COMMIT')
          retained = Boolean(changed.rowCount)
          if (retained) { imported++; console.info(`Imported ${kind} for scan ${scan.id}`) }
        } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
      } finally { if (!retained) await unlink(destination).catch(() => undefined) }
    }
  }
  console.info(`Imported ${imported} files; ${missing} missing. Originals and running GPU jobs were left intact.`)
  if (missing) process.exitCode = 1
}

importFiles().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => pool.end())
