import type { RequestHandler } from 'express';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

type Encoding = 'br' | 'gzip' | 'identity';
type Representation = { body: Buffer; etag: string };
type Asset = {
  identity: Representation;
  br?: Promise<Representation>;
  gzip?: Promise<Representation>;
};
const brotli = promisify(brotliCompress),
  gz = promisify(gzip);
const maximumEntries = 64,
  maximumBytes = 64 * 1024 * 1024,
  maximumAssetBytes = 8 * 1024 * 1024;
const assetName = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.(?:js|css)$/;

/** Identity is an implicit fallback unless the client explicitly weights it. */
export function staticEncoding(header: string | undefined): Encoding | undefined {
  if (!header?.trim()) return 'identity';
  const qualities = new Map<string, number>();
  for (const part of header.toLowerCase().split(',')) {
    const [name, ...parameters] = part
      .trim()
      .split(';')
      .map((s) => s.trim());
    if (!name) continue;
    const parameter = parameters.find((p) => p.startsWith('q='));
    const quality =
      parameter === undefined
        ? 1
        : /^q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(parameter)
          ? Number(parameter.slice(2))
          : 0;
    qualities.set(name, Math.max(qualities.get(name) ?? 0, quality));
  }
  const wildcard = qualities.get('*');
  const candidates: [Encoding, number][] = [
    ['br', qualities.get('br') ?? wildcard ?? 0],
    ['gzip', qualities.get('gzip') ?? wildcard ?? 0],
    ['identity', qualities.get('identity') ?? (wildcard === 0 ? 0 : 0.0001)],
  ];
  return candidates.filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
}
function representation(body: Buffer): Representation {
  return { body, etag: '"' + createHash('sha256').update(body).digest('base64url') + '"' };
}
function matches(tag: string | undefined, etag: string) {
  return (
    tag
      ?.split(',')
      .some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag) || false
  );
}

/** Mount after the existing entrance gate. Only trusted build JS/CSS can reach this cache. */
export function staticAssetHandlers(directory: string, rewritePublic: (source: string) => string) {
  const cache = new Map<string, Asset>(),
    loading = new Map<string, Promise<Asset | undefined>>();
  let bytes = 0;
  const sizes = new WeakMap<Asset, number>();
  function trim() {
    while (cache.size > maximumEntries || bytes > maximumBytes) {
      const key = cache.keys().next().value as string | undefined;
      if (!key) break;
      const old = cache.get(key)!;
      cache.delete(key);
      bytes -= sizes.get(old) || 0;
    }
  }
  async function asset(key: string, name: string, publicView: boolean): Promise<Asset | undefined> {
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    const pending = loading.get(key);
    if (pending) return pending;
    // Bound simultaneous distinct cold reads as well as retained representations.
    if (loading.size >= maximumEntries) return;
    const promise = (async () => {
      let handle;
      try {
        handle = await open(resolve(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = await handle.stat();
        if (!info.isFile() || info.size > maximumAssetBytes) return;
        let body = await handle.readFile();
        if (body.length > maximumAssetBytes) return;
        if (publicView) body = Buffer.from(rewritePublic(body.toString('utf8')));
        const value: Asset = { identity: representation(body) };
        cache.set(key, value);
        sizes.set(value, body.length);
        bytes += body.length;
        trim();
        return value;
      } catch (error) {
        if (
          ['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(
            (error as NodeJS.ErrnoException).code || '',
          )
        )
          return;
        throw error;
      } finally {
        await handle?.close();
      }
    })();
    loading.set(key, promise);
    try {
      return await promise;
    } finally {
      loading.delete(key);
    }
  }
  function compressed(key: string, value: Asset, encoding: 'br' | 'gzip') {
    if (!value[encoding])
      value[encoding] = (async () => {
        const output =
          encoding === 'br'
            ? await brotli(value.identity.body, {
                params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
              })
            : await gz(value.identity.body, { level: 6 });
        if (cache.get(key) === value) {
          bytes += output.length;
          sizes.set(value, (sizes.get(value) || 0) + output.length);
          trim();
        }
        return representation(output);
      })().catch((error) => {
        delete value[encoding];
        throw error;
      });
    return value[encoding]!;
  }
  function handler(publicView: boolean): RequestHandler {
    return async (req, res, next) => {
      const name = String(req.params.asset || '');
      if (!assetName.test(name)) {
        res.status(404).end();
        return;
      }
      const key = (publicView ? 'public:' : 'private:') + name;
      const value = await asset(key, name, publicView);
      if (!value) {
        res.status(404).end();
        return;
      }
      res.vary('Accept-Encoding');
      if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-cache');
      const encoding = staticEncoding(req.get('Accept-Encoding'));
      if (!encoding) {
        res.status(406).end();
        return;
      }
      const selected =
        encoding === 'identity' ? value.identity : await compressed(key, value, encoding);
      res.setHeader(
        'Content-Type',
        name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
      );
      res.setHeader('ETag', selected.etag);
      if (encoding !== 'identity') res.setHeader('Content-Encoding', encoding);
      if (matches(req.get('If-None-Match'), selected.etag)) {
        res.status(304).end();
        return;
      }
      res.setHeader('Content-Length', selected.body.length);
      if (req.method === 'HEAD') res.end();
      else res.end(selected.body);
    };
  }
  return { privateAsset: handler(false), publicAsset: handler(true) };
}
