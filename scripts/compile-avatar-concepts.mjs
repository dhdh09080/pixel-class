import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1160 } });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 401, json: { error: 'isolated art compiler' } }),
  );
  await page.goto('http://127.0.0.1:5189/');
  const result = await page.evaluate(async () => {
    const source = new Image();
    source.src = '/docs/sprite-redesign/source/art-direction-eight.png';
    await source.decode();
    const src = document.createElement('canvas');
    src.width = source.width;
    src.height = source.height;
    const sx = src.getContext('2d');
    sx.drawImage(source, 0, 0);
    const pixels = sx.getImageData(0, 0, src.width, src.height).data;
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const ox = (i % 4) * 384,
        oy = Math.floor(i / 4) * 512;
      let left = 384,
        top = 512,
        right = 0,
        bottom = 0;
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 384; x++) {
          if (pixels[((oy + y) * src.width + ox + x) * 4 + 3] >= 180) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 160;
      const c = canvas.getContext('2d');
      c.imageSmoothingEnabled = false;
      const scale = Math.min(108 / (right - left + 1), 148 / (bottom - top + 1));
      const w = Math.round((right - left + 1) * scale),
        h = Math.round((bottom - top + 1) * scale);
      c.drawImage(
        src,
        ox + left,
        oy + top,
        right - left + 1,
        bottom - top + 1,
        Math.floor((120 - w) / 2),
        156 - h,
        w,
        h,
      );
      const data = c.getImageData(0, 0, 120, 160);
      for (let p = 0; p < data.data.length; p += 4)
        data.data[p + 3] = data.data[p + 3] >= 180 ? 255 : 0;
      c.putImageData(data, 0, 0);
      frames.push({
        id: i,
        bounds: [ox + left, oy + top, right - left + 1, bottom - top + 1],
        data: canvas.toDataURL(),
        size: [120, 160],
      });
    }
    document.getElementById('root').style.display = 'none';
    document.body.innerHTML =
      '<style>body{margin:0;background:#f7f4ed;color:#223d38;font:15px sans-serif}main{padding:28px}h1{font-size:24px}section{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{background:#fffdf8;border:1px solid #ded9ce;border-radius:16px;padding:14px;text-align:center}img{image-rendering:pixelated}.native{width:120px;height:160px}.zoom{width:240px;height:320px;display:block;margin:auto}h2{font-size:15px}</style><main><h1>PIXEL CLASS · 에셋 아트 8종 — 120×160 원본 검토</h1><p>상단 실제 원본 크기 · 하단 정수 2배 확대 / 도형 렌더러 미사용 / 운영 계정 접근 없음</p><section>' +
      frames
        .map(
          (f, i) =>
            '<article><h2>' +
            [
              '워크숍 메이커',
              '미드나잇 롱',
              '허니 단발',
              '베리 바시티',
              '카라멜 포니',
              '테일러드 숏',
              '세이지 컬',
              '로즈 트윈',
            ][i] +
            '</h2><img class="native" src="' +
            f.data +
            '"/><img class="zoom" src="' +
            f.data +
            '"/></article>',
        )
        .join('') +
      '</section></main>';
    return frames;
  });
  mkdirSync('docs/sprite-redesign/samples', { recursive: true });
  for (const frame of result)
    writeFileSync(
      `docs/sprite-redesign/samples/${frame.id}.png`,
      Buffer.from(frame.data.split(',')[1], 'base64'),
    );
  writeFileSync(
    'docs/sprite-redesign/source/concept-bounds.json',
    JSON.stringify(
      result.map(({ data, ...rest }) => rest),
      null,
      2,
    ) + '\n',
  );
  await page.screenshot({ path: 'docs/sprite-redesign/eight-native-review.png', fullPage: true });
} finally {
  await browser.close();
  await server.close();
}
