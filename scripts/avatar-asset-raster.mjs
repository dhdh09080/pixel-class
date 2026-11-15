// Asset compiler helpers. No runtime character geometry is generated here.
export async function atlas(url, columns, rows, threshold = 180) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height),
    seen = new Uint8Array(image.width * image.height);
  const queue = new Int32Array(seen.length),
    cells = Array.from({ length: columns * rows }, () => []);
  for (let at = 0; at < seen.length; at++) {
    if (seen[at] || data.data[at * 4 + 3] < threshold) continue;
    let start = 0,
      end = 1,
      sumX = 0,
      sumY = 0;
    queue[0] = at;
    seen[at] = 1;
    const points = [];
    while (start < end) {
      const pos = queue[start++],
        x = pos % image.width,
        y = Math.floor(pos / image.width);
      points.push(pos);
      sumX += x;
      sumY += y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy,
            next = yy * image.width + xx;
          if (
            xx < 0 ||
            yy < 0 ||
            xx >= image.width ||
            yy >= image.height ||
            seen[next] ||
            data.data[next * 4 + 3] < threshold
          )
            continue;
          seen[next] = 1;
          queue[end++] = next;
        }
    }
    if (points.length < 64) continue;
    const col = Math.min(columns - 1, Math.floor((sumX / points.length / image.width) * columns));
    const row = Math.min(rows - 1, Math.floor((sumY / points.length / image.height) * rows));
    cells[row * columns + col].push(...points);
  }
  return cells.map((points) => {
    let l = image.width,
      t = image.height,
      r = 0,
      b = 0;
    for (const pos of points) {
      const x = pos % image.width,
        y = Math.floor(pos / image.width);
      l = Math.min(l, x);
      t = Math.min(t, y);
      r = Math.max(r, x);
      b = Math.max(b, y);
    }
    if (!points.length) throw Error('Empty atlas cell: ' + url);
    const out = document.createElement('canvas');
    out.width = r - l + 1;
    out.height = b - t + 1;
    const c = out.getContext('2d'),
      p = c.createImageData(out.width, out.height);
    for (const pos of points) {
      const dest = ((Math.floor(pos / image.width) - t) * out.width + (pos % image.width) - l) * 4;
      p.data.set(data.data.subarray(pos * 4, pos * 4 + 3), dest);
      p.data[dest + 3] = 255;
    }
    c.putImageData(p, 0, 0);
    return { canvas: out, sourceBounds: [l, t, out.width, out.height] };
  });
}
export function resize(source, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, width, height);
  return c;
}
export function hsv(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max === 0 ? 0 : d / max, max / 255];
}
const hex = (c) =>
  '#' +
  c
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
export function indexed(canvas, kind, id = 0) {
  const c = canvas.getContext('2d'),
    im = c.getImageData(0, 0, canvas.width, canvas.height),
    groups = new Map();
  const typed = [];
  for (let i = 0; i < im.data.length; i += 4) {
    if (!im.data[i + 3]) {
      typed.push(null);
      continue;
    }
    const rgb = Array.from(im.data.subarray(i, i + 3)),
      [h, s, v] = hsv(...rgb),
      u = ((i / 4) % canvas.width) / canvas.width,
      y = Math.floor(i / 4 / canvas.width) / canvas.height;
    let material = 'fixed';
    if (kind === 'hair') material = h > 145 && h < 200 && s > 0.25 ? 'accent' : 'hair';
    if (kind === 'face') {
      // A warm complexion is not a cheek: restrict rosy material to actual cheek zones.
      const cheek = y > 0.62 && y < 0.84 && ((u > 0.18 && u < 0.42) || (u > 0.76 && u < 0.96));
      material = cheek && h < 14 && s > 0.15 && v > 0.45 ? 'blush' : 'skin';
    }
    if (kind === 'eyes')
      material =
        h > 165 && h < 270 && s > 0.2 ? 'eyes' : h < 65 && s > 0.12 && v > 0.3 ? 'skin' : 'fixed';
    if (kind === 'brows') material = 'brow';
    if (kind === 'body') {
      const shorts = [2, 3, 6, 7].includes(id);
      const skinArea =
        ((u < 0.28 || u > 0.77) && y > 0.2 && y < 0.64) || (shorts && y > 0.52 && y < 0.87);
      const primary =
        id === 3
          ? (h > 320 || h < 12) && s > 0.22
          : id === 6
            ? h > 65 && h < 160 && s > 0.08
            : id === 7
              ? h > 150 && h < 230 && s > 0.2
              : id === 2
                ? h > 20 && h < 60 && v > 0.5 && s < 0.45
                : h > 200 && h < 285 && s > 0.16;
      if (skinArea && h < 36 && s > 0.16 && v > 0.55) material = 'skin';
      else if (h > 32 && h < 65 && s > 0.38) material = 'accent';
      else if (primary) material = 'outfit';
    }
    if (kind === 'hat') material = 'hat';
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push({ rgb, v: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] });
    typed.push({ material, rgb });
  }
  const entries = new Map(),
    palette = [{ hex: '#000000', material: 'transparent', tone: 0 }];
  const ramps = new Map();
  for (const [material, values] of groups) {
    const ordered = values.map((x) => x.v).sort((a, b) => a - b);
    ramps.set(
      material,
      Array.from(
        { length: 5 },
        (_, i) => ordered[Math.floor(((ordered.length - 1) * (i + 1)) / 6)],
      ),
    );
  }
  const fixedHistogram = new Map();
  for (const entry of groups.get('fixed') || []) {
    const color = entry.rgb.map((n) => Math.round(n / 28) * 28);
    const k = color.join(',');
    const old = fixedHistogram.get(k);
    if (old) old.n++;
    else fixedHistogram.set(k, { rgb: color, n: 1 });
  }
  const fixedColors = [...fixedHistogram.values()].sort((a, b) => b.n - a.n);
  const distance = (a, b) => a.reduce((sum, n, i) => sum + (n - b[i]) ** 2, 0);
  let centers = fixedColors.length ? [fixedColors[0].rgb] : [];
  while (centers.length < Math.min(16, fixedColors.length)) {
    const far = fixedColors.reduce((best, c) =>
      Math.min(...centers.map((v) => distance(c.rgb, v))) >
      Math.min(...centers.map((v) => distance(best.rgb, v)))
        ? c
        : best,
    );
    centers.push(far.rgb);
  }
  for (let step = 0; step < 5 && centers.length; step++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of fixedColors) {
      let at = 0;
      for (let i = 1; i < centers.length; i++)
        if (distance(c.rgb, centers[i]) < distance(c.rgb, centers[at])) at = i;
      for (let i = 0; i < 3; i++) sums[at][i] += c.rgb[i] * c.n;
      sums[at][3] += c.n;
    }
    centers = centers.map((v, i) =>
      sums[i][3] ? sums[i].slice(0, 3).map((n) => n / sums[i][3]) : v,
    );
  }
  const nearestFixed = (rgb) =>
    centers.reduce(
      (best, c) => (distance(rgb, c) < distance(rgb, best) ? c : best),
      centers[0] || rgb,
    );
  const values = typed.map((item) => {
    if (!item) return 0;
    const lum = 0.2126 * item.rgb[0] + 0.7152 * item.rgb[1] + 0.0722 * item.rgb[2];
    const thresholds = ramps.get(item.material);
    const median = thresholds[2] || 1;
    const tone =
      item.material === 'skin'
        ? [0.35, 0.62, 0.84, 1.025, 1.12].filter((ratio) => lum > median * ratio).length
        : item.material === 'blush'
          ? 3
          : thresholds.filter((n) => lum > n).length;
    const value =
      item.material === 'fixed'
        ? { hex: hex(nearestFixed(item.rgb)), material: 'fixed', tone: 0 }
        : { hex: hex(item.rgb), material: item.material, tone };
    const key = value.material === 'fixed' ? value.hex : value.material + ':' + tone;
    if (!entries.has(key)) {
      entries.set(key, palette.length);
      palette.push(value);
    }
    return entries.get(key);
  });
  // Keep fixed art colors bounded too; material ramps remain fully independent.
  if (palette.length > 255) throw Error('Palette exceeds 8-bit layer indexes');
  const runs = [];
  for (let i = 0; i < values.length;) {
    const value = values[i];
    let n = 1;
    while (i + n < values.length && values[i + n] === value && n < 65535) n++;
    runs.push(n & 255, n >> 8, value);
    i += n;
  }
  const binary = String.fromCharCode(...runs);
  const quantized = c.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < values.length; i++)
    if (values[i]) {
      const v = palette[values[i]].hex;
      for (let j = 0; j < 3; j++)
        quantized.data[i * 4 + j] = parseInt(v.slice(1 + j * 2, 3 + j * 2), 16);
      quantized.data[i * 4 + 3] = 255;
    }
  c.putImageData(quantized, 0, 0);
  const columns = Array.from(
    { length: canvas.width },
    (_, x) => values.filter((v, i) => i % canvas.width === x && v).length,
  );
  let splitX = Math.round(canvas.width / 2),
    best = 0;
  for (let x = Math.floor(canvas.width * 0.3); x < canvas.width * 0.8; x++) {
    if (columns[x]) continue;
    let n = 1;
    while (x + n < canvas.width * 0.8 && !columns[x + n]) n++;
    if (n > best) {
      best = n;
      splitX = x + Math.floor(n / 2);
    }
    x += n - 1;
  }
  return {
    ...(kind === 'eyes' || kind === 'brows' ? { splitX } : {}),
    width: canvas.width,
    height: canvas.height,
    palette,
    rle: btoa(binary),
    png: canvas.toDataURL(),
  };
}
