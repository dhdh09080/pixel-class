import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const tag = process.argv[2] || 'review';
const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 401, json: { error: 'isolated art lab' } }),
  );
  await page.goto('http://127.0.0.1:5189/');
  const data = await page.evaluate(async () => {
    const cp = '/src/game/character.ts',
      tp = '/shared/types.ts',
      sp = '/shared/sprite-appearance.ts';
    const { characterCanvas } = await import(cp),
      { defaultAppearance } = await import(tp),
      { spriteSamples } = await import(sp);
    const samples = spriteSamples.map(({ name, ...sample }, i) => {
      const a = { ...defaultAppearance, ...sample };
      return {
        name,
        src: characterCanvas(a).toDataURL(),
        rear: characterCanvas(a, 'up').toDataURL(),
        appearance: a,
      };
    });
    document.body.innerHTML =
      '<style>body{margin:0;background:#f7f4ed;color:#233d35;font:15px sans-serif}main{padding:24px}h1{font-size:23px}section{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{padding:12px;background:#fffdf8;border:1px solid #ddd8cf;border-radius:14px;text-align:center}img{image-rendering:pixelated}.native{width:120px;height:160px}.zoom{display:block;width:240px;height:320px;margin:8px auto}h2{font-size:16px}</style><main><h1>PIXEL CLASS · 실제 PNG 레이어 합성 검증</h1><p>상단 120×160 원본 · 가운데 2배 확대 · 하단 실제 뒷모습</p><section>' +
      samples
        .map(
          (s) =>
            '<article><h2>' +
            s.name +
            '</h2><img class="native" src="' +
            s.src +
            '"/><img class="zoom" src="' +
            s.src +
            '"/><img class="native" src="' +
            s.rear +
            '"/></article>',
        )
        .join('') +
      '</section></main>';
    return samples;
  });
  mkdirSync('docs/sprite-redesign/reviews', { recursive: true });
  await page.screenshot({ path: `docs/sprite-redesign/reviews/${tag}-layers.png`, fullPage: true });
  for (let i = 0; i < data.length; i++) {
    writeFileSync(
      `docs/sprite-redesign/samples/composed-${i}.png`,
      Buffer.from(data[i].src.split(',')[1], 'base64'),
    );
    writeFileSync(
      `docs/sprite-redesign/samples/rear-${i}.png`,
      Buffer.from(data[i].rear.split(',')[1], 'base64'),
    );
  }
  writeFileSync(
    'docs/sprite-redesign/samples/appearances.json',
    JSON.stringify(
      data.map(({ appearance, name }) => ({ name, appearance })),
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await server.close();
}
