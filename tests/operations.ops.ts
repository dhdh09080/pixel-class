import { test, expect, request, type BrowserContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { emptyProject, type AppState } from '../shared/types';
import WebSocket from 'ws';
import AxeBuilder from '@axe-core/playwright';

const base = process.env.OPS_BASE_URL!;
const railway = process.env.OPS_DEPLOYMENT_PROFILE === 'railway';
const evidenceDir = process.env.QA_OUTPUT_DIR || (railway ? 'docs/v05' : 'docs/operations');
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

test(`${railway ? 'Railway profile' : 'private Docker'} HTTPS: real MASTER invitation, student character, desk, project, feedback, session security and restored data`, async ({
  browser,
}) => {
  const credentials = {
    master: randomBytes(20).toString('hex'),
    student: randomBytes(20).toString('hex'),
  };
  const contexts: BrowserContext[] = [];
  const newContext = async () => {
    // Real Railway browsers enter through the form. Basic remains a separate API compatibility path.
    const c = await browser.newContext({
      baseURL: base,
      ...(railway ? {} : { httpCredentials: gate }),
    });
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
      const perimeter = await request.newContext({ baseURL: base, httpCredentials: gate });
      try {
        const anonymous = await request.newContext({ baseURL: base, httpCredentials: undefined });
        try {
          expect((await anonymous.get('/')).status()).toBe(401);
          if (railway) {
            expect(await (await anonymous.get('/api/health')).json()).toEqual({ ok: true });
            for (const path of [
              '/api/config',
              '/api/state',
              '/assets/missing.js',
              '/api/health?details=1',
            ])
              expect((await anonymous.get(path)).status()).toBe(401);
            for (const origin of [undefined, 'https://wrong-school.example'])
              expect(
                (
                  await anonymous.post('/access', {
                    headers: origin ? { Origin: origin } : {},
                    form: { code: gate.password },
                    maxRedirects: 0,
                  })
                ).status(),
              ).toBe(403);
            expect(
              (
                await anonymous.get('/api/config', {
                  headers: { Cookie: '__Host-pixel_access=9999999999999.' + '0'.repeat(64) },
                })
              ).status(),
            ).toBe(401);
            // The external judge entrance is a narrow exception to the real Railway gate.
            // Loading an unknown contest must still load the public lazy bundle safely.
            const contest = '/competition/11111111-1111-4111-8111-111111111111';
            const entrance = await anonymous.get(contest);
            expect(entrance.status()).toBe(200);
            const html = await entrance.text();
            expect(html).toContain('/competition-assets/');
            expect(html).not.toContain('src="/assets/');
            const assets = [...html.matchAll(/["'](\/competition-assets\/[^"']+)["']/g)].map(
              (m) => m[1],
            );
            expect(assets.length).toBeGreaterThan(1);
            for (const asset of assets) expect((await anonymous.get(asset)).status()).toBe(200);
            const publicContext = await browser.newContext({ baseURL: base });
            contexts.push(publicContext);
            const publicPage = await publicContext.newPage();
            const privateRequests: string[] = [],
              failedAssets: string[] = [],
              publicErrors: string[] = [];
            publicPage.on('request', (r) => {
              if (/\/api\/(?:config|state)(?:\?|$)/.test(r.url()))
                privateRequests.push(new URL(r.url()).pathname);
            });
            publicPage.on('response', (r) => {
              if (r.url().includes('/competition-assets/') && r.status() >= 400)
                failedAssets.push(new URL(r.url()).pathname);
            });
            publicPage.on('pageerror', (e) => publicErrors.push(e.message));
            await publicPage.goto(contest);
            await expect(publicPage.locator('.competition-public')).toBeVisible();
            await expect(publicPage.getByText('확인이 필요해요', { exact: true })).toBeVisible();
            expect(privateRequests).toEqual([]);
            expect(failedAssets).toEqual([]);
            expect(publicErrors).toEqual([]);
            expect((await publicContext.request.get('/api/state')).status()).toBe(401);
            mkdirSync(evidenceDir, { recursive: true });
            writeFileSync(
              join(evidenceDir, 'competition-gate.json'),
              JSON.stringify(
                {
                  checkedAt: new Date().toISOString(),
                  environment:
                    'isolated Docker Railway profile, real volume and HTTPS gate; not the internet deployment',
                  publicEntrance: entrance.status(),
                  rewrittenAssets: assets.length,
                  lazyComponentLoaded: true,
                  privateRequests,
                  failedAssets,
                  publicErrors,
                  schoolStateStatus: 401,
                },
                null,
                2,
              ) + '\n',
            );
            await publicPage.close();
          }
        } finally {
          await anonymous.dispose();
        }
        expect((await perimeter.get('/api/state')).status()).toBe(401);
        const response = await perimeter.get('/');
        expect(response.headers()['strict-transport-security']).toContain('max-age=31536000');
        expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(
          (await perimeter.post('/api/demo', { headers, data: { role: 'MASTER' } })).status(),
        ).toBe(404);
        expect(
          (
            await perimeter.post('/api/login', {
              headers: { ...headers, Origin: 'not-an-origin' },
              data: {},
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await perimeter.post('/api/login', {
              headers: { ...headers, Origin: base.replace('https:', 'http:') },
              data: {},
            })
          ).status(),
        ).toBe(403);
        expect((await perimeter.post('/api/login', { data: {} })).status()).toBe(403);
        if (railway)
          expect(
            (
              await perimeter.post('/api/login', {
                headers: { ...headers, 'Content-Type': 'application/json' },
                data: '{malformed',
              })
            ).status(),
          ).toBe(400);
      } finally {
        await perimeter.dispose();
      }
    });

    let invitation = '',
      projectId = '',
      attachmentId = '',
      competitionId = '',
      competitionEntryId = '';
    let judge: BrowserContext | undefined;
    let identity: AppState['me'];
    await test.step('two independent password accounts complete the actual UI flow', async () => {
      await masterPage.goto('/');
      if (railway) {
        await expect(masterPage.getByRole('heading', { name: '교실 접근' })).toBeVisible();
        const accessAudit = await new AxeBuilder({ page: masterPage })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(accessAudit.violations).toEqual([]);
        mkdirSync(evidenceDir, { recursive: true });
        for (const viewport of [
          { width: 1366, height: 768 },
          { width: 390, height: 844 },
        ]) {
          await masterPage.setViewportSize(viewport);
          await expect(masterPage.getByRole('button', { name: '계속하기' })).toBeInViewport();
          expect(
            await masterPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await masterPage.screenshot({
            path: `${evidenceDir}/entrance-${viewport.width}x${viewport.height}.png`,
            fullPage: true,
          });
        }
        await masterPage.setViewportSize({ width: 1440, height: 1000 });
        await masterPage.getByLabel('공용 접근 비밀번호').fill('incorrect-access-code');
        await masterPage.getByRole('button', { name: '계속하기' }).click();
        await expect(masterPage.getByRole('alert')).toContainText('다시 확인');
        await masterPage.getByLabel('공용 접근 비밀번호').fill(gate!.password);
        await masterPage.getByRole('button', { name: '계속하기' }).click();
        const pass = (await teacher.cookies()).find((c) => c.name === '__Host-pixel_access');
        expect(pass?.httpOnly).toBe(true);
        expect(pass?.secure).toBe(true);
      }
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
      if (railway) {
        await studentPage.getByLabel('공용 접근 비밀번호').fill(gate!.password);
        await studentPage.getByRole('button', { name: '계속하기' }).click();
        await expect(studentPage.getByLabel('입학 초대 KEY')).toHaveValue(invitation);
      }
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
      if (railway) {
        const cookie = (await student.cookies()).find((c) => c.name === 'pixel_session')!;
        for (const authorization of [
          undefined,
          'Basic ' + Buffer.from('pixel:wrong').toString('base64'),
        ]) {
          const status = await new Promise<number>((resolve, reject) => {
            const socket = new WebSocket(base.replace('https:', 'wss:') + '/socket', {
              headers: {
                Origin: base,
                Cookie: `pixel_session=${cookie.value}`,
                ...(authorization ? { Authorization: authorization } : {}),
              },
              handshakeTimeout: 5000,
            });
            socket.once('open', () => {
              socket.close();
              reject(Error('WSS private gate accepted an unauthorized handshake.'));
            });
            socket.once('unexpected-response', (_req, res) => {
              res.resume();
              socket.terminate();
              resolve(res.statusCode || 0);
            });
            socket.on('error', () =>
              reject(Error('WSS gate did not return the expected HTTP rejection.')),
            );
          });
          expect(status).toBe(401);
        }
      }
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
      if (railway) {
        const disabled = await student.request.post(`/api/projects/${projectId}/ai`, {
          headers,
          data: { text: '연결 상태 확인' },
        });
        expect(disabled.status()).toBe(503);
        expect((await disabled.json()).error).toContain('AI 조교가 꺼져 있어요');
      }

      await masterPage.getByRole('button', { name: '자료실', exact: true }).click();
      await masterPage.getByRole('button', { name: '교안 올리기', exact: true }).click();
      await masterPage.getByRole('dialog').getByLabel('교안 제목').fill('실제 계정 운영 교안');
      await masterPage.getByLabel('교안 파일').setInputFiles({
        name: 'operations-lesson.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('교안 저장 후 학생에게 전달되는 내용'),
      });
      await masterPage.getByRole('button', { name: '교안 저장하기', exact: true }).click();
      await expect(masterPage.getByRole('dialog')).toHaveCount(0);
      await studentPage.keyboard.press('Escape');
      await studentPage.getByRole('button', { name: '자료실', exact: true }).click();
      await studentPage
        .getByRole('button', { name: '실제 계정 운영 교안 미리보기', exact: true })
        .click();
      await expect(studentPage.getByRole('dialog').locator('pre')).toHaveText(
        '교안 저장 후 학생에게 전달되는 내용',
      );
      await studentPage.keyboard.press('Escape');
      await studentPage.getByRole('button', { name: '내 프로젝트', exact: true }).click();
      await studentPage
        .locator('.project-card')
        .filter({ hasText: '운영 검증 데이터 서비스' })
        .click();
      await masterPage.getByRole('button', { name: '교무실', exact: true }).click();
      await masterPage.getByRole('button', { name: '프로젝트 지도', exact: true }).click();
      await masterPage
        .locator('.mentoring-list article')
        .filter({ hasText: '운영 검증 데이터 서비스' })
        .getByRole('button', { name: '프로젝트 지도' })
        .click();
      const masterModal = masterPage.getByRole('dialog');
      await masterModal.getByRole('button', { name: /^MASTER 피드백(?: \d+)?$/ }).click();
      await masterModal.getByLabel('기술 지도 주제').selectOption('DB 설계');
      await masterModal
        .getByRole('textbox', { name: 'MASTER 피드백 내용' })
        .fill('저장 후 다시 조회하는 작은 흐름부터 검증해 보세요.');
      await masterModal.getByRole('button', { name: '피드백 남기기' }).click();
      await expect(modal).toContainText('운영 검증 데이터 서비스');
      await modal.getByRole('button', { name: /^MASTER 피드백(?: \d+)?$/ }).click();
      await expect(modal).toContainText('저장 후 다시 조회하는 작은 흐름');
      await expect
        .poll(async () =>
          (await state(student)).events?.some((e) => e.type === 'mentor.feedback.created'),
        )
        .toBe(true);
      mkdirSync(evidenceDir, { recursive: true });
      await studentPage.screenshot({
        path: `${evidenceDir}/student-feedback.png`,
        fullPage: true,
      });
      if (railway) {
        await studentPage.getByRole('button', { name: '닫기', exact: true }).click();
        await studentPage.getByRole('button', { name: '교실', exact: true }).click();
        for (const viewport of [
          { width: 1366, height: 768 },
          { width: 390, height: 844 },
        ]) {
          await studentPage.setViewportSize(viewport);
          await studentPage.reload();
          await expect(studentPage.locator('canvas')).toBeVisible();
          await expect
            .poll(() =>
              studentPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            )
            .toBe(true);
          await studentPage.screenshot({
            path: `${evidenceDir}/classroom-${viewport.width}x${viewport.height}.png`,
            fullPage: true,
          });
        }
        await studentPage.setViewportSize({ width: 1440, height: 1000 });
      }
      expect(errors).toEqual([]);
      for (const page of [masterPage, studentPage])
        expect(
          await page.evaluate(
            () => (window as unknown as { cspViolations: string[] }).cspViolations,
          ),
        ).toEqual([]);
    });

    if (railway)
      await test.step('an external judge scores an actual frozen work through the real private HTTPS gate', async () => {
        const classes = await (await teacher.request.get('/api/competitions')).json();
        const instant = Date.now(),
          iso = (offset: number) => new Date(instant + offset).toISOString();
        const created = await teacher.request.post('/api/competitions', {
          headers,
          data: {
            name: 'HTTPS 운영 경진대회',
            classId: classes.activeClassId,
            participantIds: [identity.id],
            opensAt: iso(-60000),
            submissionDueAt: iso(15000),
            judgingStartsAt: iso(16000),
            judgingEndsAt: iso(180000),
            resultsAt: iso(181000),
          },
        });
        expect(created.status()).toBe(201);
        competitionId = (await created.json()).id;
        expect(
          (
            await teacher.request.post(`/api/competitions/${competitionId}/action`, {
              headers,
              data: { action: 'publish' },
            })
          ).ok(),
        ).toBe(true);
        const submitted = await student.request.put(`/api/competitions/${competitionId}/entry`, {
          headers,
          data: {
            projectId,
            title: '운영 출품 서비스',
            displayName: '출품작 1',
            serviceUrl: 'https://example.com',
            consentPublic: true,
            intro: {
              serviceName: '운영 출품 서비스',
              purpose: '비공개 학교와 분리된 안전한 심사',
              features: '소개와 평가',
              usage: '설명을 읽고 서비스를 확인해요',
            },
            submit: true,
          },
        });
        expect(submitted.ok()).toBe(true);
        competitionEntryId = (await submitted.json()).id;
        const issued = await teacher.request.post(
          `/api/competitions/${competitionId}/judge-passes`,
          { headers, data: { label: 'HTTPS 독립 심사자', entryIds: [competitionEntryId] } },
        );
        expect(issued.status()).toBe(201);
        const pass = await issued.json();
        judge = await browser.newContext({ baseURL: base });
        contexts.push(judge);
        await expect
          .poll(
            async () =>
              (await (await judge!.request.get(`/api/public/competitions/${competitionId}`)).json())
                .competition.state,
            { timeout: 25000, intervals: [250, 500, 1000] },
          )
          .toBe('JUDGING');
        const page = await judge.newPage(),
          judgeErrors: string[] = [];
        page.on('pageerror', (e) => judgeErrors.push(e.message));
        await page.goto(`/competition/${competitionId}#judge=${pass.key}`);
        await expect(
          page.getByText('HTTPS 독립 심사자 · 심사 연결됨', { exact: true }),
        ).toBeVisible();
        expect(page.url()).not.toContain('#');
        expect(
          (await judge.cookies()).some(
            (c) => c.name === 'pixel_session' || c.name === '__Host-pixel_access',
          ),
        ).toBe(false);
        const cookie = (await judge.cookies()).find((c) => c.name.startsWith('pixel_judge_'))!;
        expect(cookie.secure).toBe(true);
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.sameSite).toBe('Strict');
        await page.getByRole('button', { name: /^작품 살펴보기/ }).click();
        await expect(page.locator('iframe')).toHaveAttribute('sandbox', '');
        await expect(
          page.frameLocator('iframe').getByRole('heading', { name: '서비스 이름', exact: true }),
        ).toBeVisible();
        await expect(
          page.frameLocator('iframe').getByText('운영 출품 서비스', { exact: true }),
        ).toBeVisible();
        for (const [label, value] of [
          ['실무 적용 가능성', '32'],
          ['사용 편의성', '27'],
          ['완성도', '18'],
          ['창의성', '14'],
        ])
          await page.getByLabel(label, { exact: true }).fill(value);
        await page.getByRole('button', { name: '점수 확인하고 제출하기', exact: true }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '평가 최종 제출', exact: true })
          .click();
        await expect(page.getByText('이미 평가한 작품이에요', { exact: true })).toBeVisible();
        expect((await judge.request.get('/api/state')).status()).toBe(401);
        expect(judgeErrors).toEqual([]);
        const detail = await (
          await teacher.request.get(`/api/competitions/${competitionId}`)
        ).json();
        expect(
          detail.results.find((r: { entryId: string }) => r.entryId === competitionEntryId),
        ).toMatchObject({ average: 91, count: 1 });
        mkdirSync(evidenceDir, { recursive: true });
        await page.screenshot({ path: join(evidenceDir, 'real-judge.png'), fullPage: true });
        writeFileSync(
          join(evidenceDir, 'real-judge.json'),
          JSON.stringify(
            {
              checkedAt: new Date().toISOString(),
              environment: 'isolated Docker Railway HTTPS and real mounted volume',
              accountSessions: 2,
              independentJudgeSession: true,
              secureHttpOnlyStrictCookie: true,
              score: 91,
              schoolApiStatus: 401,
              errors: judgeErrors,
            },
            null,
            2,
          ) + '\n',
        );
        await page.close();
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
      if (competitionId) {
        const details = await (
          await teacher.request.get(`/api/competitions/${competitionId}`)
        ).json();
        expect(
          details.results.find((r: { entryId: string }) => r.entryId === competitionEntryId),
        ).toMatchObject({ average: 91, count: 1 });
      }
      expect(after.projects.find((p) => p.id === projectId)!.feedback.at(-1)!.text).toContain(
        '저장 후 다시 조회',
      );
      expect(
        await (
          await student.request.get(`/api/projects/${projectId}/attachments/${attachmentId}`)
        ).text(),
      ).toBe('private operational attachment');
      const details = JSON.parse(docker(['inspect', compose(['ps', '-q', 'app'])]))[0];
      if (railway) {
        expect(details.Config.User).toBe('0:0');
        const status = compose(['exec', '-T', 'app', 'cat', '/proc/1/status']);
        expect(status).toMatch(/Uid:\s+1000\s+1000\s+1000\s+1000/);
        expect(status).toMatch(/Gid:\s+1000\s+1000\s+1000\s+1000/);
        expect(status).toMatch(/CapEff:\s+0000000000000000/);
        expect(Object.keys(details.HostConfig.PortBindings || {})).toEqual([]);
        const storage = JSON.parse(
          compose([
            'exec',
            '-T',
            '--user',
            '1000:1000',
            'app',
            'node',
            '-e',
            "const fs=require('node:fs');console.log(JSON.stringify(['school.sqlite','school.sqlite-wal'].map(name=>{const s=fs.statSync('/app/data/'+name);return {name,bytes:s.size,uid:s.uid,mode:s.mode&511}})))",
          ]),
        );
        for (const file of storage) {
          expect(file.uid).toBe(1000);
          expect(file.mode).toBe(0o600);
        }
        const rss = /VmRSS:\s+(\d+)\s+kB/.exec(status);
        expect(rss).not.toBeNull();
        mkdirSync('docs/v05', { recursive: true });
        writeFileSync(
          'docs/v05/runtime-check.json',
          JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              kind: 'Local Docker Railway-profile QA, not actual Railway metrics',
              port: 8080,
              uid: 1000,
              gid: 1000,
              effectiveCapabilities: 0,
              readOnlyRoot: true,
              publishedAppPorts: [],
              storage,
              serverRssKiB: Number(rss![1]),
              configuredMemoryLimitBytes: details.HostConfig.Memory,
              limitations:
                'One process RSS sample after two-account workflow. Docker aggregate stats are not attributable to this app in this virtualized environment; configured cgroup limits are not proof of enforcement. Not a capacity benchmark or Railway billing observation.',
            },
            null,
            2,
          ) + '\n',
        );
      } else expect(details.Config.User).toBe('node');
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
        'services:\n  app:\n    environment:\n      DATABASE_PATH: /app/data/restored.sqlite\n' +
          (railway ? '      DATABASE_MODE: existing\n' : ''),
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
      if (competitionId) {
        const details = await (
          await teacher.request.get(`/api/competitions/${competitionId}`)
        ).json();
        expect(
          details.results.find((r: { entryId: string }) => r.entryId === competitionEntryId),
        ).toMatchObject({ average: 91, count: 1 });
        expect(
          (await (await judge!.request.get(`/api/public/competitions/${competitionId}`)).json())
            .judge,
        ).toBeUndefined();
      }
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
    await test.step('separate network namespaces exchange WSS, lessons, projects and MASTER feedback', async () => {
      await masterPage.close();
      await studentPage.close();
      const gateway = JSON.parse(docker(['inspect', compose(['ps', '-q', 'https'])]))[0];
      const network = Object.keys(gateway.NetworkSettings.Networks)[0];
      const image = JSON.parse(docker(['inspect', compose(['ps', '-q', 'app'])]))[0].Config.Image;
      const marker = `PEER-${randomBytes(5).toString('hex')}`;
      const outputs = await Promise.all(
        (['MASTER', 'STUDENT'] as const).map((role) => {
          const file = join(config.dir, `peer-${role}.json`);
          writeFileSync(
            file,
            JSON.stringify({
              role,
              origin: base,
              marker,
              gate,
              emptyProject: emptyProject(),
              email: role === 'MASTER' ? 'ops-master@example.com' : 'ops-student@example.com',
              password: role === 'MASTER' ? credentials.master : credentials.student,
            }),
            { mode: 0o600 },
          );
          return new Promise<string>((resolve, reject) =>
            execFile(
              'docker',
              [
                '--host=unix:///var/run/docker.sock',
                'run',
                '--rm',
                '--network',
                network,
                '--read-only',
                '--cap-drop',
                'ALL',
                '--security-opt',
                'no-new-privileges:true',
                '--user',
                `${process.getuid?.() || 0}:${process.getgid?.() || 0}`,
                '--mount',
                `type=bind,src=${file},dst=/run/peer-config.json,readonly`,
                '--mount',
                `type=bind,src=${join(config.dir, 'root.crt')},dst=/run/peer-ca.crt,readonly`,
                '--mount',
                `type=bind,src=${join(process.cwd(), 'tests/fixtures/peer-client.mjs')},dst=/run/peer-client.mjs,readonly`,
                image,
                'node',
                '/run/peer-client.mjs',
              ],
              { env: dockerEnv, timeout: 30000 },
              (error, stdout) => {
                // Do not surface command output or credentials on failure.
                if (error)
                  reject(new Error(`Isolated ${role} network client failed (${error.code}).`));
                else resolve(stdout);
              },
            ),
          );
        }),
      );
      const results = outputs.map((value) => JSON.parse(value.trim()));
      expect(results.every((value) => value.ok && value.httpsChainVerified && value.wss)).toBe(
        true,
      );
      expect(new Set(results.map((value) => value.clientAddress)).size).toBe(2);
      const networkDir = process.env.QA_OUTPUT_DIR || (railway ? 'docs/v05' : 'docs/v04');
      mkdirSync(networkDir, { recursive: true });
      writeFileSync(
        `${networkDir}/network-peers.json`,
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            kind: 'Two isolated Docker network clients; not physical computers or internet deployment',
            results,
          },
          null,
          2,
        ),
      );
    });
  } finally {
    for (const c of contexts) await c.close();
  }
});
