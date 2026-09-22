import { and, desc, eq, gte, lte } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { auditEvents } from '../db/schema.js'

export interface AuditEventRow {
  id: string
  organizationId: string | null
  actorId: string
  impersonatedBy: string | null
  product: string
  action: string
  target: string | null
  metadata: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: Date
}

export interface LogAuditEventInput {
  organizationId?: string | null
  actorId: string
  impersonatedBy?: string | null
  product: string
  action: string
  target?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

export async function logAuditEvent(db: Db, input: LogAuditEventInput): Promise<AuditEventRow> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      organizationId: input.organizationId ?? null,
      actorId: input.actorId,
      impersonatedBy: input.impersonatedBy ?? null,
      product: input.product,
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning()
  return row
}

export interface ListAuditEventsFilters {
  organizationId?: string
  actorId?: string
  product?: string
  from?: Date
  to?: Date
}

export async function listAuditEvents(db: Db, filters: ListAuditEventsFilters): Promise<AuditEventRow[]> {
  const conditions = []
  if (filters.organizationId) {
    conditions.push(eq(auditEvents.organizationId, filters.organizationId))
  }
  if (filters.actorId) {
    conditions.push(eq(auditEvents.actorId, filters.actorId))
  }
  if (filters.product) {
    conditions.push(eq(auditEvents.product, filters.product))
  }
  if (filters.from) {
    conditions.push(gte(auditEvents.createdAt, filters.from))
  }
  if (filters.to) {
    conditions.push(lte(auditEvents.createdAt, filters.to))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  return db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt))
}
