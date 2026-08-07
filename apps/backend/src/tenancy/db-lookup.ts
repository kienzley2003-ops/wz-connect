import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { organizations } from '../db/schema.js'
import type { OrgLookup } from './resolver.js'

export function createDbOrgLookup(db: Db): OrgLookup {
  return {
    async findBySlug(slug: string) {
      const [row] = await db
        .select({ id: organizations.id, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1)
      return row ?? null
    },
  }
}
