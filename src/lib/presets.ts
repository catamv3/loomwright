import type { Pattern } from '../store';
import { STITCH } from '../store';

const make = (w: number, h: number, palette: string[], fn: (c: number, r: number) => [number, number]): Pattern => {
  const colors: number[] = [], stitches: number[] = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const [col, st] = fn(c, r);
      colors.push(col); stitches.push(st);
    }
  return { w, h, colors, stitches, palette };
};

export const PRESETS: Record<string, () => Pattern> = {
  'Fair Isle diamonds': () => make(24, 16, ['#f3efe6', '#2f4a6d', '#c0392b', '#e0b13a'], (c, r) => {
    const dx = Math.abs((c % 12) - 5.5), dy = Math.abs(r - 7.5);
    return [(dx + dy < 6 && dx + dy > 3) || r === 0 || r === 15 ? 1 : dx + dy < 1.6 ? 2 : 0, 0];
  }),
  Checkerboard: () => make(8, 8, ['#f6f1e7', '#3a3a3c'], (c, r) => [((c >> 2) + (r >> 2)) % 2, 0]),
  "Bird's eye": () => make(2, 2, ['#f6f1e7', '#8e3b46'], (c, r) => [(c + r) % 2, 0]),
  Stripes: () => make(1, 8, ['#f6f1e7', '#2e6f6a', '#e0b13a'], (_c, r) => [r < 4 ? 0 : r < 6 ? 1 : 2, 0]),
  'Tuck rib': () => make(4, 4, ['#e8e1d3'], (c) => [0, c % 4 === 0 ? STITCH.TUCK : STITCH.KNIT]),
  'Slip honeycomb': () => make(4, 8, ['#e8e1d3', '#5b6b8c'], (c, r) => {
    const on = r < 4 ? c % 4 < 2 : (c + 2) % 4 < 2;
    return [r % 2, on && r % 2 === 0 ? STITCH.SLIP : 0];
  }),
  'Eyelet lace': () => make(8, 8, ['#f3ece0'], (c, r) => {
    if (r === 1 && c === 3) return [0, STITCH.LACE_R];
    if (r === 1 && c === 4) return [0, STITCH.EYELET];
    if (r === 5 && c === 7) return [0, STITCH.LACE_R];
    if (r === 5 && c === 0) return [0, STITCH.EYELET];
    return [0, 0];
  }),
  'Faggot lace': () => make(6, 4, ['#f3ece0'], (c, r) => {
    if (r % 2 === 0 && c % 6 === 2) return [0, STITCH.LACE_L];
    if (r % 2 === 0 && c % 6 === 1) return [0, STITCH.EYELET];
    return [0, 0];
  }),
};
