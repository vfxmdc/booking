import crypto from 'crypto';

/** Staff login codes are stored only as salted scrypt hashes. */
export function hashCode(code: string): { codeHash: string; codeSalt: string } {
  const codeSalt = crypto.randomBytes(16).toString('hex');
  const codeHash = crypto.scryptSync(code, codeSalt, 32).toString('hex');
  return { codeHash, codeSalt };
}

export function verifyCode(code: string, hash: { codeHash: string; codeSalt: string }): boolean {
  if (!code || !hash.codeHash || !hash.codeSalt) return false;
  const actual = crypto.scryptSync(code, hash.codeSalt, 32);
  const expected = Buffer.from(hash.codeHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export const MIN_CODE_LENGTH = 6;
