import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { defaultAppearance } from '../shared/types.js';
import {
  appearanceOptions,
  appearanceColors,
  normalizeAppearance,
  appearancePresets,
  professionPresets,
} from '../shared/appearance.js';
import { appearanceSchema } from '../shared/appearance-schema.js';
import { defaultSchoolSettings } from '../shared/school.js';
const directory = mkdtempSync(join(tmpdir(), 'pixel-studio-api-'));
const file = join(directory, 'school.sqlite'),
  base = 'http://127.0.0.1:3038';
let child: ChildProcess,
  master = '',
  student = '',
  other = '';
async function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '3038',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DATABASE_PATH: file,
      MASTER_BOOTSTRAP_KEY: 'studio-test-bootstrap-only',
      AUTO_BACKUP: 'false',
    },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 70; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready);
}
async function stop() {
  if (child?.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}
async function request(path: string, method = 'GET', body?: unknown, cookie = master) {
  return fetch(base + '/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Pixel-Class': '1',
      Origin: base,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
before(async () => {
  await start();
  const boot = await request('/bootstrap', 'POST', {
    key: 'studio-test-bootstrap-only',
    email: 'studio-master@example.com',
    name: '스튜디오 선생님',
    password: 'studio-master-password',
  });
  assert.equal(boot.status, 200);
  master = boot.headers.get('set-cookie')!.split(';')[0];
  const invite = await (await request('/invitations', 'POST', { label: '꾸미기 검증' })).json();
  const registered = await request(
    '/register',
    'POST',
    {
      key: invite.key,
      email: 'studio-student@example.com',
      name: '꾸미기 학생',
      password: 'studio-student-password',
      appearance: defaultAppearance,
    },
    '',
  );
  assert.equal(registered.status, 201);
  student = registered.headers.get('set-cookie')!.split(';')[0];
  const db = new DatabaseSync(file),
    token = randomBytes(32).toString('hex');
  const member = {
    id: 'other-studio-master',
    schoolId: 'other-studio-school',
    name: '다른 학교',
    role: 'MASTER',
    status: 'ACTIVE',
    appearance: defaultAppearance,
    help: false,
    workStatus: 'IDLE',
    deskId: null,
  };
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    member.id,
    member.schoolId,
    'other-studio@example.com',
    'unused-fixture',
    JSON.stringify(member),
  );
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
    createHash('sha256').update(token).digest('hex'),
    member.id,
    Date.now() + 1000000,
  );
  db.close();
  other = 'pixel_session=' + token;
});
after(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
});

