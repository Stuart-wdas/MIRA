import { pool } from './database.js'

const email = process.argv[2]?.trim().toLowerCase()

async function grantAdmin() {
  if (!email) throw new Error('Usage: npm run admin:grant -- person@example.com')
  const user = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM public."user" WHERE lower(email) = $1`,
    [email],
  )
  if (!user.rowCount) throw new Error(`No Mira account exists for ${email}. Register that account first.`)
  await pool.query(
    `INSERT INTO user_access_controls(user_id, role, status)
     VALUES ($1, 'admin', 'active')
     ON CONFLICT (user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = now()`,
    [user.rows[0]!.id],
  )
  console.info(`Administrator access granted to ${user.rows[0]!.email}.`)
}

grantAdmin()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error)
    await pool.end()
    process.exitCode = 1
  })
