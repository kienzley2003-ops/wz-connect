import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { users } from '../db/schema.js'
import { UserNotFoundError } from '../lib/errors.js'

export interface UserRow {
  id: string
  email: string
  isSuperAdmin: boolean
  mfaEnabled: boolean
  createdAt: Date
}

const columns = {
  id: users.id,
  email: users.email,
  isSuperAdmin: users.isSuperAdmin,
  mfaEnabled: users.mfaEnabled,
  createdAt: users.createdAt,
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  return db.select(columns).from(users).orderBy(desc(users.createdAt))
}

export async function setSuperAdmin(db: Db, userId: string, isSuperAdmin: boolean): Promise<UserRow> {
  const [row] = await db.update(users).set({ isSuperAdmin }).where(eq(users.id, userId)).returning(columns)
  if (!row) {
    throw new UserNotFoundError()
  }
  return row
}
