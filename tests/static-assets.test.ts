import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { staticEncoding } from '../server/static-assets.js';
// @ts-expect-error The release probe also runs directly under plain Node in CI.
import { verifyPublicRelease } from '../scripts/public-release-check.mjs';
const dir = mkdtempSync(join(tmpdir(), 'pixel-static-')),
  port = 3064,
  origin = `http://127.0.0.1:${port}`;
const js =
  'const deps=["assets/chunk-fixture.js","assets/PublicCompetition-release-fixture.js"]; export const title="우리 교실";\n' +
  '/* trusted build fixture */\n'.repeat(10000);
const css = '.school { background: url("/assets/school.png"); color: #214538; }\n'.repeat(2000);
let server: ChildProcess;
function raw(path: string, encoding?: string, extra: Record<string, string> = {}, method = 'GET') {
  return new Promise<{
    status: number;
    headers: import('node:http').IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const req = httpRequest(
      origin + path,
      {
        method,
        headers: { ...(encoding === undefined ? {} : { 'Accept-Encoding': encoding }), ...extra },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}
before(async () => {
  mkdirSync(join(dir, 'dist/assets'), { recursive: true });
  writeFileSync(
    join(dir, 'dist/index.html'),
    '<html><script type="module" src="/assets/app-fixture.js"></script></html>',
  );
  writeFileSync(join(dir, 'dist/assets/app-fixture.js'), js);
  writeFileSync(
    join(dir, 'dist/assets/PublicCompetition-release-fixture.js'),
    'export const nextAction="다음 미평가 작품";',
  );
  writeFileSync(join(dir, 'dist/assets/app-fixture.css'), css);
  writeFileSync(join(dir, 'secret.js'), 'SECRET_OUTSIDE_BUILD');
  symlinkSync(join(dir, 'secret.js'), join(dir, 'dist/assets/linked.js'));
  server = spawn(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), resolve('server/index.ts')],
    {
      cwd: dir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOST: '127.0.0.1',
        PUBLIC_ORIGIN: origin,
        ALLOW_INSECURE_LOCALHOST: 'true',
        COOKIE_SECURE: 'false',
        DEMO_MODE: 'false',
        DATABASE_PATH: join(dir, 'school.sqlite'),
        MASTER_BOOTSTRAP_KEY: 'static-test-bootstrap-only-with-32-characters',
        AUTO_BACKUP: 'false',
        PIXEL_RUNTIME: '',
        RAILWAY_PROJECT_ID: '',
        RAILWAY_GIT_COMMIT_SHA: '1234567890abcdef1234567890abcdef12345678',
      },
      stdio: 'ignore',
    },
  );
  for (let i = 0; i < 80; i++) {
    try {
      if ((await raw('/api/health')).status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail('Production static fixture failed to start');
});
after(async () => {
  if (server?.exitCode === null) {
    const ended = once(server, 'exit');
    server.kill('SIGTERM');
    await ended;
  }
  rmSync(dir, { recursive: true, force: true });
});
test('encoding negotiation honors weighted preferences, explicit exclusions and identity fallback', () => {
  for (const [header, wanted] of [
    [undefined, 'identity'],
    ['', 'identity'],
    ['br, gzip', 'br'],
    ['gzip;q=0.8, br;q=0.4', 'gzip'],
    ['br;q=0, gzip', 'gzip'],
    ['br;q=0,gzip;q=0', 'identity'],
    ['br;q=0.3, identity;q=0.9', 'identity'],
    ['*;q=0.5, br;q=0', 'gzip'],
    ['*;q=0, identity;q=1', 'identity'],
    ['br;q=0,gzip;q=0,identity;q=0', undefined],
    ['*;q=0', undefined],
  ] as const)
    assert.equal(staticEncoding(header), wanted, String(header));
});
test('actual production private JS/CSS use bounded negotiated representations with exact decoded bodies', async () => {
  for (const [name, original] of [
    ['app-fixture.js', js],
    ['app-fixture.css', css],
  ] as const) {
    const identity = await raw('/assets/' + name, 'identity'),
      br = await raw('/assets/' + name, 'br'),
      gzip = await raw('/assets/' + name, 'gzip');
    for (const r of [identity, br, gzip]) {
      assert.equal(r.status, 200);
      assert.equal(Number(r.headers['content-length']), r.body.length);
      assert.match(String(r.headers.vary), /Accept-Encoding/i);
      assert.ok(r.headers.etag);
      assert.match(String(r.headers['content-security-policy']), /default-src 'self'/);
    }
    assert.equal(identity.headers['content-encoding'], undefined);
    assert.equal(identity.body.toString(), original);
    assert.equal(br.headers['content-encoding'], 'br');
    assert.equal(brotliDecompressSync(br.body).toString(), original);
    assert.equal(gzip.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(gzip.body).toString(), original);
    assert.ok(br.body.length < identity.body.length / 5);
    assert.ok(gzip.body.length < identity.body.length / 5);
    assert.notEqual(br.headers.etag, identity.headers.etag);
    assert.notEqual(br.headers.etag, gzip.headers.etag);
  }
});
test('public compressed assets rewrite lazy dependency maps and CSS before encoding', async () => {
  for (const [name, source] of [
    ['app-fixture.js', js],
    ['app-fixture.css', css],
  ])
    for (const encoding of ['identity', 'br', 'gzip']) {
      const r = await raw('/competition-assets/' + name, encoding);
      assert.equal(r.status, 200);
      const body =
        encoding === 'br'
          ? brotliDecompressSync(r.body)
          : encoding === 'gzip'
            ? gunzipSync(r.body)
            : r.body;
      assert.ok(body.toString().includes('/competition-assets/'));
      assert.ok(!body.toString().includes('"assets/'));
      assert.notEqual(body.toString(), source);
    }
  const shell = await raw('/competition/11111111-2222-3333-4444-555555555555');
  const assets = await verifyPublicRelease(origin, shell.body.toString());
  assert.equal(assets.featureAsset, '/competition-assets/PublicCompetition-release-fixture.js');
  await assert.rejects(
    verifyPublicRelease(origin, shell.body.toString(), async (url: URL, options: RequestInit) =>
      url.pathname.includes('PublicCompetition-')
        ? new Response('export const oldRelease=true;')
        : fetch(url, options),
    ),
    /missing the current/,
  );
  await assert.rejects(
    verifyPublicRelease(
      origin,
      shell.body.toString(),
      async () => new Response('not found', { status: 404 }),
    ),
    /must load/,
  );
  let externalRequest = false;
  await assert.rejects(
    verifyPublicRelease(
      origin,
      '<script src="https://example.invalid/app.js"></script>',
      async () => {
        externalRequest = true;
        return new Response('');
      },
    ),
    /same-origin/,
  );
  assert.equal(externalRequest, false);
});
test('representation-specific ETags, weak/list validators and HEAD preserve HTTP negotiation', async () => {
  const br = await raw('/assets/app-fixture.js', 'br');
  for (const match of [
    String(br.headers.etag),
    'W/' + br.headers.etag,
    '"unrelated", ' + br.headers.etag,
    '*',
  ]) {
    const cached = await raw('/assets/app-fixture.js', 'br', { 'If-None-Match': match });
    assert.equal(cached.status, 304);
    assert.equal(cached.body.length, 0);
    assert.equal(cached.headers['content-encoding'], 'br');
    assert.match(String(cached.headers.vary), /Accept-Encoding/);
  }
  assert.equal(
    (await raw('/assets/app-fixture.js', 'gzip', { 'If-None-Match': String(br.headers.etag) }))
      .status,
    200,
  );
  const head = await raw('/assets/app-fixture.js', 'br', {}, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-length'], br.headers['content-length']);
});
test('q=0 exclusion returns identity or 406 and unknown/linked/traversal assets never leak files', async () => {
  assert.equal(
    (await raw('/assets/app-fixture.js', 'br;q=0,gzip;q=0')).headers['content-encoding'],
    undefined,
  );
  for (const header of ['*;q=0', 'br;q=0,gzip;q=0,identity;q=0']) {
    const r = await raw('/competition-assets/app-fixture.js', header);
    assert.equal(r.status, 406);
    assert.equal(r.headers['content-encoding'], undefined);
  }
  for (const path of [
    '/assets/missing.js',
    '/assets/linked.js',
    '/competition-assets/linked.js',
    '/competition-assets/not.js.map',
    '/competition-assets/%2e%2e%2fsecret.js',
    '/assets/%2e%2e%2fsecret.js',
  ]) {
    const r = await raw(path, 'br');
    assert.equal(r.status, 404, path);
    assert.ok(!r.body.includes(Buffer.from('SECRET_OUTSIDE_BUILD')));
  }
});
test('HTML, health/auth APIs and user-facing errors remain uncompressed and auth is preserved', async () => {
  for (const [path, status] of [
    ['/', 200],
    ['/competition/11111111-2222-3333-4444-555555555555', 200],
    ['/api/health', 200],
    ['/api/state', 401],
    ['/api/competitions', 401],
  ] as const) {
    const r = await raw(path, 'br, gzip');
    assert.equal(r.status, status);
    assert.equal(r.headers['content-encoding'], undefined);
    if (path === '/api/health')
      assert.equal(r.headers['x-pixel-class-commit'], '1234567890abcdef1234567890abcdef12345678');
  }
});
test('simultaneous cold clients receive one stable encoded representation', async () => {
  writeFileSync(join(dir, 'dist/assets/cold-fixture.js'), js + '\nconst cold=true;');
  const responses = await Promise.all(
    Array.from({ length: 30 }, () => raw('/assets/cold-fixture.js', 'br')),
  );
  assert.ok(
    responses.every((r) => r.status === 200 && r.headers.etag === responses[0].headers.etag),
  );
  assert.ok(responses.every((r) => r.body.equals(responses[0].body)));
  assert.equal(brotliDecompressSync(responses[0].body).toString(), js + '\nconst cold=true;');
});

test('static cache evicts old build entries after its fixed entry bound', async () => {
  await raw('/assets/app-fixture.js', 'identity');
  for (let i = 0; i < 65; i++) {
    const name = `eviction-${i}.js`;
    writeFileSync(join(dir, 'dist/assets', name), `export const item=${i};`);
    assert.equal((await raw('/assets/' + name, 'identity')).status, 200);
  }
  const replacement = 'export const replacedAfterEviction=true;';
  writeFileSync(join(dir, 'dist/assets/app-fixture.js'), replacement);
  assert.equal((await raw('/assets/app-fixture.js', 'identity')).body.toString(), replacement);
});
