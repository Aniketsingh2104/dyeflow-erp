/**
 * lib/password.ts — password hashing (server only). Uses Node's built-in
 * scrypt, so no extra package is needed.
 *
 * Stored format:  scrypt$<N>$<salt base64>$<hash base64>
 * Passwords are trimmed before hashing/checking (same as before).
 * Old plain-text passwords are still accepted ONCE: on the next successful
 * login they are re-saved as a hash (see app/api/auth/route.ts).
 */
import crypto from 'node:crypto'

const N = 16384, R = 8, P = 1, KEYLEN = 64

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(plain.trim(), salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function isHashed(stored?: string | null): boolean {
  return !!stored && stored.startsWith('scrypt$')
}

export function verifyPassword(plain: string, stored?: string | null): boolean {
  if (!stored) return false
  if (!isHashed(stored)) {
    // Legacy plain-text row (upgraded to a hash right after a successful login)
    const a = Buffer.from(stored.trim()), b = Buffer.from(plain.trim())
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }
  const [, nStr, saltB64, hashB64] = stored.split('$')
  const n = parseInt(nStr, 10)
  if (!n || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = crypto.scryptSync(plain.trim(), Buffer.from(saltB64, 'base64'), expected.length, { N: n, r: R, p: P })
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
