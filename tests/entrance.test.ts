import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessCookie,
  createAccessPass,
  entranceInvite,
  entrancePage,
  validAccessCode,
  validAccessPass,
} from '../server/entrance.js';

const secret = 'unit-test-only-private-entrance-32-characters';
test('private entrance validates bounded passwords without accepting missing or malformed input', () => {
  assert.equal(validAccessCode(secret, secret), true);
  for (const code of [undefined, null, 123, {}, '', secret + 'x', 'x'.repeat(129)])
    assert.equal(validAccessCode(code, secret), false);
  assert.equal(validAccessCode(secret, undefined), false);
});

test('private access passes reject expiration, tampering, wrong secrets and malformed cookies', () => {
  const pass = createAccessPass(secret);
  assert.ok(!pass.includes(secret));
  assert.equal(validAccessPass(`other=1; ${accessCookie}=${pass}`, secret), true);
  assert.equal(validAccessPass(`${accessCookie}=${pass}`, secret + 'wrong'), false);
  assert.equal(validAccessPass(`${accessCookie}=${pass}`, undefined), false);
  const expired = createAccessPass(secret, Date.now() - 1000);
  const changedExpiry = `${Number(pass.split('.')[0]) + 1000}.${pass.split('.')[1]}`;
  const changedSignature = pass.slice(0, -1) + (pass.endsWith('a') ? 'b' : 'a');
  for (const value of [
    expired,
    changedExpiry,
    changedSignature,
    'invalid',
    '1.abc',
    '9'.repeat(8000),
  ])
    assert.equal(validAccessPass(`${accessCookie}=${value}`, secret), false);
  assert.equal(validAccessPass(undefined, secret), false);
});

test('entrance keeps only safe invitation keys and never accepts markup or redirect destinations', () => {
  const invitation = 'VALID-test_invite-123';
  assert.equal(entranceInvite(invitation), invitation);
  for (const value of [
    'short',
    '<script>alert(1)</script>',
    'https://attacker.example',
    'x'.repeat(101),
    ['key'],
    undefined,
  ])
    assert.equal(entranceInvite(value), '');
  const page = entrancePage(entranceInvite('<script>alert(1)</script>'));
  assert.ok(!page.includes('<script>'));
  assert.ok(page.includes('action="/access"'));
  assert.ok(page.includes('type="password"'));
});
