/** Native integer-grid rasterizer. Fractional design coordinates map to native dots via density. */
export type PixelPoint = readonly [number, number];
export const shade = (hex: string, target: string, ratio: number) =>
  '#' +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        parseInt(hex.slice(i, i + 2), 16) * (1 - ratio) +
          parseInt(target.slice(i, i + 2), 16) * ratio,
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
export class PixelArt {
  readonly pixels: Uint32Array;
  private readonly colors = new Map<string, number>();
  constructor(
    readonly width: number,
    readonly height: number,
    readonly density = 1,
  ) {
    this.pixels = new Uint32Array(width * height);
  }
  color(hex: string) {
    let n = this.colors.get(hex);
    if (n === undefined) {
      n =
        (0xff000000 |
          (parseInt(hex.slice(5, 7), 16) << 16) |
          (parseInt(hex.slice(3, 5), 16) << 8) |
          parseInt(hex.slice(1, 3), 16)) >>>
        0;
      this.colors.set(hex, n);
    }
    return n;
  }
  rect(x: number, y: number, w: number, h: number, hex: string) {
    this.rawRect(x * this.density, y * this.density, w * this.density, h * this.density, hex);
  }
  private rawRect(x: number, y: number, w: number, h: number, hex: string) {
    const col = this.color(hex);
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.height, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.width, Math.round(x + w)); xx++)
        this.pixels[yy * this.width + xx] = col;
  }
  poly(points: readonly PixelPoint[], hex: string) {
    const native = points.map(([x, y]) => [x * this.density, y * this.density] as PixelPoint);
    this.rawPoly(native, hex);
  }
  private rawPoly(points: readonly PixelPoint[], hex: string) {
    const min = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1])))),
      max = Math.min(this.height, Math.ceil(Math.max(...points.map((p) => p[1]))));
    for (let y = min; y < max; y++) {
      const crossings: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5))
          crossings.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        this.rawRect(
          Math.ceil(crossings[i] - 0.5),
          y,
          Math.ceil(crossings[i + 1] - 0.5) - Math.ceil(crossings[i] - 0.5),
          1,
          hex,
        );
    }
  }
  oval(x: number, y: number, w: number, h: number, hex: string) {
    x *= this.density;
    y *= this.density;
    w *= this.density;
    h *= this.density;
    for (let j = 0; j < h; j++) {
      const inset = Math.round(
        (w / 2) * (1 - Math.sqrt(Math.max(0, 1 - ((j + 0.5 - h / 2) / (h / 2)) ** 2))),
      );
      this.rawRect(x + inset, y + j, w - inset * 2, 1, hex);
    }
  }
  line(points: readonly PixelPoint[], hex: string) {
    points = points.map(
      ([x, y]) => [Math.round(x * this.density), Math.round(y * this.density)] as PixelPoint,
    );
    for (let i = 0; i < points.length - 1; i++) {
      let [x, y] = points[i];
      const [bx, by] = points[i + 1],
        dx = Math.abs(bx - x),
        dy = -Math.abs(by - y),
        sx = x < bx ? 1 : -1,
        sy = y < by ? 1 : -1;
      let err = dx + dy;
      while (true) {
        this.rawRect(x, y, 1, 1, hex);
        if (x === bx && y === by) break;
        const e = err * 2;
        if (e >= dy) {
          err += dy;
          x += sx;
        }
        if (e <= dx) {
          err += dx;
          y += sy;
        }
      }
    }
  }
  /** Closed Bezier silhouettes rasterized on the native grid, without antialiasing. */
  path(commands: readonly (readonly [string, ...number[]])[], hex: string) {
    const points: PixelPoint[] = [];
    let x = 0,
      y = 0;
    for (const [op, ...v] of commands) {
      if (op === 'M' || op === 'L') {
        x = v[0];
        y = v[1];
        points.push([x, y]);
      } else if (op === 'C' || op === 'Q') {
        const sx = x,
          sy = y,
          steps = 24;
        for (let n = 1; n <= steps; n++) {
          const t = n / steps,
            u = 1 - t;
          if (op === 'C') {
            x = u * u * u * sx + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4];
            y = u * u * u * sy + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5];
          } else {
            x = u * u * sx + 2 * u * t * v[0] + t * t * v[2];
            y = u * u * sy + 2 * u * t * v[1] + t * t * v[3];
          }
          points.push([x, y]);
        }
      }
    }
    this.poly(points, hex);
  }
  curve(points: readonly PixelPoint[], hex: string) {
    const [a, b, c, d] = points;
    const samples: PixelPoint[] = [];
    for (let n = 0; n <= 32; n++) {
      const t = n / 32,
        u = 1 - t;
      samples.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
    this.line(samples, hex);
  }
  ring(x: number, y: number, w: number, h: number, hex: string, thickness = 0.5) {
    const s = this.density,
      col = this.color(hex),
      rx = (w * s) / 2,
      ry = (h * s) / 2,
      cx = (x + w / 2) * s,
      cy = (y + h / 2) * s,
      inset = thickness * s;
    for (
      let yy = Math.max(0, Math.floor(y * s));
      yy < Math.min(this.height, Math.ceil((y + h) * s));
      yy++
    )
      for (
        let xx = Math.max(0, Math.floor(x * s));
        xx < Math.min(this.width, Math.ceil((x + w) * s));
        xx++
      ) {
        const dx = xx + 0.5 - cx,
          dy = yy + 0.5 - cy;
        if (
          (dx / rx) ** 2 + (dy / ry) ** 2 <= 1 &&
          (dx / (rx - inset)) ** 2 + (dy / (ry - inset)) ** 2 >= 1
        )
          this.pixels[yy * this.width + xx] = col;
      }
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, hex: string) {
    this.rect(x + r, y, w - 2 * r, h, hex);
    this.rect(x, y + r, w, h - 2 * r, hex);
    for (const xx of [x, x + w - 2 * r])
      for (const yy of [y, y + h - 2 * r]) this.oval(xx, yy, 2 * r, 2 * r, hex);
  }
  layer(draw: (p: PixelArt) => void, outline = '#262333') {
    const part = new PixelArt(this.width, this.height, this.density);
    draw(part);
    const ink = this.color(outline);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const at = y * this.width + x;
        if (!part.pixels[at]) continue;
        for (const [xx, yy] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ])
          if (
            xx >= 0 &&
            xx < this.width &&
            yy >= 0 &&
            yy < this.height &&
            !part.pixels[yy * this.width + xx]
          )
            this.pixels[yy * this.width + xx] = ink;
      }
    for (let i = 0; i < part.pixels.length; i++)
      if (part.pixels[i]) this.pixels[i] = part.pixels[i];
  }
  canvas(mirror = false) {
    const out = document.createElement('canvas');
    out.width = this.width;
    out.height = this.height;
    const image = new ImageData(this.width, this.height),
      dest = new Uint32Array(image.data.buffer);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        dest[y * this.width + x] = this.pixels[y * this.width + (mirror ? this.width - 1 - x : x)];
    out.getContext('2d')!.putImageData(image, 0, 0);
    return out;
  }
}
