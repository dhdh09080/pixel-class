/** Small original event props follow the classroom's muted wood, forest and brass palette. */
export function competitionBannerCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 32;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(2, 2);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  r(0, 2, 140, 11, '#4c654c');
  r(1, 3, 138, 9, '#728353');
  r(8, 0, 124, 16, '#3d5f48');
  r(9, 1, 122, 14, '#536f4e');
  r(12, 2, 116, 1, '#a8b383');
  r(12, 13, 116, 1, '#a8b383');
  r(4, 5, 2, 5, '#c9bd7b');
  r(134, 5, 2, 5, '#c9bd7b');
  return canvas;
}
export function competitionBoardCanvas(celebrating = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 124;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(2, 2);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  r(3, 3, 43, 57, '#a1b293');
  r(1, 1, 44, 57, '#795c42');
  r(2, 2, 42, 55, '#c19b67');
  r(4, 4, 38, 51, '#8b6c49');
  r(5, 5, 36, 49, '#f2edd7');
  r(7, 7, 32, 1, '#fffaf0');
  r(7, 48, 32, 1, '#d8d4bc');
  r(8, 51, 30, 1, '#e4dfc7');
  r(21, 3, 4, 3, '#5a7250');
  r(22, 3, 1, 1, '#a2b58a');
  // Two stitched corner ribbons make the active display distinct without visual noise.
  r(7, 10, 2, 6, '#8fa57c');
  r(37, 10, 2, 6, '#8fa57c');
  if (celebrating) {
    r(7, 26, 2, 2, '#bba260');
    r(37, 28, 2, 2, '#bba260');
    r(12, 12, 1, 2, '#bba260');
  }
  return canvas;
}
export function competitionTrophyCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 38;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.scale(2, 2);
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  r(4, 0, 12, 2, '#7e6543');
  r(1, 2, 18, 2, '#8b703e');
  r(2, 4, 3, 5, '#c5a75c');
  r(15, 4, 3, 5, '#c5a75c');
  r(3, 8, 3, 2, '#8c743f');
  r(14, 8, 3, 2, '#8c743f');
  r(5, 2, 10, 8, '#d4b765');
  r(6, 3, 3, 5, '#f2d98c');
  r(7, 9, 6, 2, '#c5a04b');
  r(9, 11, 2, 4, '#a88c45');
  r(7, 14, 6, 2, '#d0b365');
  r(5, 16, 10, 2, '#786446');
  r(4, 18, 12, 1, '#594d3c');
  r(6, 16, 8, 1, '#ba9e63');
  return canvas;
}
