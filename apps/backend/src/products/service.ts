import { desc, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { products } from '../db/schema.js'
import { ProductKeyTakenError, ProductNotFoundError } from '../lib/errors.js'

export interface ProductRow {
  id: string
  key: string
  name: string
  description: string | null
  active: boolean
  createdAt: Date
}

export interface CreateProductInput {
  key: string
  name: string
  description?: string
}

export interface UpdateProductInput {
  name?: string
  description?: string
  active?: boolean
}

export async function listProducts(db: Db): Promise<ProductRow[]> {
  return db.select().from(products).orderBy(desc(products.createdAt))
}

export async function createProduct(db: Db, input: CreateProductInput): Promise<ProductRow> {
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.key, input.key)).limit(1)
  if (existing) {
    throw new ProductKeyTakenError()
  }
  const [row] = await db
    .insert(products)
    .values({ key: input.key, name: input.name, description: input.description })
    .returning()
  return row
}

export async function updateProduct(db: Db, id: string, updates: UpdateProductInput): Promise<ProductRow> {
  const [row] = await db
    .update(products)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.active !== undefined ? { active: updates.active } : {}),
    })
    .where(eq(products.id, id))
    .returning()
  if (!row) {
    throw new ProductNotFoundError()
  }
  return row
}
