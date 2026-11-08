import { chromium } from '@playwright/test';
import { writeFileSync, existsSync } from 'node:fs';
const base = process.env.DESIGN_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw Error('Use an isolated local demo.');
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.goto(new URL('/?invite=SPRITE-BOUNDS-QA', base).href);
  const report = await page.evaluate(async () => {
    const { characterCanvas } = await import('/src/game/character.ts');
    const { defaultAppearance } = await import('/shared/types.ts');
    const normal = characterCanvas(defaultAppearance);
    const original = document.createElement;
    const height = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
    const checks = [];
    try {
      document.createElement = function (tag, options) {
        const element = original.call(document, tag, options);
        if (tag === 'canvas')
          Object.defineProperty(element, 'height', {
            get() {
              return height.get.call(this);
            },
            set(value) {
              height.set.call(this, value === 64 ? 66 : value);
            },
          });
        return element;
      };
      for (const direction of ['down', 'up', 'left', 'right'])
        for (let frame = 0; frame < 3; frame++) {
          const reference = characterCanvas(defaultAppearance, direction, frame);
          const pixels = reference.getContext('2d').getImageData(0, 64, 48, 2).data;
          let clippedPixels = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) clippedPixels++;
          checks.push({ direction, frame, clippedPixels });
        }
    } finally {
      document.createElement = original;
    }
    return {
      normalSize: { width: normal.width, height: normal.height },
      method:
        'Render the unchanged drawing commands into a 48x66 reference to detect pixels that a 48x64 sprite would clip',
      checks,
    };
  });
  report.capturedAt = new Date().toISOString();
  writeFileSync(
    process.argv[2] || 'docs/v03/qa/sprite-bounds.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
  if (
    report.normalSize.width !== 48 ||
    report.normalSize.height !== 64 ||
    report.checks.some((check) => check.clippedPixels)
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
