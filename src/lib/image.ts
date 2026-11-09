import type { Pattern } from '../store';

/** Pattern tile as a data URL, 1px per stitch. rowZeroAtTop puts pattern row 0 on the first image line. */
export function patternDataUrl(p: Pattern, rowZeroAtTop = true): string {
  const cv = document.createElement('canvas');
  cv.width = p.w; cv.height = p.h;
  const ctx = cv.getContext('2d')!;
  for (let r = 0; r < p.h; r++)
    for (let c = 0; c < p.w; c++) {
      ctx.fillStyle = p.palette[p.colors[r * p.w + c]] ?? '#888';
      ctx.fillRect(c, rowZeroAtTop ? r : p.h - 1 - r, 1, 1);
    }
  return cv.toDataURL();
}

export function downloadBlob(data: Blob | string, filename: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: number[]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// Perceptually weighted RGB distance ("redmean").
function dist(a: number[], b: number[]) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
function nearest(px: number[], pal: number[][], allowed?: number[]) {
  let best = 0, bd = Infinity;
  const idx = allowed ?? pal.map((_, i) => i);
  for (const i of idx) {
    const d = dist(px, pal[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Box-filter resample of an image to stitch × row resolution. */
export function sampleImage(img: HTMLImageElement, w: number, h: number): number[][] {
  const f = 4;
  const cv = document.createElement('canvas');
  cv.width = w * f; cv.height = h * f;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const out: number[][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < f; j++)
        for (let i = 0; i < f; i++) {
          const k = ((y * f + j) * cv.width + x * f + i) * 4;
          r += d[k]; g += d[k + 1]; b += d[k + 2];
        }
      const n = f * f;
      out.push([r / n, g / n, b / n]);
    }
  return out;
}

/** k-means palette; locked entries stay fixed. */
export function buildPalette(px: number[][], k: number, locked: (number[] | null)[]): number[][] {
  const pal: number[][] = [];
  for (let i = 0; i < k; i++) if (locked[i]) pal[i] = locked[i]!.slice();
  // k-means++ style seeding (deterministic: farthest point)
  if (!pal.filter(Boolean).length) pal[0] = px[Math.floor(px.length / 2)].slice();
  for (let i = 0; i < k; i++) {
    if (pal[i]) continue;
    let far = 0, fd = -1;
    const present = pal.filter(Boolean);
    for (let p = 0; p < px.length; p += Math.max(1, Math.floor(px.length / 4000))) {
      const d = Math.min(...present.map((c) => dist(px[p], c)));
      if (d > fd) { fd = d; far = p; }
    }
    pal[i] = px[far].slice();
  }
  for (let it = 0; it < 14; it++) {
    const sum = pal.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      const i = nearest(p, pal);
      sum[i][0] += p[0]; sum[i][1] += p[1]; sum[i][2] += p[2]; sum[i][3]++;
    }
    pal.forEach((c, i) => {
      if (locked[i] || !sum[i][3]) return;
      pal[i] = [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]];
    });
  }
  return pal;
}

/** Maps pixels to palette indices, limiting colours per row and optionally dithering. */
export function mapToPalette(px: number[][], w: number, h: number, pal: number[][], perRow: number, dither: boolean): number[] {
  const work = px.map((p) => p.slice());
  const out = new Array(w * h).fill(0);
  for (let y = 0; y < h; y++) {
    let allowed: number[] | undefined;
    if (perRow < pal.length) {
      const count = pal.map(() => 0);
      for (let x = 0; x < w; x++) count[nearest(work[y * w + x], pal)]++;
      allowed = count.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]).slice(0, perRow).map((a) => a[1]);
    }
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const i = nearest(work[k], pal, allowed);
      out[k] = i;
      if (dither) {
        const err = [0, 1, 2].map((c) => work[k][c] - pal[i][c]);
        const push = (xx: number, yy: number, f: number) => {
          if (xx < 0 || xx >= w || yy >= h) return;
          const q = work[yy * w + xx];
          for (let c = 0; c < 3; c++) q[c] += err[c] * f;
        };
        push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16);
      }
    }
  }
  return out;
}
