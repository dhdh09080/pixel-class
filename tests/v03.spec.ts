import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { emptyProject, defaultAppearance } from '../shared/types';
const headers = { 'X-Pixel-Class': '1' };
const open = async (page: Page) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-online')).toContainText('접속 중');
};
test('dialog has a name, keeps border clicks inside, restores focus and supports reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const trigger = page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '교실 속 나의 모습', exact: true });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 0.5, box.y + 0.5);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
test('two actual pages preserve both task additions and reject a stale form while retaining the draft', async ({
  page,
  context,
}) => {
  await open(page);
  const p = await (
    await context.request.post('/api/projects', {
      headers,
      data: { ...emptyProject(), title: 'v03 동시 작업' },
    })
  ).json();
  const other = await context.newPage();
  await open(other);
  for (const tab of [page, other]) {
    await tab.getByRole('button', { name: '내 프로젝트', exact: true }).click();
    await tab.locator('.project-card').filter({ hasText: p.title }).click();
  }
  await page.getByLabel('새 할 일', { exact: true }).fill('브라우저 A의 작업');
  await other.getByLabel('새 할 일', { exact: true }).fill('브라우저 B의 작업');
  await Promise.all([
    page.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click(),
    other.getByRole('dialog').getByRole('button', { name: '추가', exact: true }).click(),
  ]);
  for (const tab of [page, other])
    await expect(tab.getByRole('dialog').locator('.task-item')).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: '수정', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('보관할 로컬 초안');
  const latest = await (await context.request.get('/api/state')).json();
  const revision = latest.projects.find((v: any) => v.id === p.id).revision;
  expect(
    (
      await context.request.patch(`/api/projects/${p.id}`, {
        headers: { ...headers, 'If-Match': `"${revision}"` },
        data: { title: '다른 탭에서 저장한 제목' },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('다른 화면');
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('보관할 로컬 초안');
  expect(
    (await (await context.request.get('/api/state')).json()).projects.find(
      (v: any) => v.id === p.id,
    ).title,
  ).toBe('다른 탭에서 저장한 제목');
  await other.close();
});
test('mobile classroom keeps readable native pixels and touch movement stops on release and modal open', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width),
  ).toBeLessThanOrEqual(600);
  const right = page.getByRole('button', { name: '터치로 오른쪽 이동', exact: true });
  const box = (await right.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  const world = page.locator('.game-host');
  const x = Number(await world.getAttribute('data-x'));
  await right.dispatchEvent('pointerdown', { pointerId: 1 });
  await page.waitForTimeout(400);
  await right.dispatchEvent('pointerup', { pointerId: 1 });
  await expect.poll(async () => Number(await world.getAttribute('data-x'))).toBeGreaterThan(x + 20);
  await page.waitForTimeout(120);
  const stopped = await world.getAttribute('data-x');
  await page.waitForTimeout(250);
  expect(await world.getAttribute('data-x')).toBe(stopped);
  await page.getByRole('button', { name: '교실 조작 안내', exact: true }).click();
  await right.dispatchEvent('pointerdown', { pointerId: 2 });
  await page.waitForTimeout(200);
  await right.dispatchEvent('pointerup', { pointerId: 2 });
  expect(await world.getAttribute('data-x')).toBe(stopped);
});
test('MASTER student counters filter students and prioritize unanswered questions', async ({
  page,
}) => {
  await open(page);
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await page.getByRole('button', { name: '교무실', exact: true }).click();
  await page.getByRole('button', { name: '학생·프로젝트 현황 4개 더 보기', exact: true }).click();
  await page.getByRole('button', { name: /^휴학생/ }).click();
  await expect(page.getByRole('button', { name: '학생과 학적', exact: true })).toHaveClass(
    /selected/,
  );
  await expect(page.getByRole('combobox', { name: '학생 학적 필터' })).toHaveValue('ON_LEAVE');
});
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 720],
  [390, 844],
])
  test(`v03 layout and WCAG 2.2 AA checks at ${width}x${height}`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const foot = await page
      .locator('.environment-bar')
      .evaluate((e) => getComputedStyle(e).position);
    expect(foot).not.toBe('fixed');
    const p = await (
      await context.request.post('/api/projects', {
        headers,
        data: {
          ...emptyProject(),
          title: `${width}px ` + '긴 한국어 제목을 안전하게 줄바꿈하는 프로젝트 '.repeat(3),
          purpose: '작은 화면에서도 다음 할 일을 찾을 수 있어야 합니다.'.repeat(12),
        },
      })
    ).json();
    await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
    await page.locator('.project-card').filter({ hasText: p.title }).click();
    const dialog = page.getByRole('dialog');
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
  });

test('character preview updates instantly, cancellation discards changes, and keyboard groups remain usable', async ({
  page,
  context,
}) => {
  await open(page);
  const original = (await (await context.request.get('/api/state')).json()).me;
  await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const avatar = dialog.locator('.avatar');
  const image = await avatar.getAttribute('src');
  await dialog
    .getByLabel('헤어스타일', { exact: true })
    .selectOption(String((original.appearance.hairstyle + 1) % 3));
  await expect(avatar).not.toHaveAttribute('src', image!);
  await dialog.getByLabel('이름', { exact: true }).fill('저장하지 않을 이름');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await context.request.get('/api/state')).json()).me).toEqual(original);
});

