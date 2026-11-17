import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 950 } });
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 401, json: { error: 'isolated face art review' } }),
  );
  await page.goto('http://127.0.0.1:5189/character-art');
  const data = await page.evaluate(async () => {
    const cp = '/src/game/character.ts',
      sp = '/shared/sprite-appearance.ts',
      tp = '/shared/types.ts',
      dp = '/src/game/spriteCharacter.ts';
    const { characterCanvas } = await import(cp),
      { spriteSamples } = await import(sp),
      { defaultAppearance } = await import(tp),
      { spriteDiagnostics, SPRITE_RIG } = await import(dp);
    const samples = spriteSamples.map(({ name, ...look }, i) => {
      const a = { ...defaultAppearance, ...look };
      return {
        name,
        before: '/docs/face-proportions/before/composed-' + i + '.png',
        after: characterCanvas(a).toDataURL(),
        diagnostics: spriteDiagnostics(a),
      };
    });
    document.body.innerHTML =
      '<style>body{margin:0;padding:24px;background:#f7f4ed;color:#233d35;font:15px sans-serif}h1{font-size:24px}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}article{background:#fffdf8;border:1px solid #d9d6c8;border-radius:14px;padding:14px;text-align:center}h2{font-size:17px}.pair{display:flex;justify-content:center;gap:12px}figure{margin:0;width:244px}figcaption{margin:10px 0;font-size:13px}img{display:block;image-rendering:pixelated;margin:auto}.head{height:180px;width:240px;overflow:hidden;margin:auto}.head img{width:240px;height:320px}.native{width:120px;height:160px}.world{width:55.2px;height:73.6px;margin:8px auto}.muted{color:#6b735f;font-size:12px}</style><h1>PIXEL CLASS · 얼굴 비율 변경 전후</h1><p>같은 외형 선택값 · 위: 얼굴 2배 · 중간: 원본 120×160 · 아래: 교실 표시 크기</p><section>' +
      samples
        .map(
          (s) =>
            '<article><h2>' +
            s.name +
            '</h2><div class="pair">' +
            [
              ['변경 전', s.before],
              ['변경 후', s.after],
            ]
              .map(
                ([name, src]) =>
                  '<figure><figcaption>' +
                  name +
                  '</figcaption><div class="head"><img src="' +
                  src +
                  '"></div><img class="native" src="' +
                  src +
                  '"><img class="world" src="' +
                  src +
                  '"></figure>',
              )
              .join('') +
            '</div></article>',
        )
        .join('') +
      '</section>';
    return { samples, rig: SPRITE_RIG };
  });
  await page.locator('img').evaluateAll(async (imgs) => Promise.all(imgs.map((i) => i.decode())));
  mkdirSync('docs/face-proportions/after', { recursive: true });
  await page.screenshot({ path: 'docs/face-proportions/comparison.png', fullPage: true });
  for (let i = 0; i < data.samples.length; i++)
    writeFileSync(
      'docs/face-proportions/after/composed-' + i + '.png',
      Buffer.from(data.samples[i].after.split(',')[1], 'base64'),
    );
  writeFileSync(
    'docs/face-proportions/after/metrics.json',
    JSON.stringify(
      {
        rig: data.rig,
        samples: data.samples.map(({ name, diagnostics }) => ({ name, ...diagnostics })),
      },
      null,
      2,
    ) + '\n',
  );
  await page.evaluate(() => {
    document.querySelectorAll('figure:first-child').forEach((e) => e.remove());
    document.querySelectorAll('.native,.world').forEach((e) => e.remove());
    document.querySelector('section').style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
    document.querySelector('h1').textContent = 'PIXEL CLASS · 수정된 얼굴 8종';
    document.querySelector('p').textContent =
      '실제 합성 결과의 얼굴 2배 확대 · 동일한 헤어·의상·선택값';
  });
  await page.setViewportSize({ width: 1240, height: 670 });
  await page.screenshot({ path: 'docs/face-proportions/after/faces-eight.png', fullPage: true });
} finally {
  await browser.close();
  await server.close();
}
