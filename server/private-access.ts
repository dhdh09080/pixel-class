import { createHash, timingSafeEqual } from 'node:crypto';

/** Independent of account sessions; never accept credentials in a URL or cookie. */
export function privateAccess(authorization: string | undefined, secret: string | undefined) {
  if (!secret || !authorization || authorization.length > 512) return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return false;
  const expected = Buffer.from(`pixel:${secret}`);
  return timingSafeEqual(
    createHash('sha256').update(decoded).digest(),
    createHash('sha256').update(expected).digest(),
  );
}
