import { config } from 'dotenv'
import { resolve } from 'path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

// Mesmo padrão de carregamento em camadas do env.ts: NODE_ENV=test aponta
// para o banco de teste (wz_connect_test) em vez do banco de dev — útil
// para migrar o banco de teste depois de adicionar uma migration nova.
const ROOT = resolve(process.cwd(), '../..')
config({ path: resolve(ROOT, '.env') })
if (process.env.NODE_ENV === 'test') {
  config({ path: resolve(ROOT, '.env.test'), override: true })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './drizzle' })
  await pool.end()
  console.log('Migrations applied successfully.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
