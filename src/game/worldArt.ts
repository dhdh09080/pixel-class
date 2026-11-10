export function worldCanvas(height = 700) {
  const h = height / 2;
  const canvas = document.createElement('canvas');
  canvas.width = 1120;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x * 2, y * 2, w * 2, h * 2);
  };
  r(0, 0, 560, h, '#cbdbbf');
  r(0, 0, 560, 11, '#92aa8f');
  r(12, 11, 536, 89, '#d3e1c7');
  r(12, 90, 536, 5, '#8b9f83');
  r(12, 95, 536, 5, '#637e6b');
  // Walnut floorboards, seams and a restrained deterministic grain.
  r(12, 100, 536, h - 112, '#d6b98c');
  const boards = ['#d6b98c', '#d8bc91', '#d2b489', '#d9bd91'];
  for (let row = 0; row < Math.ceil((h - 112) / 16); row++) {
    const y = 100 + row * 16;
    for (let col = -1; col < 12; col++) {
      const x = 12 + col * 52 + (row % 2 ? 26 : 0);
      const left = Math.max(12, x),
        right = Math.min(548, x + 52);
      const seed = (row * 17 + col * 13 + 997) % 19;
      if (right <= left) continue;
      r(left, y + 1, right - left, Math.min(15, h - 17 - y), boards[seed % boards.length]);
      r(left, y, right - left, 1, '#c3a477');
      if (x >= 12) r(x, y, 0.5, 16, '#bea071');
      if (x + 9 > 12 && x + 47 < 548) {
        r(x + 9 + seed, y + 5 + (seed % 4), 16 + (seed % 9), 1, '#dfc398');
        r(x + 21, y + 12, 10 + (seed % 12), 1, '#ccad7d');
        if (seed % 7 === 0) r(x + 35, y + 10, 6, 1, '#bfa173');
      }
    }
  }
  c.save();
  c.beginPath();
  c.rect(24, 206, 1072, height - 242);
  c.clip();
  for (let y = 213; y < height - 37; y += 16)
    for (let x = 28; x < 1093; x += 43) {
      const seed = (x * 13 + y * 7) % 19;
      c.fillStyle = seed % 3 ? '#e5cba4' : '#bd9e77';
      c.fillRect(x + seed, y + (seed % 5), 9 + seed, 1);
      if (seed % 5 === 0) {
        c.fillRect(x + 14, y + 5, 5, 1);
        c.fillRect(x + 13, y + 6, 1, 2);
        c.fillRect(x + 14, y + 8, 5, 1);
      }
    }
  c.restore();
  r(12, 100, 536, 6, '#bd9e76');
  r(0, 0, 12, h, '#93ad92');
  r(548, 0, 12, h, '#93ad92');
  r(0, h - 12, 560, 12, '#829b80');
  r(12, h - 17, 536, 5, '#a28967');
  // Tall sash windows and soft pools of sunlight.
  for (const x of [49, 424]) {
    r(x - 4, 23, 82, 57, '#a2b69a');
    r(x, 19, 74, 57, '#f2f2da');
    r(x + 4, 23, 66, 48, '#a9d7d3');
    r(x + 7, 26, 26, 18, '#d1ece2');
    r(x + 39, 26, 26, 18, '#c2e4de');
    r(x + 4, 47, 66, 3, '#f5f4dd');
    r(x + 35, 23, 4, 48, '#f5f4dd');
    r(x - 4, 75, 82, 5, '#f3f1d6');
    r(x + 4, 80, 66, 3, '#9cae8f');
    r(x + 11, 28, 2, 12, '#e8f4e6');
    r(x + 43, 52, 2, 12, '#d8eee3');
  }
  c.globalAlpha = 0.12;
  r(54, 106, 66, 57, '#fffce0');
  r(430, 106, 66, 57, '#fffce0');
  c.globalAlpha = 1;
  // Chalkboard with a broad wooden frame and chalk tray.
  r(191, 21, 178, 57, '#9caf95');
  r(187, 17, 180, 56, '#8e6b44');
  r(191, 21, 172, 48, '#37644f');
  r(194, 24, 166, 42, '#3c6c55');
  r(187, 73, 180, 4, '#79583b');
  r(190, 71, 174, 2, '#d1ac6b');
  r(335, 69, 10, 2, '#e9eed6');
  r(320, 69, 7, 2, '#e5bb83');
  // Teacher's desk.
  desk(252, 89, true);
  // Library shelving with book spines and drawers.
  r(32, 120, 62, 51, '#a98b65');
  r(30, 117, 60, 50, '#795c44');
  r(33, 119, 54, 45, '#bd996a');
  for (let row = 0; row < 2; row++) {
    r(35, 122 + row * 20, 50, 16, '#6d654e');
    const colors = ['#638c7d', '#c88265', '#e0c078', '#7d9a9e', '#9f9a74', '#cc9674', '#70917c'];
    let x = 37;
    for (let j = 0; j < 7; j++) {
      const h = 11 + (j % 3) * 2;
      r(x, 138 + row * 20 - h, 5, h, colors[j]);
      r(x + 1, 140 + row * 20 - h, 3, 1, '#e8dab4');
      x += 6;
    }
    r(33, 138 + row * 20, 54, 3, '#dab783');
  }
  r(35, 164, 4, 6, '#624a39');
  r(81, 164, 4, 6, '#624a39');
  // Pinboard / gallery.
  r(485, 108, 47, 59, '#826446');
  r(488, 111, 41, 53, '#c3a370');
  for (const [x, y, col] of [
    [492, 116, '#f1e6c6'],
    [511, 119, '#d9e4c1'],
    [493, 140, '#e7c3a1'],
    [512, 142, '#f3e9d4'],
  ] as [number, number, string][]) {
    r(x, y, 13, 16, col);
    r(x + 5, y - 1, 2, 2, '#c47c60');
    r(x + 3, y + 5, 7, 1, '#9b9e83');
    r(x + 3, y + 8, 5, 1, '#b8b79a');
  }
  // AI's woven circular rug.
  r(465, 177, 71, 48, '#aeae88');
  r(460, 182, 81, 38, '#a2b58d');
  r(466, 178, 69, 46, '#b9c99f');
  r(470, 182, 61, 38, '#c7d5ad');
  for (let y = 185; y < 218; y += 5) r(473, y, 55, 1, '#b8ca9e');
  // Lounge, side table and entrance mat.
  r(33, 235, 52, 49, '#bca57e');
  r(33, 231, 48, 40, '#5e806c');
  r(35, 233, 44, 11, '#749880');
  r(35, 246, 20, 19, '#8cac8c');
  r(57, 246, 20, 19, '#84a686');
  r(32, 242, 5, 27, '#62876e');
  r(77, 242, 5, 27, '#62876e');
  r(38, 271, 4, 5, '#725b44');
  r(72, 271, 4, 5, '#725b44');
  r(85, 250, 18, 19, '#795f48');
  r(85, 247, 18, 17, '#dab888');
  r(91, 249, 6, 5, '#f5eacf');
  r(92, 250, 4, 3, '#997659');
  r(224, h - 46, 112, 27, '#9b9575');
  r(226, h - 45, 108, 24, '#718d75');
  for (let x = 231; x < 332; x += 8) r(x, h - 41, 2, 16, '#819b7d');
  r(238, h - 12, 84, 12, '#c3a77d');
  r(242, h - 12, 76, 4, '#e3c89c');
  plant(23, 91);
  plant(527, 91);
  plant(528, 296);
  plant(32, 308);
  // A cozy cabinet by the right wall.
  r(476, 242, 55, 46, '#9f805b');
  r(475, 238, 55, 44, '#c19d6a');
  r(478, 242, 23, 35, '#d0af7c');
  r(504, 242, 23, 35, '#d0af7c');
  r(497, 257, 2, 3, '#7c674e');
  r(506, 257, 2, 3, '#7c674e');
  r(473, 234, 59, 5, '#e0c292');
  r(481, 228, 10, 6, '#e8dfbd');
  r(483, 225, 6, 4, '#86a688');
  r(507, 226, 15, 8, '#9aa4a0');
  r(509, 224, 11, 3, '#e0e1cf');
  for (const wx of [98, 848]) {
    c.fillStyle = '#f7f6e4';
    for (let j = 0; j < 4; j++) c.fillRect(wx + 15 + j * 3, 54 + j * 2, 1, 24 - j * 3);
    c.fillStyle = '#d9e1c6';
    c.fillRect(wx - 5, 157, 150, 1);
  }
  for (const [px, py] of [
    [46, 182],
    [1054, 182],
    [1056, 592],
    [64, 616],
  ]) {
    c.fillStyle = '#acd08d';
    for (let i = -8; i < 10; i += 5) {
      c.fillRect(px + i, py - 20 + Math.abs(i), 1, 11);
      c.fillRect(px + i + 1, py - 17 + Math.abs(i), 3, 1);
    }
    c.fillStyle = '#e4b28b';
    c.fillRect(px - 10, py + 18, 1, 17);
  }
  c.fillStyle = '#dce5cd';
  for (let x = 400; x < 715; x += 37) c.fillRect(x, 52 + (x % 7), 13, 1);
  return canvas;
  function plant(x: number, y: number) {
    r(x - 8, y + 15, 17, 5, '#aa956f');
    r(x - 6, y + 8, 13, 13, '#be8762');
    r(x - 8, y + 7, 17, 4, '#d4a17a');
    r(x - 1, y - 7, 3, 15, '#5b8260');
    r(x - 12, y - 12, 10, 8, '#6f9d65');
    r(x + 3, y - 14, 10, 9, '#739e66');
    r(x - 7, y - 19, 11, 10, '#85af72');
    r(x - 10, y - 7, 11, 7, '#577e54');
    r(x + 1, y - 5, 12, 7, '#638b59');
    r(x - 3, y - 15, 5, 8, '#9bbf7e');
  }
  function desk(x: number, y: number, teacher = false) {
    const w = teacher ? 84 : 56;
    r(x - w / 2 + 3, y + 18, w, 7, '#b39771');
    r(x - w / 2 + 5, y + 15, 5, 13, '#886b4a');
    r(x + w / 2 - 10, y + 15, 5, 13, '#886b4a');
    r(x - w / 2, y, w, 20, '#8c6747');
    r(x - w / 2, y - 3, w, 19, '#d8af77');
    r(x - w / 2 + 2, y - 1, w - 4, 2, '#ebc68e');
    r(x - 10, y - 10, 22, 14, '#384b49');
    r(x - 8, y - 8, 18, 10, '#91b6a0');
    r(x - 3, y + 4, 8, 3, '#6a7868');
    r(x - 9, y + 8, 20, 4, '#b2b4a0');
    r(x + 21, y + 2, 10, 8, '#f0e8cc');
    r(x + 22, y + 3, 7, 1, '#b8c2a3');
  }
}
export function deskCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 132;
  canvas.height = 116;
  const c = canvas.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x * 2, y * 2, w * 2, h * 2);
  };
  // Shared light from the upper left: contact shadow falls down and right.
  c.globalAlpha = 0.16;
  r(12, 35, 51, 9, '#705c44');
  r(26, 50, 25, 7, '#705c44');
  c.globalAlpha = 1;
  r(10, 40, 48, 6, '#b39872');
  r(8, 27, 5, 20, '#886a49');
  r(51, 27, 5, 20, '#886a49');
  r(4, 13, 58, 21, '#8f6947');
  r(4, 10, 58, 19, '#d5aa71');
  r(6, 11, 54, 2, '#edc68e');
  r(9, 28, 48, 1, '#bb905e');
  r(21, 0, 25, 18, '#2e4245');
  r(23, 2, 21, 13, '#8cb3ab');
  r(25, 4, 17, 9, '#b4d3bf');
  r(27, 6, 8, 1, '#648f81');
  r(27, 9, 12, 1, '#8ab0a0');
  r(32, 18, 4, 3, '#62766d');
  r(26, 21, 16, 2, '#6e8073');
  r(24, 24, 22, 4, '#dfdcca');
  r(26, 25, 17, 1, '#939e8b');
  r(49, 23, 4, 4, '#b2b8a1');
  r(8, 17, 10, 7, '#f2e8cd');
  r(10, 19, 6, 1, '#b7bc9e');
  r(23, 39, 23, 4, '#496b60');
  r(21, 42, 27, 9, '#658574');
  r(23, 43, 23, 5, '#83a08a');
  r(25, 51, 4, 6, '#775e45');
  r(41, 51, 4, 6, '#775e45');
  c.fillStyle = '#eac591';
  for (let x = 13; x < 118; x += 17) {
    c.fillRect(x, 32 + (x % 5), 12, 1);
    c.fillRect(x + 2, 43, 7, 1);
  }
  c.fillStyle = '#c6d4c5';
  for (let y = 49; y < 55; y += 2) for (let x = 51; x < 88; x += 4) c.fillRect(x, y, 3, 1);
  c.fillStyle = '#6e9b8c';
  for (let y = 10; y < 25; y += 3) {
    c.fillRect(55, y, 2, 1);
    c.fillRect(60, y, 9 + (y % 7), 1);
  }
  c.fillStyle = '#b8c6ab';
  c.fillRect(64, 37, 2, 4);
  c.fillStyle = '#a7b99d';
  for (let x = 48; x < 87; x += 5) c.fillRect(x, 88, 2, 1);
  c.fillStyle = '#f4d8ab';
  c.fillRect(12, 23, 106, 1);
  c.fillRect(17, 29, 1, 19);
  return canvas;
}
export function robotCanvas() {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 56;
  const g = c.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  r(22, 0, 3, 8, '#7e79a0');
  r(20, 0, 7, 4, '#d3f2a7');
  r(7, 9, 34, 25, '#8983af');
  r(10, 7, 28, 29, '#c8c2e2');
  r(12, 11, 24, 17, '#4e536e');
  r(15, 16, 5, 6, '#c8ecac');
  r(28, 16, 5, 6, '#c8ecac');
  r(22, 25, 5, 1, '#c8ecac');
  r(4, 17, 4, 11, '#ada7cb');
  r(40, 17, 4, 11, '#ada7cb');
  r(13, 35, 23, 14, '#9f99bf');
  r(17, 37, 15, 7, '#ded9ee');
  r(21, 39, 7, 3, '#a3b78c');
  r(8, 35, 5, 12, '#bfb8db');
  r(36, 35, 5, 12, '#bfb8db');
  r(15, 49, 7, 5, '#7f7b9e');
  r(28, 49, 7, 5, '#7f7b9e');
  return c;
}
