import type { Pool } from 'pg';

/** Ping simples no banco central; true se responde, false em qualquer falha. */
export async function checkCoreDb(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