test('expanded appearance catalog validates every option, rejects unsafe data, and preserves legacy defaults', () => {
  const legacy = {
    skin: '#f1c6a1',
    hair: '#44372d',
    hairstyle: 1,
    eyes: '#34364a',
    eyeShape: 0,
    brows: 0,
    mouth: 0,
    expression: 0,
    accessory: 0,
    body: 0,
  };
  assert.equal(appearanceSchema.safeParse(legacy).success, true);
  assert.equal(normalizeAppearance(legacy).helmetColor, '#f7f6ed');
  assert.equal(normalizeAppearance(legacy).hairstyle, 1);
  for (const [key, options] of Object.entries(appearanceOptions)) {
    assert.equal(
      appearanceSchema.safeParse({ ...defaultAppearance, [key]: options.length - 1 }).success,
      true,
    );
    for (const value of [-1, options.length, 1.5, '1'])
      assert.equal(
        appearanceSchema.safeParse({ ...defaultAppearance, [key]: value }).success,
        false,
      );
  }
  for (const preset of [...appearancePresets, ...professionPresets]) {
    assert.equal(
      appearanceSchema.safeParse({ ...defaultAppearance, ...preset.changes }).success,
      true,
    );
    // Every curated color must have a visible selected swatch in the editor.
    for (const [key, palette] of Object.entries(appearanceColors)) {
      const color = preset.changes[key as keyof typeof appearanceColors];
      if (color)
        assert.ok(
          (palette as readonly string[]).includes(color),
          `${preset.name}: ${key} has no selectable swatch`,
        );
    }
  }
  for (const key of ['skin', 'helmetColor', 'outfitColor', 'accentColor'])
    assert.equal(
      appearanceSchema.safeParse({ ...defaultAppearance, [key]: 'url(javascript:bad)' }).success,
      false,
    );
});
test('both roles save expanded layered outfits and headwear while invalid updates preserve their appearance', async () => {
  for (const cookie of [master, student]) {
    const look = {
      ...defaultAppearance,
      hairstyle: 8,
      body: 3,
      eyeShape: 5,
      brows: 4,
      expression: 5,
      mouth: 4,
      accessory: 6,
      helmetStyle: 2,
      helmetColor: '#a79bc7',
      helmetPattern: 5,
      outfit: 3,
      outfitColor: '#a85e73',
      accentColor: '#f6eee0',
    };
    assert.equal((await request('/me', 'PATCH', { appearance: look }, cookie)).status, 200);
    assert.deepEqual(
      (await (await request('/state', 'GET', undefined, cookie)).json()).me.appearance,
      look,
    );
    assert.equal(
      (await request('/me', 'PATCH', { appearance: { ...look, outfit: 999 } }, cookie)).status,
      400,
    );
    assert.deepEqual(
      (await (await request('/state', 'GET', undefined, cookie)).json()).me.appearance,
      look,
    );
    const legacy = Object.fromEntries(
      [
        'skin',
        'hair',
        'eyes',
        'body',
        'hairstyle',
        'eyeShape',
        'brows',
        'mouth',
        'expression',
        'accessory',
      ].map((key) => [key, look[key as keyof typeof look]]),
    );
    legacy.hairstyle = 1;
    assert.equal((await request('/me', 'PATCH', { appearance: legacy }, cookie)).status, 200);
    const preserved = (await (await request('/state', 'GET', undefined, cookie)).json()).me
      .appearance;
    assert.equal(preserved.hairstyle, 1);
    assert.equal(preserved.outfit, look.outfit);
    assert.equal(preserved.helmetColor, look.helmetColor);
    assert.equal(preserved.helmetPattern, look.helmetPattern);
  }
});
test('only MASTER edits its own school labels; students see updates, other schools remain isolated', async () => {
  const school = {
    name: '다희의 AI 교실 테스트',
    cohortName: 'AI 개발 2기',
    roomName: '아이디어 실험실',
    term: '2027 봄학기',
  };
  assert.equal((await request('/school', 'PATCH', school, student)).status, 403);
  assert.equal(
    (await request('/school', 'PATCH', { ...school, schoolId: 'other-studio-school' })).status,
    400,
  );
  assert.equal((await request('/school', 'PATCH', { ...school, name: '   ' })).status, 400);
  assert.equal((await request('/school', 'PATCH', school)).status, 200);
  for (const cookie of [master, student])
    assert.deepEqual(
      (await (await request('/state', 'GET', undefined, cookie)).json()).school,
      school,
    );
  assert.deepEqual(
    (await (await request('/state', 'GET', undefined, other)).json()).school,
    defaultSchoolSettings,
  );
  // The state object is safe to submit again after a refresh; internal record ids are not returned.
  assert.equal(
    (await request('/school', 'PATCH', (await (await request('/state')).json()).school)).status,
    200,
  );
});
test('school names and detailed character data survive a real server restart without replacing account ids', async () => {
  const before = await (await request('/state')).json();
  await stop();
  await start();
  const after = await (await request('/state')).json();
  assert.equal(after.me.id, before.me.id);
  assert.deepEqual(after.me.appearance, before.me.appearance);
  assert.deepEqual(after.school, before.school);
});

test('profession wardrobe preserves identity and all added choices persist for MASTER and STUDENT', async () => {
  const identity = {
    ...defaultAppearance,
    hairstyle: 17,
    eyeShape: 9,
    eyes: '#278bd4',
    skin: '#513b35',
    hair: '#edc4d6',
    body: 2,
    accessory: 9,
  };
  const identityKeys = [
    'skin',
    'hair',
    'hairstyle',
    'eyes',
    'eyeShape',
    'brows',
    'mouth',
    'expression',
    'accessory',
    'body',
  ] as const;
  for (const preset of professionPresets) {
    const look = { ...identity, ...preset.changes };
    for (const key of identityKeys)
      assert.equal(look[key], identity[key], preset.name + ': ' + key);
    for (const cookie of [master, student]) {
      assert.equal((await request('/me', 'PATCH', { appearance: look }, cookie)).status, 200);
      assert.deepEqual(
        (await (await request('/state', 'GET', undefined, cookie)).json()).me.appearance,
        look,
      );
    }
  }
});
