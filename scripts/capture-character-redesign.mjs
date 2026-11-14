import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const tag = process.argv[2] || 'after';
if (!['before', 'after', 'review'].includes(tag)) throw Error('Unknown evidence tag');
const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1120, height: 980 },
    deviceScaleFactor: 1,
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: route.request().url().endsWith('/config') ? 200 : 401,
      json: { demo: false, bootstrap: false, aiConfigured: false, error: 'isolated art capture' },
    }),
  );
  await page.goto('http://127.0.0.1:5189/');
  const result = await page.evaluate(async () => {
    const { characterCanvas, CHARACTER_WIDTH, CHARACTER_HEIGHT, CHARACTER_SCALE } =
      await import('/src/game/character.ts');
    const { defaultAppearance } = await import('/shared/types.ts');
    const { appearancePresets, appearanceOptions } = await import('/shared/appearance.ts');
    const cases = [
      ['기본 안전모', {}],
      ['내추럴 헤어', { helmetStyle: 1 }],
      ['실키 롱', { ...appearancePresets[0].changes }],
      ['단발 · 안경', { ...appearancePresets[1].changes, accessory: 1 }],
      ['정장 · 숏 헤어', { helmetStyle: 1, hairstyle: 6, outfit: 2 }],
      ['포니테일', { helmetStyle: 1, hairstyle: 4, hair: '#925b32' }],
      ['컬 · 짙은 피부', { helmetStyle: 1, hairstyle: 7, skin: '#9c694a', hair: '#292a36' }],
      ['라벤더 웨이브', { ...appearancePresets[5].changes, helmetStyle: 1 }],
    ];
    const sprites = cases.map(([name, change]) => ({
      name,
      src: characterCanvas({ ...defaultAppearance, ...change }).toDataURL(),
    }));
    document.getElementById('root').style.display = 'none';
    const gallery = document.createElement('main');
    gallery.id = 'sprite-art-board';
    gallery.innerHTML =
      '<style>body{margin:0;background:#f6f5ed!important;color:#293d32;font-family:sans-serif}.art-header{padding:24px 32px}.art-header h1{font-size:22px}.art-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:0 24px 24px}.art-card{display:flex;flex-direction:column;align-items:center;justify-content:end;border:1px solid #d5dccf;background:#fffdf8;border-radius:14px;padding:18px 10px}.art-card img{width:192px;height:256px;image-rendering:pixelated;object-fit:contain}.art-card strong{font-size:13px;margin-top:12px}</style><header class="art-header"><h1>PIXEL CLASS · 캐릭터 아트 비교</h1><p>원본 ' +
      CHARACTER_WIDTH +
      ' × ' +
      CHARACTER_HEIGHT +
      'px · 동일한 192 × 256px 미리보기 · 교실 높이 ' +
      (CHARACTER_HEIGHT * CHARACTER_SCALE).toFixed(1) +
      '</p></header><div class="art-grid">' +
      sprites
        .map(
          (s) =>
            '<article class="art-card"><img src="' +
            s.src +
            '"/><strong>' +
            s.name +
            '</strong></article>',
        )
        .join('') +
      '</div>';
    document.body.append(gallery);
    return {
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      worldHeight: CHARACTER_HEIGHT * CHARACTER_SCALE,
      sprites,
      catalogs: Object.fromEntries(
        ['hairstyle', 'eyeShape', 'outfit', 'helmetStyle'].map((key) => [
          key,
          appearanceOptions[key].map((name, index) => ({
            name,
            src: characterCanvas({
              ...defaultAppearance,
              helmetStyle: key === 'helmetStyle' ? index : 1,
              [key]: index,
            }).toDataURL(),
          })),
        ]),
      ),
    };
  });
  mkdirSync('docs/rounded-120', { recursive: true });
  await page.screenshot({ path: 'docs/rounded-120/' + tag + '-gallery.png', fullPage: true });
  const catalogCounts = {};
  for (const [key, sprites] of Object.entries(result.catalogs)) {
    catalogCounts[key] = {
      expected: sprites.length,
      unique: new Set(sprites.map((s) => s.src)).size,
    };
    await page.evaluate(
      ({ key, sprites }) => {
        document.querySelector('.art-header h1').textContent = '캐릭터 레이어 전수 검토 · ' + key;
        document.querySelector('.art-grid').style.gridTemplateColumns = 'repeat(5, 1fr)';
        document.querySelector('.art-grid').innerHTML = sprites
          .map(
            (s, i) =>
              '<article class="art-card"><img style="width:120px;height:160px" src="' +
              s.src +
              '"/><strong>' +
              i +
              ' · ' +
              s.name +
              '</strong></article>',
          )
          .join('');
      },
      { key, sprites },
    );
    await page.screenshot({ path: 'docs/rounded-120/' + tag + '-' + key + '.png', fullPage: true });
  }
  for (let i = 0; i < result.sprites.length; i++)
    writeFileSync(
      'docs/rounded-120/' + tag + '-' + i + '.png',
      Buffer.from(result.sprites[i].src.split(',')[1], 'base64'),
    );
  writeFileSync(
    'docs/rounded-120/' + tag + '-metrics.json',
    JSON.stringify(
      {
        width: result.width,
        height: result.height,
        worldHeight: result.worldHeight,
        catalogCounts,
        environment: 'isolated local browser; no school accounts created',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  await server.close();
}
