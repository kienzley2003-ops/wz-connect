import { hash, verify } from '@node-rs/argon2';

/** Gera o hash Argon2 de uma senha (salt aleatório embutido). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verifica a senha contra o hash; retorna false em hash inválido (não lança). */
export async function verifyPassword(hashString: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashString, plain);
  } catch {
    return false;
  }
}
