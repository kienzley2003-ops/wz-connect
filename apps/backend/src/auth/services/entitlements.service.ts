import type { EntitlementsResolver } from '@wz/shared'

export const stubEntitlementsResolver: EntitlementsResolver = {
  async getActiveEntitlements() {
    return { planId: null, products: [] }
  },
}
