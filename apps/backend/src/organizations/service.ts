import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import { OrganizationNotFoundError } from '../lib/errors.js'

export interface OrganizationRow {
  id: string
  name: string
  slug: string
  cnpj: string | null
  billingEmail: string | null
  createdAt: Date
}

const columns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  cnpj: organizations.cnpj,
  billingEmail: organizations.billingEmail,
  createdAt: organizations.createdAt,
}

export async function listOrganizations(db: Db): Promise<OrganizationRow[]> {
  return db.select(columns).from(organizations).orderBy(desc(organizations.createdAt))
}

export async function getOrganizationById(db: Db, id: string): Promise<OrganizationRow> {
  const [row] = await db.select(columns).from(organizations).where(eq(organizations.id, id)).limit(1)
  if (!row) {
    throw new OrganizationNotFoundError()
  }
  return row
}
