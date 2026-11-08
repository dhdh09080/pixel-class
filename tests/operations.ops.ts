import { test, expect, request, type BrowserContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { emptyProject, type AppState } from '../shared/types';

const base = process.env.OPS_BASE_URL!;
const headers = { 'X-Pixel-Class': '1', Origin: base };
const gate = {
  username: process.env.OPS_ACCESS_USER!,
  password: process.env.OPS_ACCESS_PASSWORD!,
  send: 'always' as const,
};
const config = JSON.parse(readFileSync(process.env.OPS_CONFIG_FILE!, 'utf8')) as {
  project: string;
  composeArgs: string[];
  dir: string;
};
const dockerEnv = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[key];
function docker(args: string[]) {
  return execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env: dockerEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
const compose = (args: string[]) => docker([...config.composeArgs, ...args]);
const state = async (context: BrowserContext): Promise<AppState> =>
  (await context.request.get('/api/state')).json();

test('private Docker HTTPS: real MASTER invitation, student character, desk, project, feedback, session security and restored data', async ({
  browser,
}) => {
  const credentials = {
    master: randomBytes(20).toString('hex'),
    student: randomBytes(20).toString('hex'),
  };
  const contexts: BrowserContext[] = [];
  const newContext = async () => {
    const c = await browser.newContext({ baseURL: base, httpCredentials: gate });
    contexts.push(c);
    return c;
  };
  const teacher = await newContext(),
    student = await newContext();
  const masterPage = await teacher.newPage(),
    studentPage = await student.newPage();
  const errors: string[] = [];
  for (const page of [masterPage, studentPage]) {
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      (window as unknown as { cspViolations: string[] }).cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        (window as unknown as { cspViolations: string[] }).cspViolations.push(e.violatedDirective),
      );
    });
  }
  try {
    await test.step('TLS gate and unauthenticated access fail closed', async () => {
      const anonymous = await request.newContext({ baseURL: base, httpCredentials: undefined });
      try {
        expect((await anonymous.get('/')).status()).toBe(401);
      } finally {
        await anonymous.dispose();
      }
      expect((await teacher.request.get('/api/state')).status()).toBe(401);
      const response = await teacher.request.get('/');
      expect(response.headers()['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(
        (await teacher.request.post('/api/demo', { headers, data: { role: 'MASTER' } })).status(),
      ).toBe(404);
      expect(
        (
          await teacher.request.post('/api/login', {
            headers: { ...headers, Origin: 'not-an-origin' },
            data: {},
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await teacher.request.post('/api/login', {
            headers: { ...headers, Origin: base.replace('https:', 'http:') },
            data: {},
          })
        ).status(),
      ).toBe(403);
      expect((await teacher.request.post('/api/login', { data: {} })).status()).toBe(403);
    });

    let invitation = '',
      projectId = '',
      attachmentId = '';
    let identity: AppState['me'];
    await test.step('two independent password accounts complete the actual UI flow', async () => {
      await masterPage.goto('/');
      await masterPage.getByLabel('부트스트랩 KEY').fill(process.env.OPS_BOOTSTRAP_KEY!);
      await masterPage.getByLabel('이름', { exact: true }).fill('운영 검증 선생님');
      await masterPage.getByLabel('이메일').fill('ops-master@example.com');
      await masterPage.getByLabel('비밀번호', { exact: true }).fill(credentials.master);
      await masterPage.getByRole('button', { name: 'MASTER로 학교 시작하기' }).click();
      await expect(masterPage.locator('canvas')).toBeVisible();
      await expect(masterPage.locator('.map-online')).toContainText('1명');
      await expect(masterPage.locator('.demo-switch')).toHaveCount(0);
      const masterCookie = (await teacher.cookies()).find((c) => c.name === 'pixel_session')!;
      expect(masterCookie.secure).toBe(true);
      expect(masterCookie.httpOnly).toBe(true);
      expect(masterCookie.sameSite).toBe('Strict');
      expect(
        (
          await teacher.request.post('/api/bootstrap', {
            headers,
            data: {
              key: process.env.OPS_BOOTSTRAP_KEY,
              name: '추가 MASTER',
              email: 'second-master@example.com',
              password: credentials.master,
            },
          })
        ).status(),
      ).toBe(409);
      await masterPage.getByRole('button', { name: '교무실', exact: true }).click();
      await masterPage.getByRole('button', { name: '입학 초대', exact: true }).click();
      await masterPage.getByRole('textbox', { name: '초대 이름' }).fill('비공개 운영 검증 학생');
      await masterPage.getByRole('button', { name: '초대 발급', exact: true }).click();
      invitation = await masterPage.locator('.invite-result code').innerText();
      expect(invitation.length).toBeGreaterThan(20);
      await studentPage.goto('/?invite=' + encodeURIComponent(invitation));
      await studentPage.getByLabel('이름', { exact: true }).fill('운영 검증 학생');
      await studentPage.getByLabel('이메일').fill('ops-student@example.com');
      await studentPage.getByLabel('비밀번호', { exact: true }).fill(credentials.student);
      await studentPage.getByRole('button', { name: '나의 캐릭터 꾸미기' }).click();
      await studentPage.getByRole('button', { name: '머리카락 #925b32' }).click();
      await studentPage.getByRole('button', { name: '이 모습으로 저장하기' }).click();
      await studentPage.getByRole('button', { name: '입학하고 교실 입장하기' }).click();
      await expect(studentPage.locator('canvas')).toBeVisible();
      const signed = await state(student);
      identity = signed.me;
      expect(signed.demo).toBe(false);
      expect(identity.role).toBe('STUDENT');
      expect(identity.appearance.hair).toBe('#925b32');
      expect(signed.desks.some((d) => d.id === identity.deskId)).toBe(true);
      expect(
        (
          await student.request.post('/api/invitations', { headers, data: { label: '금지' } })
        ).status(),
      ).toBe(403);
      await student.request.patch('/api/me', {
        headers,
        data: { role: 'MASTER', schoolId: 'attacker-school' },
      });
      expect((await state(student)).me.role).toBe('STUDENT');
      const replay = await request.newContext({ baseURL: base, httpCredentials: gate });
      try {
        expect(
          (
            await replay.post('/api/register', {
              headers,
              data: {
                key: invitation,
                name: '초대 재사용',
                email: 'replay@example.com',
                password: credentials.student,
                appearance: identity.appearance,
              },
            })
          ).status(),
        ).toBe(400);
      } finally {
        await replay.dispose();
      }

      await masterPage.getByRole('button', { name: '교실', exact: true }).click();
      await expect(masterPage.locator('.map-online')).toContainText('2명');
      const moves: { userId?: string; x?: number }[] = [];
      masterPage.on('websocket', (socket) =>
        socket.on('framereceived', (frame) => {
          try {
            const v = JSON.parse(String(frame.payload));
            if (v.type === 'move') moves.push(v);
          } catch {}
        }),
      );
      await masterPage.reload();
      await expect(masterPage.locator('canvas')).toBeVisible();
      await expect(masterPage.locator('.map-online')).toContainText('2명');
      await studentPage.keyboard.down('ArrowRight');
      await studentPage.waitForTimeout(350);
      await studentPage.keyboard.up('ArrowRight');
      await expect
        .poll(() => moves.some((m) => m.userId === identity.id && Number(m.x) > 580))
        .toBe(true);

      await studentPage.getByRole('button', { name: '내 프로젝트', exact: true }).click();
      await studentPage.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
      const modal = studentPage.getByRole('dialog');
      await modal.getByLabel('프로젝트 이름').fill('운영 검증 데이터 서비스');
      await modal
        .getByLabel('프로젝트 목적')
        .fill('실제 계정의 비공개 기록과 피드백을 확인합니다.');
      await modal.getByLabel('주요 기능').fill('기록 저장과 조회');
      await modal.getByRole('button', { name: '프로젝트 시작하기' }).click();
      await expect(modal).toContainText('운영 검증 데이터 서비스');
      const created = (await state(student)).projects.find(
        (p) => p.title === '운영 검증 데이터 서비스',
      )!;
      projectId = created.id;
      const upload = await student.request.post(`/api/projects/${projectId}/attachments`, {
        headers,
        data: {
          fileName: 'operations-note.txt',
          content: Buffer.from('private operational attachment').toString('base64'),
        },
      });
      expect(upload.status()).toBe(201);
      attachmentId = (await upload.json()).id;
      expect(
        (
          await student.request.post(`/api/projects/${projectId}/entries`, {
            headers,
            data: { type: 'feedback', text: '학생의 무단 피드백' },
          })
        ).status(),
      ).toBe(403);
      const ownMaster = await (
        await teacher.request.post('/api/projects', {
          headers,
          data: { ...emptyProject(), title: 'MASTER 비공개 자료' },
        })
      ).json();
      expect((await state(student)).projects.some((p) => p.id === ownMaster.id)).toBe(false);
      expect(
        (
          await student.request.patch(`/api/projects/${ownMaster.id}`, {
            headers,
            data: { title: '변조' },
          })
        ).status(),
      ).toBe(403);
      const teacherFile = await (
        await teacher.request.post(`/api/projects/${ownMaster.id}/attachments`, {
          headers,
          data: {
            fileName: 'teacher-private.txt',
            content: Buffer.from('teacher-only').toString('base64'),
          },
        })
      ).json();
      expect(
        (
          await student.request.get(`/api/projects/${ownMaster.id}/attachments/${teacherFile.id}`)
        ).status(),
      ).toBe(403);
      expect(
        (
          await student.request.post(`/api/projects/${projectId}/ai`, {
            headers,
            data: { text: '다음 한 걸음을 알려 주세요.' },
          })
        ).status(),
      ).toBe(503);
      expect((await state(student)).aiConfigured).toBe(false);

      await masterPage.getByRole('button', { name: '교무실', exact: true }).click();
      await masterPage.getByRole('button', { name: '프로젝트 지도', exact: true }).click();
      await masterPage
        .locator('.mentoring-list article')
        .filter({ hasText: '운영 검증 데이터 서비스' })
        .getByRole('button', { name: '프로젝트 지도' })
        .click();
      const masterModal = masterPage.getByRole('dialog');
      await masterModal.getByRole('button', { name: 'MASTER 피드백', exact: true }).click();
      await masterModal.getByLabel('기술 지도 주제').selectOption('DB 설계');
      await masterModal
        .getByRole('textbox', { name: 'MASTER 피드백 내용' })
        .fill('저장 후 다시 조회하는 작은 흐름부터 검증해 보세요.');
      await masterModal.getByRole('button', { name: '피드백 남기기' }).click();
      await expect(modal).toContainText('운영 검증 데이터 서비스');
      await modal.getByRole('button', { name: 'MASTER 피드백', exact: true }).click();
      await expect(modal).toContainText('저장 후 다시 조회하는 작은 흐름');
      await expect
        .poll(async () =>
          (await state(student)).events?.some((e) => e.type === 'mentor.feedback.created'),
        )
        .toBe(true);
      mkdirSync('docs/operations', { recursive: true });
      await studentPage.screenshot({
        path: 'docs/operations/student-feedback.png',
        fullPage: true,
      });
      expect(errors).toEqual([]);
      for (const page of [masterPage, studentPage])
        expect(
          await page.evaluate(
            () => (window as unknown as { cspViolations: string[] }).cspViolations,
          ),
        ).toEqual([]);
    });

    await test.step('session rotation and logout invalidate the previous cookie', async () => {
      const old = (await student.cookies()).find((c) => c.name === 'pixel_session')!;
      const login = await student.request.post('/api/login', {
        headers,
        data: { email: 'ops-student@example.com', password: credentials.student },
      });
      expect(login.status()).toBe(200);
      const revoked = await request.newContext({
        baseURL: base,
        httpCredentials: gate,
        extraHTTPHeaders: { Cookie: `pixel_session=${old.value}` },
      });
      try {
        expect((await revoked.get('/api/state')).status()).toBe(401);
      } finally {
        await revoked.dispose();
      }
      expect(
        (
          await student.request.post('/api/login', {
            headers,
            data: { email: 'ops-student@example.com', password: 'wrong-password-value' },
          })
        ).status(),
      ).toBe(401);
    });

    await test.step('container recreation keeps accounts, desks, projects, files and feedback', async () => {
      const before = compose(['ps', '-q', 'app']);
      compose(['up', '--detach', '--no-deps', '--force-recreate', '--wait', 'app']);
      expect(compose(['ps', '-q', 'app'])).not.toBe(before);
      await expect.poll(async () => (await student.request.get('/api/health')).status()).toBe(200);
      const after = await state(student);
      expect(after.me.id).toBe(identity.id);
      expect(after.me.deskId).toBe(identity.deskId);
      expect(after.me.appearance).toEqual(identity.appearance);
      expect(after.projects.find((p) => p.id === projectId)!.feedback.at(-1)!.text).toContain(
        '저장 후 다시 조회',
      );
      expect(
        await (
          await student.request.get(`/api/projects/${projectId}/attachments/${attachmentId}`)
        ).text(),
      ).toBe('private operational attachment');
      const details = JSON.parse(docker(['inspect', compose(['ps', '-q', 'app'])]))[0];
      expect(details.Config.User).toBe('node');
      expect(details.HostConfig.ReadonlyRootfs).toBe(true);
      expect(details.HostConfig.PortBindings['3001/tcp']).toBeUndefined();
      expect(
        details.Mounts.some(
          (m: { Type: string; Destination: string }) =>
            m.Type === 'volume' && m.Destination === '/app/data',
        ),
      ).toBe(true);
      expect(details.State.Health.Status).toBe('healthy');
    });

    await test.step('online backup restores to a fresh database and revokes restored sessions', async () => {
      const snapshot = JSON.parse(
        compose([
          'exec',
          '-T',
          'app',
          'node',
          'scripts/database.mjs',
          'backup',
          '/app/data/school.sqlite',
          '/app/data/verified-backup.sqlite',
        ]),
      );
      expect(snapshot.ok).toBe(true);
      expect(snapshot.counts.users).toBe(2);
      compose(['stop', 'app']);
      const stopped = JSON.parse(docker(['inspect', compose(['ps', '--all', '-q', 'app'])]))[0];
      expect(stopped.State.ExitCode).toBe(0);
      const restored = JSON.parse(
        compose([
          'run',
          '--rm',
          '--no-deps',
          'app',
          'node',
          'scripts/database.mjs',
          'restore',
          '/app/data/verified-backup.sqlite',
          '/app/data/restored.sqlite',
        ]),
      );
      expect(restored.sessionsInvalidated).toBe(true);
      expect(restored.counts.sessions).toBe(0);
      const overlay = join(config.dir, 'restore.yaml');
      writeFileSync(
        overlay,
        'services:\n  app:\n    environment:\n      DATABASE_PATH: /app/data/restored.sqlite\n',
        { mode: 0o600 },
      );
      docker([
        ...config.composeArgs,
        '-f',
        overlay,
        'up',
        '--detach',
        '--no-deps',
        '--force-recreate',
        '--wait',
        'app',
      ]);
      expect((await student.request.get('/api/state')).status()).toBe(401);
      for (const [c, email, password] of [
        [teacher, 'ops-master@example.com', credentials.master],
        [student, 'ops-student@example.com', credentials.student],
      ] as const)
        expect(
          (await c.request.post('/api/login', { headers, data: { email, password } })).status(),
        ).toBe(200);
      const after = await state(student);
      expect(after.me.id).toBe(identity.id);
      expect(after.me.deskId).toBe(identity.deskId);
      expect(after.me.appearance).toEqual(identity.appearance);
      expect(after.projects.find((p) => p.id === projectId)!.feedback.at(-1)!.text).toContain(
        '저장 후 다시 조회',
      );
      expect(
        await (
          await student.request.get(`/api/projects/${projectId}/attachments/${attachmentId}`)
        ).text(),
      ).toBe('private operational attachment');
      const current = (await student.cookies()).find((c) => c.name === 'pixel_session')!;
      expect((await student.request.post('/api/logout', { headers, data: {} })).status()).toBe(200);
      const revoked = await request.newContext({
        baseURL: base,
        httpCredentials: gate,
        extraHTTPHeaders: { Cookie: `pixel_session=${current.value}` },
      });
      try {
        expect((await revoked.get('/api/state')).status()).toBe(401);
      } finally {
        await revoked.dispose();
      }
      expect(errors).toEqual([]);
    });
  } finally {
    for (const c of contexts) await c.close();
  }
});
