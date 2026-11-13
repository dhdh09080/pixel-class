import { test, expect, type BrowserContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import WebSocket from 'ws';
import AxeBuilder from '@axe-core/playwright';
import { emptyProject, type AppState } from '../shared/types';

const base = process.env.OPS_BASE_URL!;
const headers = { Origin: base, 'X-Pixel-Class': '1' };
const output = 'docs/admissions/qa';
test('public signup → waiting → MASTER approval and class → real HTTPS/WSS classroom → restart persistence', async ({
  browser,
}) => {
  const password = randomBytes(20).toString('hex');
  const contexts: BrowserContext[] = [],
    sockets: WebSocket[] = [],
    errors: string[] = [];
  const teacher = await browser.newContext({ baseURL: base }),
    student = await browser.newContext({ baseURL: base });
  contexts.push(teacher, student);
  const masterPage = await teacher.newPage(),
    studentPage = await student.newPage();
  for (const page of [masterPage, studentPage])
    page.on('pageerror', (error) => errors.push(error.message));
  mkdirSync(output, { recursive: true });
  const getState = async (context: BrowserContext) =>
    (await context.request.get('/api/state')).json() as Promise<AppState>;
  const openSocket = async (context: BrowserContext) => {
    const cookie = (await context.cookies()).map((c) => c.name + '=' + c.value).join('; ');
    const socket = new WebSocket(base.replace('https:', 'wss:') + '/socket', {
      headers: { Origin: base, Cookie: cookie },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return socket;
  };
  try {
    // Isolated QA's first teacher bootstrap remains behind the private perimeter.
    const basic =
      'Basic ' + Buffer.from('pixel:' + process.env.OPS_ACCESS_PASSWORD!).toString('base64');
    const bootstrap = await teacher.request.post('/api/bootstrap', {
      headers: { ...headers, Authorization: basic },
      data: {
        email: 'master@approval.example',
        password,
        name: '테스트 선생님',
        key: process.env.OPS_BOOTSTRAP_KEY,
      },
    });
    expect(bootstrap.status()).toBe(200);
    await teacher.clearCookies();
    await masterPage.goto('/join?login=1');
    await masterPage
      .getByRole('textbox', { name: '이메일', exact: true })
      .fill('master@approval.example');
    await masterPage.getByLabel('비밀번호', { exact: true }).fill(password);
    await masterPage.getByRole('button', { name: '로그인하고 교실로', exact: true }).click();
    await expect(masterPage.locator('canvas')).toBeVisible();

    await studentPage.goto('/');
    await expect(studentPage).toHaveURL(/\/join$/);
    await expect(studentPage.getByRole('heading', { name: '교실에 로그인해요' })).toBeVisible();
    await studentPage.getByRole('button', { name: '회원가입 신청', exact: true }).click();
    await expect(studentPage.getByRole('heading', { name: '먼저 계정을 만들어요' })).toBeVisible();
    await expect(studentPage.getByLabel('입학 초대 KEY')).toHaveCount(0);
    await studentPage
      .getByRole('textbox', { name: '이메일', exact: true })
      .fill('student@approval.example');
    await studentPage.getByLabel('비밀번호', { exact: true }).fill(password);
    await studentPage.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await studentPage.getByRole('button', { name: '다음: 캐릭터 선택' }).click();
    await studentPage.getByRole('textbox', { name: '이름', exact: true }).fill('승인 테스트 학생');
    await studentPage.getByRole('button', { name: '캐릭터 스타일 2', exact: true }).click();
    await studentPage.getByRole('button', { name: '가입 신청 보내기', exact: true }).click();
    await expect(studentPage.getByRole('heading', { name: '가입 신청을 보냈어요' })).toBeVisible();
    expect((await student.request.get('/api/state')).status()).toBe(401);
    expect(
      (await student.request.post('/api/enrollment/enter', { headers, data: {} })).status(),
    ).toBe(403);
    const pending = await (await student.request.get('/api/enrollment/session')).json();
    expect(pending.status).toBe('PENDING');
    expect(pending.appearance.hairstyle).toBe(1);
    const pendingCookie = (await student.cookies()).map((c) => c.name + '=' + c.value).join('; ');
    await new Promise<void>((resolve, reject) => {
      const denied = new WebSocket(base.replace('https:', 'wss:') + '/socket', {
        headers: { Origin: base, Cookie: pendingCookie },
      });
      denied.on('open', () => {
        denied.close();
        reject(Error('Applicant WSS accepted'));
      });
      denied.on('unexpected-response', (_req, response) => {
        expect(response.statusCode).toBe(401);
        response.resume();
        denied.terminate();
        resolve();
      });
      denied.on('error', () => resolve());
    });
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await studentPage.setViewportSize(viewport);
      await studentPage.screenshot({
        path: join(output, 'waiting-' + viewport.width + '.png'),
        fullPage: true,
      });
      expect(
        await studentPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page: studentPage })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await studentPage.reload();
    await expect(studentPage.getByRole('heading', { name: '가입 신청을 보냈어요' })).toBeVisible();

    await masterPage.getByRole('button', { name: '교무실', exact: true }).click();
    await masterPage.getByRole('button', { name: /가입 승인/ }).click();
    await masterPage
      .getByRole('textbox', { name: '새 반 이름', exact: true })
      .fill('다희의 AI 2반');
    await masterPage.getByRole('button', { name: '반 만들기', exact: true }).click();
    await expect(masterPage.getByRole('textbox', { name: '새 반 이름', exact: true })).toHaveValue(
      '',
    );
    await masterPage
      .getByLabel('배정할 반 · 승인 테스트 학생', { exact: true })
      .selectOption({ label: '다희의 AI 2반' });
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await masterPage.setViewportSize(viewport);
      await masterPage.screenshot({
        path: join(output, 'master-approval-' + viewport.width + '.png'),
        fullPage: true,
      });
      expect(
        await masterPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
    await masterPage.getByRole('button', { name: '승인하고 반 배정', exact: true }).click();
    await expect(
      masterPage.getByText('승인을 기다리는 학생이 없어요', { exact: true }),
    ).toBeVisible();
    await studentPage.getByRole('button', { name: '승인 상태 새로고침', exact: true }).click();
    await expect(studentPage.getByText('내 반 · 다희의 AI 2반', { exact: true })).toBeVisible();
    await studentPage.getByRole('button', { name: '교실 입장하기', exact: true }).click();
    await expect(studentPage.locator('canvas')).toBeVisible();
    const active = await getState(student);
    expect(active.me.status).toBe('ACTIVE');
    expect(active.me.deskId).toBeTruthy();
    expect(active.classes?.find((group) => group.id === active.me.classId)?.name).toBe(
      '다희의 AI 2반',
    );
    await openSocket(teacher);
    await openSocket(student);
    await expect.poll(async () => (await getState(teacher)).online.length).toBe(2);
    const created = await student.request.post('/api/projects', {
      headers,
      data: { ...emptyProject(), title: '승인 후 첫 프로젝트' },
    });
    expect(created.status()).toBe(201);
    const project = await created.json();
    await studentPage.reload();
    await expect(studentPage.locator('canvas')).toBeVisible();
    expect((await getState(student)).projects.some((p) => p.id === project.id)).toBe(true);
    sockets.forEach((socket) => socket.close());
    const config = JSON.parse(readFileSync(process.env.OPS_CONFIG_FILE!, 'utf8'));
    const dockerEnv = { ...process.env };
    for (const key of [
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_TLS',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
    ])
      delete dockerEnv[key];
    execFileSync(
      'docker',
      ['--host=unix:///var/run/docker.sock', ...config.composeArgs, 'restart', 'app'],
      { env: dockerEnv, stdio: 'pipe' },
    );
    await expect
      .poll(
        async () => {
          try {
            return (await student.request.get('/api/state')).status();
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBe(200);
    const restored = await getState(student);
    expect(restored.me.deskId).toBe(active.me.deskId);
    expect(restored.me.classId).toBe(active.me.classId);
    expect(restored.projects.some((p) => p.id === project.id)).toBe(true);
    await studentPage.goto('/join');
    await studentPage.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(studentPage.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    expect((await student.request.get('/api/state')).status()).toBe(401);
    expect(errors).toEqual([]);
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify(
        {
          environment: 'isolated Docker Railway HTTPS profile, not production student accounts',
          signupWithoutCode: true,
          approvalAndClass: true,
          pendingApiAndWssDenied: true,
          approvedWss101: 2,
          restartPersistence: true,
          mobileAndLaptop: true,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    sockets.forEach((socket) => socket.close());
    await Promise.all(contexts.map((context) => context.close()));
  }
});
