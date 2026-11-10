import assert from 'node:assert/strict';

// Non-destructive checks: no accounts, invitations or school content are written.
const base = 'https://pixel-class-private-test.up.railway.app';
const release = process.env.EXPECTED_RELEASE || '0.6.0';
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(10000) });
    if (response.ok && response.headers.get('x-pixel-class-release') === release) {
      assert.deepEqual(await response.json(), { ok: true });
      ready = true;
      break;
    }
  } catch {
    /* Deployment may be restarting; bounded polling below. */
  }
  await new Promise((r) => setTimeout(r, 10000));
}
assert.ok(ready, 'The expected live release did not become healthy.');
const entrance = await fetch(base + '/', {
  headers: { Accept: 'text/html' },
  signal: AbortSignal.timeout(10000),
});
assert.equal(entrance.status, 401);
assert.equal(entrance.headers.has('www-authenticate'), false);
assert.match(await entrance.text(), /공용 접근 비밀번호/);
for (const path of ['/api/config', '/api/state', '/api/teaching', '/api/operations/backup']) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 401, 'Anonymous school route must stay private.');
}
const reset = 'a'.repeat(64);
const recovery = await fetch(base + '/?reset=' + reset, { headers: { Accept: 'text/html' } });
assert.match(await recovery.text(), new RegExp('name="reset" value="' + reset + '"'));
const wrongOrigin = await fetch(base + '/access', {
  method: 'POST',
  headers: {
    Origin: 'https://example.invalid',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'code=incorrect&invite=&reset=',
});
assert.equal(wrongOrigin.status, 403);
const incorrect = await fetch(base + '/access', {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'code=incorrect&invite=&reset=',
});
assert.equal(incorrect.status, 401);
assert.match(await incorrect.text(), /다시 확인/);
console.log(
  JSON.stringify({
    ok: true,
    url: base,
    release,
    checks: [
      'HTTPS health',
      'guided entrance',
      'anonymous data blocked',
      'recovery link preserved',
      'foreign Origin blocked',
      'incorrect access code rejected',
    ],
  }),
);
