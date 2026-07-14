import { eq } from 'drizzle-orm';
import type { CoreDb } from '../../db/core/client.js';
import { users } from '../../db/core/schema.js';
import type { AuthUser, AuthStatePatch } from './auth.service.js';

export async function findAuthUserByEmail(coreDb: CoreDb, email: string): Promise<AuthUser | null> {
  const [row] = await coreDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    senhaHash: row.senhaHash,
    status: row.status,
    tentativasLogin: row.tentativasLogin,
    bloqueadoAte: row.bloqueadoAte,
  };
}

export async function updateAuthState(
  coreDb: CoreDb,
  userId: string,
  patch: AuthStatePatch,
): Promise<void> {
  await coreDb
    .update(users)
    .set({
      tentativasLogin: patch.tentativasLogin,
      bloqueadoAte: patch.bloqueadoAte,
      ...(patch.sessaoAtivaId !== undefined ? { sessaoAtivaId: patch.sessaoAtivaId } : {}),
    })
    .where(eq(users.id, userId));
}

export async function getActiveSessionId(coreDb: CoreDb, userId: string): Promise<string | null> {
  const [row] = await coreDb
    .select({ sid: users.sessaoAtivaId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.sid ?? null;
}

export async function clearActiveSession(coreDb: CoreDb, userId: string): Promise<void> {
  await coreDb.update(users).set({ sessaoAtivaId: null }).where(eq(users.id, userId));
}

export interface UserProfile {
  id: string;
  email: string;
  status: 'ativo' | 'bloqueado' | 'desativado';
}

export async function getUserProfile(coreDb: CoreDb, userId: string): Promise<UserProfile | null> {
  const [row] = await coreDb
    .select({ id: users.id, email: users.email, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
