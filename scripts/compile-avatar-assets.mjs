import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const server = await createServer({ server: { host: '127.0.0.1', port: 5189, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 401, json: { error: 'isolated asset compiler' } }),
  );
  await page.goto('http://127.0.0.1:5189/');
  const rig = JSON.parse(readFileSync('src/game/sprite-assets/rig.json', 'utf8'));
  const result = await page.evaluate(async (rig) => {
    const { atlas, resize, indexed, hsv } = await import('/scripts/avatar-asset-raster.mjs');
    const root = '/docs/sprite-redesign/source/';
    const [faces, hair, rear, frontClothes, backClothes, features, equipment] = await Promise.all([
      atlas('/docs/face-proportions/source/face-bases.png', 4, 1),
      atlas(root + 'hair-wigs.png', 4, 2),
      atlas(root + 'hair-back.png', 4, 2),
      atlas(root + 'clothes-front.png', 4, 2),
      atlas(root + 'clothes-back.png', 4, 2),
      atlas('/docs/face-proportions/source/brows-mouths.png', 4, 4),
      atlas(root + 'equipment.png', 4, 2),
    ]);
    const petal = (await atlas('/docs/face-proportions/source/petal-pair.png', 1, 1))[0];
    const assets = {};
    const manifest = {};
    function add(key, source, w, h, kind, id = 0) {
      const c = resize(source.canvas, w, h);
      if (key.startsWith('hair-front-')) {
        const ctx = c.getContext('2d'),
          image = ctx.getImageData(0, 0, w, h),
          copy = image.data.slice();
        const { x: hx, y: hy } = rig.hair[id];
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const at = (y * w + x) * 4,
              wx = x + hx,
              wy = y + hy;
            if (
              wx < 48 ||
              wx > 110 ||
              wy < 54 ||
              wy > 90 ||
              !copy[at + 3] ||
              Math.max(copy[at], copy[at + 1], copy[at + 2]) > 85
            )
              continue;
            let neighbors = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if (copy[((y + dy) * w + x + dx) * 4 + 3]) neighbors++;
            if (neighbors <= 5) image.data[at + 3] = 0;
          }
        ctx.putImageData(image, 0, 0);
      }
      assets[key] = indexed(c, kind, id);
      manifest[key] = { sourceBounds: source.sourceBounds, size: [w, h] };
    }
    [0, 1, 2, 3].forEach((i, k) => {
      const c = faces[i].canvas;
      add('face-' + k, faces[i], 60, Math.round((c.height / c.width) * 60), 'face');
    });
    for (let i = 0; i < 8; i++) {
      const w = rig.hair[i].width;
      for (const [key, set] of [
        ['hair-front', hair],
        ['hair-back', rear],
      ]) {
        const c = set[i].canvas;
        const fit = Math.min(w, Math.floor((146 / c.height) * c.width));
        add(key + '-' + i, set[i], fit, Math.round((c.height / c.width) * fit), 'hair', i);
      }
      for (const [key, set] of [
        ['body-front', frontClothes],
        ['body-back', backClothes],
      ]) {
        const c = set[i].canvas;
        add(key + '-' + i, set[i], Math.round((c.width / c.height) * 74), 74, 'body', i);
      }
    }
    // Build a coherent pair from one authored eye. Both irises share the same gaze,
    // lighting and baseline; the far eye is 13/14 width rather than half as wide.
    function nearEye(source, trimSocket = false) {
      const c = source.canvas,
        ctx = c.getContext('2d'),
        data = ctx.getImageData(0, 0, c.width, c.height).data;
      const columns = Array.from({ length: c.width }, (_, x) => {
        let n = 0;
        for (let y = 0; y < c.height; y++) if (data[(y * c.width + x) * 4 + 3]) n++;
        return n;
      });
      let split = Math.floor(c.width / 2),
        best = 0;
      for (let x = Math.floor(c.width * 0.3); x < c.width * 0.8; x++) {
        if (columns[x]) continue;
        let n = 1;
        while (x + n < c.width * 0.8 && !columns[x + n]) n++;
        if (n > best) {
          best = n;
          split = x + Math.floor(n / 2);
        }
        x += n - 1;
      }
      let l = split,
        t = c.height,
        r = 0,
        b = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < split; x++)
          if (data[(y * c.width + x) * 4 + 3]) {
            l = Math.min(l, x);
            r = Math.max(r, x);
            t = Math.min(t, y);
            b = Math.max(b, y);
          }
      if (trimSocket) {
        let irisTop = b + 1;
        for (let y = t; y <= b; y++)
          for (let x = l; x <= r; x++) {
            const at = (y * c.width + x) * 4;
            if (!data[at + 3]) continue;
            const [h, s, v] = hsv(data[at], data[at + 1], data[at + 2]);
            if (h > 165 && h < 245 && s > 0.25 && v > 0.45) irisTop = Math.min(irisTop, y);
          }
        if (irisTop <= b) t = Math.max(t, irisTop - Math.max(2, Math.round((b - t + 1) * 0.12)));
      }
      const out = document.createElement('canvas');
      out.width = r - l + 1;
      out.height = b - t + 1;
      out.getContext('2d').drawImage(c, l, t, out.width, out.height, 0, 0, out.width, out.height);
      return out;
    }
    const heights = [10, 8, 10, 8, 7, 10, 8, 4, 9];
    for (let i = 0; i < 9; i++) {
      const source = i === 8 ? petal : features[i],
        single = nearEye(source, true),
        c = document.createElement('canvas');
      c.width = 34;
      c.height = heights[i];
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(single, 0, 0, 14, c.height);
      ctx.drawImage(single, 21, 0, 13, c.height);
      add('eyes-' + i, { canvas: c, sourceBounds: source.sourceBounds }, 34, c.height, 'eyes');
    }
    for (let i = 0; i < 4; i++) {
      const b = nearEye(features[i + 8]),
        pair = document.createElement('canvas');
      pair.width = 32;
      pair.height = [2, 3, 3, 3][i];
      const ctx = pair.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(b, 0, 0, 13, pair.height);
      ctx.drawImage(b, 20, 0, 12, pair.height);
      add(
        'brows-' + i,
        { canvas: pair, sourceBounds: features[i + 8].sourceBounds },
        32,
        pair.height,
        'brows',
      );
      const m = features[i + 12].canvas;
      const w = [5, 6, 4, 6][i];
      add('mouth-' + i, features[i + 12], w, [2, 4, 4, 2][i], 'mouth', i);
    }
    const sizes = [
      [100, 43],
      [100, 47],
      [43, 0],
      [11, 0],
      [48, 0],
      [88, 68],
      [25, 0],
      [37, 0],
    ];
    equipment.forEach((part, i) => {
      const w = sizes[i][0];
      add(
        'equipment-' + i,
        part,
        w,
        sizes[i][1] || Math.round((part.canvas.height / part.canvas.width) * w),
        i < 2 ? 'hat' : 'equipment',
      );
    });
    const earrings = equipment[4].canvas;
    for (let side = 0; side < 2; side++) {
      const c = document.createElement('canvas');
      c.width = Math.floor(earrings.width / 2);
      c.height = earrings.height;
      c.getContext('2d').drawImage(
        earrings,
        side * c.width,
        0,
        c.width,
        c.height,
        0,
        0,
        c.width,
        c.height,
      );
      add(
        'earring-' + side,
        { canvas: c, sourceBounds: equipment[4].sourceBounds },
        6,
        8,
        'equipment',
      );
    }
    function derive(name, parent, predicate) {
      const original = assets[parent],
        binary = atob(original.rle),
        values = new Uint8Array(original.width * original.height);
      let at = 0;
      for (let i = 0; i < binary.length; i += 3) {
        const n = binary.charCodeAt(i) + (binary.charCodeAt(i + 1) << 8);
        values.fill(binary.charCodeAt(i + 2), at, at + n);
        at += n;
      }
      const c = document.createElement('canvas');
      c.width = original.width;
      c.height = original.height;
      const ctx = c.getContext('2d'),
        p = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < values.length; i++) {
        const x = i % c.width,
          y = Math.floor(i / c.width);
        if (!predicate(x, y)) values[i] = 0;
        if (values[i]) {
          const hex = original.palette[values[i]].hex;
          for (let channel = 0; channel < 3; channel++)
            p.data[i * 4 + channel] = parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16);
          p.data[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(p, 0, 0);
      const runs = [];
      for (let i = 0; i < values.length;) {
        let n = 1;
        while (i + n < values.length && values[i + n] === values[i] && n < 65535) n++;
        runs.push(n & 255, n >> 8, values[i]);
        i += n;
      }
      assets[name] = { ...original, rle: btoa(String.fromCharCode(...runs)), png: c.toDataURL() };
      manifest[name] = { derivedFrom: parent, size: [c.width, c.height] };
    }
    for (let i = 0; i < 8; i++) {
      const { x: hx, y: hy } = rig.hair[i],
        parent = 'hair-front-' + i;
      derive('hair-rear-' + i, parent, () => true);
      derive('hair-fringe-' + i, parent, (x, y) => x + hx >= 48 && x + hx < 95 && y + hy <= 67);
      derive(
        'hair-side-' + i,
        parent,
        (x, y) => (x + hx < 48 || x + hx >= 95) && y + hy < rig.hairFrontCutY,
      );
      derive(
        'hair-fringe-worn-' + i,
        'hair-fringe-' + i,
        (x, y) => y + hy > 24 || x + hx < 20 || x + hx > 108,
      );
      derive(
        'hair-side-worn-' + i,
        'hair-side-' + i,
        (x, y) => y + hy > 24 || x + hx < 20 || x + hx > 108,
      );
    }
    return { assets, manifest };
  }, rig);
  mkdirSync('src/game/sprite-assets/png', { recursive: true });
  const bank = {};
  for (const [name, { png, ...value }] of Object.entries(result.assets)) {
    const data = Buffer.from(png.split(',')[1], 'base64');
    writeFileSync('src/game/sprite-assets/png/' + name + '.png', data);
    bank[name] = { ...value, sha256: createHash('sha256').update(data).digest('hex') };
  }
  const unique = {},
    aliases = {},
    seen = new Map();
  for (const [name, value] of Object.entries(bank)) {
    const signature = value.sha256 + JSON.stringify(value.palette);
    if (seen.has(signature)) aliases[name] = seen.get(signature);
    else {
      unique[name] = value;
      seen.set(signature, name);
    }
  }
  const data = JSON.stringify(unique);
  writeFileSync(
    'src/game/sprite-assets/generated.ts',
    "// Generated from authored PNG layers by scripts/compile-avatar-assets.mjs. Do not edit.\nimport type { SpriteAsset } from '../spriteTypes';\nexport const SPRITE_ASSETS = JSON.parse(" +
      JSON.stringify(data) +
      ') as Record<string, SpriteAsset>;\nconst aliases: Record<string,string> = ' +
      JSON.stringify(aliases) +
      ';\nfor(const [name,source]of Object.entries(aliases)) SPRITE_ASSETS[name]=SPRITE_ASSETS[source];\n',
  );
  writeFileSync(
    'docs/face-proportions/source/layer-manifest.json',
    JSON.stringify(result.manifest, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      assets: Object.keys(bank).length,
      bytes: data.length,
      dimensions: Object.fromEntries(
        Object.entries(bank).map(([k, v]) => [k, [v.width, v.height, v.palette.length]]),
      ),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
