import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './database.js'

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const alreadyApplied = await pool.query('SELECT 1 FROM app_schema_migrations WHERE name = $1', [file])
    if (alreadyApplied.rowCount) continue
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(await readFile(join(migrationsDirectory, file), 'utf8'))
      await client.query('INSERT INTO app_schema_migrations(name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.info(`Applied ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

migrate()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error)
    await pool.end()
    process.exitCode = 1
  })
