import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client.js'
import { products } from '../db/schema.js'
import { listProducts, createProduct, updateProduct } from './service.js'
import { ProductKeyTakenError, ProductNotFoundError } from '../lib/errors.js'
import { env } from '../env.js'

let db: Db
let pool: ReturnType<typeof createDb>['pool']

beforeEach(async () => {
  ;({ db, pool } = createDb(env.DATABASE_URL))
  await db.execute(sql`TRUNCATE TABLE products CASCADE`)
})

afterAll(async () => {
  await pool.end()
})

describe('listProducts', () => {
  it('lista todos os produtos, mais recentes primeiro', async () => {
    await db.insert(products).values({ key: 'masterfila', name: 'Master Fila' })
    await db.insert(products).values({ key: 'desk', name: 'Desk' })

    const rows = await listProducts(db)

    expect(rows).toHaveLength(2)
    expect(rows[0].key).toBe('desk')
  })
})

describe('createProduct', () => {
  it('cria um produto novo, ativo por padrão', async () => {
    const product = await createProduct(db, { key: 'masterfila', name: 'Master Fila' })
    expect(product.active).toBe(true)
    expect(product.key).toBe('masterfila')
  })

  it('lança ProductKeyTakenError quando a key já existe', async () => {
    await createProduct(db, { key: 'masterfila', name: 'Master Fila' })
    await expect(createProduct(db, { key: 'masterfila', name: 'Outro nome' })).rejects.toThrow(
      ProductKeyTakenError
    )
  })
})

describe('updateProduct', () => {
  it('atualiza nome e status active', async () => {
    const product = await createProduct(db, { key: 'masterfila', name: 'Master Fila' })
    const updated = await updateProduct(db, product.id, { name: 'MasterFila Pro', active: false })
    expect(updated.name).toBe('MasterFila Pro')
    expect(updated.active).toBe(false)
  })

  it('lança ProductNotFoundError quando o id não existe', async () => {
    await expect(
      updateProduct(db, '00000000-0000-0000-0000-000000000000', { active: false })
    ).rejects.toThrow(ProductNotFoundError)
  })
})
