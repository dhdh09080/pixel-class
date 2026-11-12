/** Integer-only raster painter. Every layer has an explicit one-pixel outline. */
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
    const col = this.color(hex);
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(this.height, Math.round(y + h)); yy++)
      for (let xx = Math.max(0, Math.round(x)); xx < Math.min(this.width, Math.round(x + w)); xx++)
        this.pixels[yy * this.width + xx] = col;
  }
  poly(points: readonly PixelPoint[], hex: string) {
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
        this.rect(
          Math.ceil(crossings[i] - 0.5),
          y,
          Math.ceil(crossings[i + 1] - 0.5) - Math.ceil(crossings[i] - 0.5),
          1,
          hex,
        );
    }
  }
  oval(x: number, y: number, w: number, h: number, hex: string) {
    for (let j = 0; j < h; j++) {
      const inset = Math.round(
        (w / 2) * (1 - Math.sqrt(Math.max(0, 1 - ((j + 0.5 - h / 2) / (h / 2)) ** 2))),
      );
      this.rect(x + inset, y + j, w - inset * 2, 1, hex);
    }
  }
  line(points: readonly PixelPoint[], hex: string) {
    for (let i = 0; i < points.length - 1; i++) {
      let [x, y] = points[i];
      const [bx, by] = points[i + 1],
        dx = Math.abs(bx - x),
        dy = -Math.abs(by - y),
        sx = x < bx ? 1 : -1,
        sy = y < by ? 1 : -1;
      let err = dx + dy;
      while (true) {
        this.rect(x, y, 1, 1, hex);
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
  layer(draw: (p: PixelArt) => void, outline = '#262333') {
    const part = new PixelArt(this.width, this.height);
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
