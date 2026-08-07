export interface OrgLookup {
  findBySlug(slug: string): Promise<{ id: string; slug: string } | null>
}

interface CacheEntry {
  value: { id: string; slug: string } | null
  expiresAt: number
}

const DEFAULT_TTL_MS = 60_000

export function createOrgResolver(lookup: OrgLookup, ttlMs = DEFAULT_TTL_MS) {
  const cache = new Map<string, CacheEntry>()

  return {
    async resolveOrgFromHost(host: string): Promise<{ id: string; slug: string } | null> {
      const slug = host.split(':')[0].split('.')[0]
      const now = Date.now()
      const cached = cache.get(slug)
      if (cached && cached.expiresAt > now) {
        return cached.value
      }
      const value = await lookup.findBySlug(slug)
      cache.set(slug, { value, expiresAt: now + ttlMs })
      return value
    },
    invalidate(slug: string): void {
      cache.delete(slug)
    },
  }
}
