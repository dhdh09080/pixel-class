import assert from 'node:assert/strict';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { verifyPublicRelease } from './public-release-check.mjs';

// Non-destructive checks: no accounts, invitations or school content are written.
const base = 'https://pixel-class-private-test.up.railway.app';
const release = process.env.EXPECTED_RELEASE || '0.6.0';
const expectedCommit = process.env.EXPECTED_COMMIT;
assert.ok(
  !expectedCommit || /^[a-f0-9]{40}$/.test(expectedCommit),
  'Expected commit must be a full SHA.',
);
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(10000) });
    if (
      response.ok &&
      response.headers.get('x-pixel-class-release') === release &&
      (!expectedCommit || response.headers.get('x-pixel-class-commit') === expectedCommit)
    ) {
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
const enrollmentResponse = await fetch(base + '/api/enrollment/config', {
  signal: AbortSignal.timeout(10000),
});
const enrollment =
  enrollmentResponse.status === 200 &&
  (await enrollmentResponse.json()).approvalRegistrationEnabled === true;
const entrance = await fetch(base + '/', {
  headers: { Accept: 'text/html' },
  redirect: 'manual',
  signal: AbortSignal.timeout(10000),
});
if (enrollment) {
  assert.equal(entrance.status, 303);
  assert.equal(entrance.headers.get('location'), '/join');
  const join = await fetch(base + '/join', { signal: AbortSignal.timeout(10000) });
  assert.equal(join.status, 200);
  assert.match(await join.text(), /\/competition-assets\//);
  const invalid = await fetch(base + '/api/enrollment/register', {
    method: 'POST',
    headers: { Origin: base, 'x-pixel-class': '1', 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(invalid.status, 400, 'Invalid public signup must not create any account.');
  const session = await fetch(base + '/api/enrollment/session', {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(session.status, 401, 'Enrollment status requires an account session.');
} else {
  assert.equal(entrance.status, 401);
  assert.equal(entrance.headers.has('www-authenticate'), false);
  assert.match(await entrance.text(), /공용 접근 비밀번호/);
}
for (const path of ['/api/config', '/api/state', '/api/teaching', '/api/operations/backup']) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 401, 'Anonymous school route must stay private.');
}
const reset = 'a'.repeat(64);
const recovery = await fetch(base + '/?reset=' + reset, {
  headers: { Accept: 'text/html' },
  redirect: 'manual',
});
if (enrollment) {
  assert.equal(recovery.status, 303);
  assert.equal(recovery.headers.get('location'), '/join?reset=' + reset);
} else assert.match(await recovery.text(), new RegExp('name="reset" value="' + reset + '"'));
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
// The upgraded transport must reach the deployed app and enforce the same
// private entrance. This is a negative check, not an authenticated WSS session.
const anonymousSocketStatus = await new Promise((resolve, reject) => {
  const request = https.request(
    base + '/socket',
    {
      headers: {
        Origin: base,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
      signal: AbortSignal.timeout(10000),
    },
    (response) => {
      response.resume();
      resolve(response.statusCode);
    },
  );
  request.on('upgrade', (_response, socket) => {
    socket.destroy();
    reject(Error('Anonymous WSS upgrade was accepted.'));
  });
  request.on('error', reject);
  request.end();
});
assert.equal(anonymousSocketStatus, 401, 'Anonymous WSS must remain private.');
const anonymousLogin = await fetch(base + '/api/login', {
  method: 'POST',
  headers: { Origin: base, 'x-pixel-class': '1', 'Content-Type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(10000),
});
assert.equal(anonymousLogin.status, 401, 'Login API must enforce the private entrance.');
const showcase = await fetch(base + '/competition/00000000-0000-4000-8000-000000000000', {
  headers: { Accept: 'text/html' },
  signal: AbortSignal.timeout(10000),
});
assert.equal(showcase.status, 200, 'The new external showcase shell must be available.');
const showcaseHtml = await showcase.text();
assert.match(showcaseHtml, /\/competition-assets\//);
assert.doesNotMatch(showcaseHtml, /공용 접근 비밀번호/);
let publicAssets;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    // Fetch a fresh shell too: its hashed entry changes when a pinned release rolls out.
    const shell = attempt
      ? await fetch(base + '/competition/00000000-0000-4000-8000-000000000000', {
          signal: AbortSignal.timeout(10000),
        })
      : undefined;
    publicAssets = await verifyPublicRelease(base, shell ? await shell.text() : showcaseHtml);
    break;
  } catch (error) {
    if (attempt === 23) throw error;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
console.log(
  JSON.stringify({
    ok: true,
    url: base,
    release,
    expectedCommit: expectedCommit || null,
    checks: [
      'HTTPS health',
      'guided entrance',
      'anonymous data blocked',
      'recovery link preserved',
      'foreign Origin blocked',
      'incorrect access code rejected',
      'anonymous WSS handshake rejected401',
      'anonymous login API blocked401',
      'new public competition shell200',
      'current public judge-progress assets200',
    ],
    publicAssets,
    approvalRegistrationEnabled: enrollment,
    authenticatedLoginVerified: false,
    authenticatedWssVerified: false,
  }),
);
