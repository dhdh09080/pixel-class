import { type Appearance } from '../../shared/types';
export type Direction = 'down' | 'up' | 'left' | 'right';
export function characterCanvas(
  a: Appearance,
  direction: Direction = 'down',
  frame = 0,
  seated = false,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const bob = frame % 2;
  const side = direction === 'left' || direction === 'right';
  const back = direction === 'up';
  if (direction === 'left') {
    c.translate(48, 0);
    c.scale(-1, 1);
  }
  c.translate(0, bob);
  const bodyWidth = a.body === 1 ? 22 : a.body === 2 ? 26 : 24;
  const left = 24 - bodyWidth / 2;
  // Boots, trouser seams and layered navy site uniform.
  if (!seated) {
    rect(15, 48, 8, 11, '#253855');
    rect(25, 48, 8, 11, '#304665');
    rect(13 + (frame === 1 ? 2 : 0), 58, 11, 5, '#17273c');
    rect(25 - (frame === 1 ? 2 : 0), 58, 11, 5, '#17273c');
    rect(16, 50, 2, 8, '#3c5578');
  } else {
    rect(12, 47, 24, 7, '#253855');
    rect(10, 52, 11, 5, '#17273c');
    rect(28, 52, 11, 5, '#17273c');
  }
  rect(left, 30, bodyWidth, 20, '#192b45');
  rect(left + 2, 31, bodyWidth - 4, 17, '#334b70');
  rect(left + 3, 34, bodyWidth - 6, 2, '#91a9bc');
  rect(23, 34, 2, 15, '#233651');
  rect(17, 38, 5, 4, '#496386');
  rect(27, 38, 5, 4, '#496386');
  rect(17, 38, 5, 1, '#b8c4cf');
  rect(27, 38, 5, 1, '#b8c4cf');
  rect(22, 32, 4, 3, '#e0ae8f');
  const arm = frame === 2 ? 2 : 0;
  rect(left - 4, 33 - arm, 5, 12, '#2c4263');
  rect(left + bodyWidth - 1, 33 + arm, 5, 12, '#3b5274');
  rect(left - 4, 44 - arm, 5, 5, a.skin);
  rect(left + bodyWidth - 1, 44 + arm, 5, 5, a.skin);
  // Hair, face silhouette and readable facial features.
  rect(10, 13, 28, 19, a.hair);
  rect(12, 16, 24, 16, a.skin);
  rect(10, 21, 3, 6, a.skin);
  rect(35, 21, 3, 6, a.skin);
  rect(15, 30, 18, 3, a.skin);
  if (back) {
    rect(11, 16, 26, 15, a.hair);
    rect(14, 29, 20, 3, a.hair);
    if (a.hairstyle === 1) {
      rect(9, 21, 5, 14, a.hair);
      rect(34, 21, 5, 14, a.hair);
    }
  } else if (side) {
    rect(29, 17, 5, 6, a.hair);
    rect(33, 24, 5, 4, a.skin);
    rect(27, 22, 4, 5, a.eyes);
    rect(29, 22, 1, 2, '#fff');
    rect(32, 29, 3, 1, '#a15e59');
    rect(19, 25, 4, 3, '#e6a398');
  } else {
    if (a.hairstyle === 0) {
      rect(12, 15, 8, 5, a.hair);
      rect(16, 17, 6, 3, a.hair);
    }
    if (a.hairstyle === 1) {
      rect(10, 18, 4, 14, a.hair);
      rect(34, 18, 4, 14, a.hair);
      rect(13, 16, 5, 3, a.hair);
    }
    if (a.hairstyle === 2) {
      rect(12, 16, 24, 3, a.hair);
      rect(16, 18, 5, 3, a.hair);
      rect(26, 18, 4, 3, a.hair);
    }
    rect(16, 22, 5, a.eyeShape === 1 ? 2 : 5, a.eyes);
    rect(27, 22, 5, a.eyeShape === 1 ? 2 : 5, a.eyes);
    if (a.eyeShape !== 1) {
      rect(17, 22, 2, 2, '#fff');
      rect(28, 22, 2, 2, '#fff');
    }
    if (a.eyeShape === 2) {
      rect(15, 21, 5, 1, a.eyes);
      rect(28, 21, 5, 1, a.eyes);
    }
    rect(16, 20 - a.brows, 5, 1, a.hair);
    rect(27, 20 - a.brows, 5, 1, a.hair);
    rect(13, 27, 5, 2, '#e8a095');
    rect(31, 27, 5, 2, '#e8a095');
    rect(23, 27, 2, 2, '#d3997d');
    if (a.mouth === 1 || a.expression === 1) {
      rect(21, 30, 7, 2, '#884a4f');
      rect(22, 30, 5, 1, '#fff');
    } else if (a.mouth === 2 || a.expression === 2) {
      rect(23, 30, 3, 3, '#884a4f');
    } else rect(22, 31, 5, 1, '#975b59');
    if (a.accessory === 1) {
      rect(14, 21, 9, 1, '#31384c');
      rect(25, 21, 9, 1, '#31384c');
      rect(14, 21, 1, 7, '#31384c');
      rect(22, 21, 1, 7, '#31384c');
      rect(25, 21, 1, 7, '#31384c');
      rect(33, 21, 1, 7, '#31384c');
      rect(14, 27, 9, 1, '#31384c');
      rect(25, 27, 9, 1, '#31384c');
      rect(23, 23, 2, 1, '#31384c');
    }
    if (a.accessory === 2) {
      rect(32, 28, 4, 1, '#fff7da');
      rect(34, 26, 1, 5, '#fff7da');
    }
  }
  // Unbranded white hard hat, fixed for every appearance.
  rect(11, 5, 26, 2, '#dce4e4');
  rect(8, 7, 32, 11, '#d4dedd');
  rect(10, 6, 28, 10, '#f7faf4');
  rect(15, 3, 18, 3, '#f7faf4');
  rect(20, 2, 8, 13, '#fffef9');
  rect(7, 16, 34, 3, '#a8b9b8');
  rect(6, 15, 36, 3, '#f2f6f0');
  rect(9, 18, 30, 2, '#c5d0cc');
  rect(11, 15, 26, 1, '#fff');
  return canvas;
}
