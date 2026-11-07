import { readFileSync } from 'node:fs';

type Environment = Record<string, string | undefined>;

/** Load Docker secrets on the server only. Never log secret values. */
export function loadSecretFiles(env: Environment) {
  for (const name of ['MASTER_BOOTSTRAP_KEY', 'OPENAI_API_KEY'] as const) {
    const file = env[`${name}_FILE`];
    if (!file) continue;
    if (env[name]) throw new Error(`Configure only ${name} or ${name}_FILE, not both.`);
    const value = readFileSync(file, 'utf8').trim();
    if (!value) throw new Error(`${name}_FILE must contain a value.`);
    env[name] = value;
  }
}

export function validateRuntime(env: Environment) {
  if (env.TRUST_PROXY_HOPS && !['0', '1'].includes(env.TRUST_PROXY_HOPS))
    throw new Error('TRUST_PROXY_HOPS must be 0 or 1; expose only the configured reverse proxy.');
  if (env.NODE_ENV !== 'production') return;
  let origin: URL;
  try {
    origin = new URL(env.PUBLIC_ORIGIN || '');
  } catch {
    throw new Error('Production requires an exact PUBLIC_ORIGIN.');
  }
  if (origin.origin !== env.PUBLIC_ORIGIN || origin.username || origin.password)
    throw new Error('PUBLIC_ORIGIN must be an origin without credentials, path or trailing slash.');
  const localTest =
    env.ALLOW_INSECURE_LOCALHOST === 'true' &&
    ['127.0.0.1', '::1'].includes(env.HOST || '127.0.0.1') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
    origin.protocol === 'http:';
  if (!localTest && (origin.protocol !== 'https:' || env.COOKIE_SECURE !== 'true'))
    throw new Error('Production requires HTTPS PUBLIC_ORIGIN and COOKIE_SECURE=true.');
  if (!env.DATABASE_PATH)
    throw new Error('Production requires an explicit persistent DATABASE_PATH.');
  if (env.MASTER_BOOTSTRAP_KEY && env.MASTER_BOOTSTRAP_KEY.length < 32)
    throw new Error('Production MASTER_BOOTSTRAP_KEY must contain at least 32 characters.');
}

export function allowedOrigin(origin: string, host: string | undefined, canonical?: string) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || origin !== url.origin) return false;
    return canonical ? origin === canonical : url.host === host;
  } catch {
    return false;
  }
}
