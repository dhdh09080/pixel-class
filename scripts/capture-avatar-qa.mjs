import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const out = process.env.QA_OUTPUT_DIR || 'docs/overnight/avatar',
  port = 5195,
  base = `http://127.0.0.1:${port}`;
mkdirSync(out, { recursive: true });
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: 'ignore' },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/src/game/character.ts')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error('Avatar capture server did not start');
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.route(base + '/avatar-qa', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Isolated avatar QA</title></head><body></body></html>',
    }),
  );
  await page.goto(base + '/avatar-qa');
  const result = await page.evaluate(async () => {
    const { characterCanvas } = await import('/src/game/character.ts'),
      { appearanceOptions, professionPresets } = await import('/shared/appearance.ts'),
      { defaultAppearance } = await import('/shared/types.ts');
    const sheets = {},
      edgeCases = [],
      cases = [];
    let tested = 0;
    const board = (cols, rows) => {
      const c = document.createElement('canvas');
      c.width = cols * 144;
      c.height = rows * 190;
      const p = c.getContext('2d');
      p.fillStyle = '#f5f1e6';
      p.fillRect(0, 0, c.width, c.height);
      p.imageSmoothingEnabled = false;
      return { c, p };
    };
    const draw = (b, a, label, i, cols, direction = 'down', frame = 0, seated = false) => {
      const sprite = characterCanvas(a, direction, frame, seated),
        x = (i % cols) * 144,
        y = Math.floor(i / cols) * 190;
      b.p.drawImage(sprite, x + 12, y + 5, 120, 160);
      b.p.fillStyle = '#344a39';
      b.p.font = '11px sans-serif';
      b.p.textAlign = 'center';
      b.p.fillText(label, x + 72, y + 182);
    };
    for (let h = 0; h < 18; h++)
      for (let hat = 0; hat < 15; hat++)
        cases.push({
          ...defaultAppearance,
          hairstyle: h,
          helmetStyle: hat,
          outfit: (h + hat) % 25,
          body: h % 4,
        });
    for (let outfit = 0; outfit < 25; outfit++)
      for (let body = 0; body < 4; body++)
        cases.push({ ...defaultAppearance, outfit, body, hairstyle: outfit % 18, helmetStyle: 1 });
    for (const [index, a] of cases.entries())
      for (const dir of ['down', 'right', 'up', 'left'])
        for (let frame = 0; frame < 3; frame++) {
          const c = characterCanvas(a, dir, frame),
            p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let filledEdge = 0;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) {
                const n = (y * c.width + x) * 4;
                if (p[n + 3] && !(p[n] === 38 && p[n + 1] === 35 && p[n + 2] === 51)) filledEdge++;
              }
          if (filledEdge)
            edgeCases.push({
              index,
              hairstyle: a.hairstyle,
              hat: a.helmetStyle,
              outfit: a.outfit,
              body: a.body,
              direction: dir,
              frame,
              filledEdge,
            });
          tested++;
        }
    for (let start = 0; start < 270; start += 64) {
      const rows = cases.slice(start, Math.min(start + 64, 270)),
        hats = board(8, Math.ceil(rows.length / 8));
      rows.forEach((a, i) => draw(hats, a, `헤어${a.hairstyle} · 모자${a.helmetStyle}`, i, 8));
      sheets['hair-hat-matrix-' + start] = hats.c.toDataURL();
    }
    for (let start = 0; start < 100; start += 50) {
      const b = board(10, 5);
      cases
        .slice(270 + start, 270 + start + 50)
        .forEach((a, i) => draw(b, a, `의상${a.outfit} · 체형${a.body}`, i, 10));
      sheets['body-outfits-' + start] = b.c.toDataURL();
    }
    const poses = board(8, 6);
    for (let i = 0; i < 48; i++) {
      const a = {
        ...defaultAppearance,
        ...professionPresets[i % professionPresets.length].changes,
        hairstyle: i % 18,
      };
      draw(
        poses,
        a,
        `${i % 4}방향 · ${Math.floor(i / 4) % 3}프레임`,
        i,
        8,
        ['down', 'right', 'up', 'left'][i % 4],
        Math.floor(i / 4) % 3,
        i >= 36,
      );
    }
    sheets['poses'] = poses.c.toDataURL();
    return {
      tested,
      combinations: cases.length,
      filledBoundaryCases: edgeCases.length,
      edgeCases: edgeCases.slice(0, 100),
      sheets,
    };
  });
  for (const [name, data] of Object.entries(result.sheets))
    writeFileSync(join(out, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  delete result.sheets;
  writeFileSync(
    join(out, 'matrix.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        method:
          'Actual native renderer; edge metric is a clipping diagnostic, not a visual quality score.',
        ...result,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      tested: result.tested,
      combinations: result.combinations,
      filledBoundaryCases: result.filledBoundaryCases,
    }),
  );
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
  await new Promise((resolve) => {
    if (vite.exitCode !== null) resolve();
    else vite.once('exit', resolve);
  });
}