test('material preview treats uploaded markup as text and upload errors preserve the form', async ({
  page,
}) => {
  await open(page);
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await page.getByRole('button', { name: '자료실', exact: true }).click();
  await page.getByRole('button', { name: '교안 올리기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('교안 제목').fill('v03 안전한 원문 미리보기');
  await dialog.getByLabel('교안 파일').setInputFiles({
    name: 'disguised.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a png'),
  });
  await dialog.getByRole('button', { name: '교안 저장하기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('교안 제목')).toHaveValue('v03 안전한 원문 미리보기');
  const content =
    '# 안전한 교안\n<img src=x onerror="window.__executed=true">\n<script>window.__executed=true</script>';
  await dialog
    .getByLabel('교안 파일')
    .setInputFiles({ name: 'safe.md', mimeType: 'text/markdown', buffer: Buffer.from(content) });
  await dialog.getByRole('button', { name: '교안 저장하기', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('button', { name: 'v03 안전한 원문 미리보기 미리보기', exact: true })
    .click();
  await expect(dialog.locator('pre')).toHaveText(content);
  expect(await page.evaluate(() => (window as any).__executed)).toBeUndefined();
  await expect(dialog.locator('img,script')).toHaveCount(0);
});

test('stationary classroom does not continuously flood the WebSocket with identical poses', async ({
  page,
}) => {
  let frames = 0;
  page.on('websocket', (socket) => socket.on('framesent', () => frames++));
  await open(page);
  await page.waitForTimeout(300);
  const idle = frames;
  await page.waitForTimeout(1200);
  expect(frames - idle).toBeLessThanOrEqual(1);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await expect.poll(() => frames).toBeGreaterThan(idle + 1);
});

for (const width of [1366, 390])
  test(`all main screens pass expanded accessibility checks at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    const audit = async () => {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    };
    await open(page);
    await audit();
    await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
    await audit();
    await page.locator('.project-card').first().click();
    await audit();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '나의 캐릭터 꾸미기', exact: true }).click();
    await audit();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '자료실', exact: true }).click();
    await audit();
    await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
    await page.getByRole('button', { name: '교무실', exact: true }).click();
    await audit();
    await page.getByRole('button', { name: '학생·프로젝트 현황 4개 더 보기', exact: true }).click();
    await audit();
    await page.goto('/?invite=ACCESSIBILITY-TEST-ONLY');
    await expect(page.getByLabel('입학 초대 KEY')).toBeVisible();
    await audit();
  });

test('repeated appearance changes release obsolete game textures', async ({ page, context }) => {
  await open(page);
  const world = page.locator('.game-host');
  const initial = (await (await context.request.get('/api/state')).json()).me.appearance;
  for (let i = 0; i < 5; i++) {
    const response = await context.request.patch('/api/me', {
      headers,
      data: {
        appearance: {
          ...initial,
          hair: ['#353044', '#414855', '#593827', '#8a624b', '#715663'][i],
        },
      },
    });
    expect(response.status()).toBe(200);
    const state = await (await context.request.get('/api/state')).json();
    const activeAppearances = new Set(
      state.members
        .filter((m: any) => m.status === 'ACTIVE')
        .map((m: any) => JSON.stringify(m.appearance)),
    ).size;
    await expect
      .poll(async () => Number(await world.getAttribute('data-character-textures')))
      .toBeLessThanOrEqual(activeAppearances * 13);
    await expect(world).toHaveAttribute('data-world-textures', '1');
  }
});

test('expanded classroom releases replaced floor textures', async ({ page, context }) => {
  await open(page);
  await page.locator('.demo-switch').getByRole('button', { name: 'MASTER', exact: true }).click();
  await expect(page.locator('.header-profile small')).toHaveText('MASTER');
  const world = page.locator('.game-host');
  for (let i = 0; i < 3; i++) {
    const state = await (await context.request.get('/api/state')).json();
    const y =
      307 + (Math.floor((Math.max(...state.desks.map((d: any) => d.y)) - 307) / 180) + 1) * 180;
    const response = await context.request.post('/api/desks', { headers, data: { x: 300, y } });
    expect(response.status()).toBe(200);
    await expect
      .poll(async () => Number(await world.getAttribute('data-world-height')))
      .toBeGreaterThan(state.world.height);
    await expect(world).toHaveAttribute('data-world-textures', '1');
  }
});

test('sitting follows a safe route to the assigned chair and movement exits the seated pose', async ({
  page,
  context,
}) => {
  await open(page);
  const state = await (await context.request.get('/api/state')).json();
  const desk = state.desks.find((d: any) => d.id === state.me.deskId);
  const world = page.locator('.game-host');
  await page.getByRole('button', { name: '책상에 앉기', exact: true }).click();
  await expect(world).toHaveAttribute('data-seated', 'true', { timeout: 15000 });
  const x = Number(await world.getAttribute('data-x')),
    y = Number(await world.getAttribute('data-y'));
  expect(Math.hypot(x - desk.x, y - desk.y - 80)).toBeLessThan(6);
  await page.locator('canvas').screenshot({ path: 'docs/v03/qa/seated-classroom.png' });
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowDown');
  await expect(world).toHaveAttribute('data-seated', 'false');
  expect(Number(await world.getAttribute('data-y'))).toBeGreaterThan(y);
});

test('form boundaries have 3:1 non-text contrast and mobile fields avoid small-text zoom', async ({
  page,
}) => {
  const luminance = (color: string) => {
    const channels = (color.match(/[\d.]+/g) || [])
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await open(page);
    await page.getByRole('button', { name: '프로젝트 추가', exact: true }).click();
    const controls = await page
      .getByRole('dialog')
      .locator('.field input, .field textarea, .field select')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const s = getComputedStyle(element);
          return {
            border: s.borderTopColor,
            background: s.backgroundColor,
            size: parseFloat(s.fontSize),
          };
        }),
      );
    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      const a = luminance(control.border),
        b = luminance(control.background);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        JSON.stringify(control),
      ).toBeGreaterThanOrEqual(3);
      if (width === 390) expect(control.size).toBeGreaterThanOrEqual(16);
    }
  }
});

test('another tab deleting a project preserves an editing draft and offers a clear way back', async ({
  page,
  context,
}) => {
  await open(page);
  const p = await (
    await context.request.post('/api/projects', {
      headers,
      data: { ...emptyProject(), title: '다른 탭 삭제 검증' },
    })
  ).json();
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: p.title }).click();
  await page.getByRole('dialog').getByRole('button', { name: '수정', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('보존해야 하는 미저장 초안');
  const other = await context.newPage();
  await open(other);
  await other.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await other.locator('.project-card').filter({ hasText: p.title }).click();
  await other.getByRole('button', { name: '프로젝트 삭제', exact: true }).click();
  await other.getByRole('button', { name: '삭제 확인', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('삭제');
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('보존해야 하는 미저장 초안');
  await expect(page.getByRole('button', { name: '변경사항 저장', exact: true })).toBeDisabled();
  await dialog.screenshot({ path: 'docs/v03/qa/deleted-project-draft.png' });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: '프로젝트를 열 수 없어요', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '프로젝트 목록으로', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '교실', exact: true }).click();
  await expect(page.locator('.map-online')).toContainText('접속 중');
  const world = page.locator('.game-host'),
    x = Number(await world.getAttribute('data-x'));
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => Number(await world.getAttribute('data-x'))).toBeGreaterThan(x + 15);
  await other.close();
});

test('a retained draft never appears for a different account after session loss and login', async ({
  page,
  context,
  browser,
}) => {
  await open(page);
  await page.getByRole('button', { name: /교실 이야기/ }).click();
  await page
    .getByRole('textbox', { name: '교실 채팅 메시지' })
    .fill('계정 전환 시 지울 미전송 대화');
  const p = await (
    await context.request.post('/api/projects', {
      headers,
      data: {
        ...emptyProject(),
        title: '이전 계정의 비공개 프로젝트',
        purpose: '다른 계정에 보이면 안 되는 내용',
      },
    })
  ).json();
  await page.getByRole('button', { name: '내 프로젝트', exact: true }).click();
  await page.locator('.project-card').filter({ hasText: p.title }).click();
  await page.getByRole('dialog').getByRole('button', { name: '수정', exact: true }).click();
  await page.getByLabel('프로젝트 이름').fill('내 계정에만 남을 초안');
  const other = await browser.newContext();
  try {
    await other.request.post('/api/demo', { headers, data: { role: 'MASTER' } });
    const invite = await (
      await other.request.post('/api/invitations', { headers, data: { label: '초안 격리 계정' } })
    ).json();
    const email = `draft-switch-${Date.now()}@example.com`,
      password = 'draft-isolation-test-password';
    expect(
      (
        await other.request.post('/api/register', {
          headers,
          data: {
            key: invite.key,
            email,
            password,
            name: '다른 실제 계정',
            appearance: defaultAppearance,
          },
        })
      ).status(),
    ).toBe(201);
    expect((await context.request.post('/api/logout', { headers })).status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: '다시 만나 반가워요', exact: true }),
    ).toBeVisible();
    await page.getByLabel('이메일').fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByRole('button', { name: '교실 입장하기', exact: true }).click();
    await expect(page.locator('.header-profile strong')).toHaveText('다른 실제 계정');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('이전 계정의 비공개 프로젝트');
    await expect(page.locator('body')).not.toContainText('다른 계정에 보이면 안 되는 내용');
    await expect(page.locator('.chat-card')).not.toHaveClass(/expanded/);
    await page.getByRole('button', { name: /교실 이야기/ }).click();
    await expect(page.getByRole('textbox', { name: '교실 채팅 메시지' })).toHaveValue('');
    const current = await (await context.request.get('/api/state')).json();
    expect(
      current.projects.filter((project: any) => project.ownerId === current.me.id),
    ).toHaveLength(0);
    expect(current.projects.some((project: any) => project.id === p.id)).toBe(false);
  } finally {
    await other.close();
  }
});
