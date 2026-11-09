import type { Gauge, Pattern, Piece, Pt } from '../store';
import { STITCH } from '../store';

export function bbox(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** x-intervals where a horizontal line at y is inside the polygon. */
export function spansAtY(pts: Pt[], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  xs.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

export type Span = [number, number]; // inclusive needle indices, 0-centred (negative = left)
export type KnitRow = {
  row: number; // 1-based
  spans: Span[];
  instruction: string;
  colors: number[];
  technique: string;
  alerts: string[];
  rib: boolean;
};

export const needleLabel = (i: number) => (i < 0 ? `L${-i}` : `R${i + 1}`);
export const spanLabel = (s: Span) => `${needleLabel(s[0])}–${needleLabel(s[1])}`;
export const spanCount = (s: Span) => s[1] - s[0] + 1;

/** Converts a piece outline into row-by-row needle spans using the gauge. */
export function pieceRows(piece: Piece, g: Gauge): { rows: Span[][]; leftNeedle: number; width: number } {
  const sPerCm = g.sts / 10, rPerCm = g.rows / 10;
  const b = bbox(piece.points);
  const cx = (b.minX + b.maxX) / 2;
  const n = Math.max(1, Math.round(b.h * rPerCm));
  const rows: Span[][] = [];
  for (let r = 0; r < n; r++) {
    const y = b.minY + ((r + 0.5) / n) * b.h;
    const spans = spansAtY(piece.points, y)
      .map(([a, c]) => [Math.round((a - cx) * sPerCm), Math.round((c - cx) * sPerCm) - 1] as Span)
      .filter((s) => s[1] >= s[0]);
    rows.push(spans);
  }
  const half = Math.round((b.w * sPerCm) / 2);
  return { rows, leftNeedle: -half, width: half * 2 };
}

export function cellAt(p: Pattern, col: number, row: number) {
  const c = ((col % p.w) + p.w) % p.w, r = ((row % p.h) + p.h) % p.h;
  return r * p.w + c;
}

function classify(stitches: Set<number>, nColors: number) {
  if (stitches.has(STITCH.LACE_L) || stitches.has(STITCH.LACE_R) || stitches.has(STITCH.EYELET)) return 'Lace';
  if (stitches.has(STITCH.TUCK)) return 'Tuck';
  if (stitches.has(STITCH.SLIP)) return 'Slip';
  if (nColors >= 2) return 'Fair Isle';
  if (stitches.has(STITCH.PURL)) return 'Knit / Purl';
  return 'Stockinette';
}

function describeShaping(prev: Span[], cur: Span[]): string {
  if (prev.length === 1 && cur.length === 1) {
    const [pl, pr] = prev[0], [cl, cr] = cur[0];
    const parts: string[] = [];
    const left = pl - cl, right = cr - pr;
    const say = (d: number, side: string) => {
      if (d > 0) parts.push(d > 2 ? `Cast on ${d} sts at ${side}` : `Inc ${d} st${d > 1 ? 's' : ''} at ${side}`);
      if (d < 0) parts.push(-d > 2 ? `Cast off ${-d} sts at ${side}` : `Dec ${-d} st${d < -1 ? 's' : ''} at ${side}`);
    };
    say(left, 'left');
    say(right, 'right');
    return parts.join(' · ');
  }
  if (prev.length === 1 && cur.length === 2) {
    const gapL = cur[0][1] + 1, gapR = cur[1][0] - 1;
    const n = gapR - gapL + 1;
    return `Divide: ${n > 0 ? `cast off ${n} centre sts (${needleLabel(gapL)}–${needleLabel(gapR)}), ` : ''}put ${spanLabel(cur[0])} into hold, knit right side ${spanLabel(cur[1])}`;
  }
  if (cur.length === 0 && prev.length) return 'Cast off remaining sts';
  if (prev.length !== cur.length) return `Work ${cur.map(spanLabel).join(' and ')}`;
  const parts: string[] = [];
  cur.forEach((s, i) => {
    const d = describeShaping([prev[i]], [s]);
    if (d) parts.push(`${i === 0 ? 'Left side' : 'Right side'}: ${d}`);
  });
  return parts.join(' · ');
}

/** Full row-by-row knitting plan for a piece with the stitch pattern applied. */
export function knitPlan(piece: Piece, g: Gauge, pat: Pattern): KnitRow[] {
  const { rows, leftNeedle } = pieceRows(piece, g);
  const ribRows = Math.round(((piece.ribRows ?? 0) * g.rows) / 10);
  const out: KnitRow[] = [];
  let prevColors = '';
  let prevTech = '';
  rows.forEach((spans, r) => {
    const rib = r < ribRows;
    const colorSet = new Set<number>();
    const stitchSet = new Set<number>();
    if (!rib) {
      for (const [a, b] of spans)
        for (let i = a; i <= b; i++) {
          const k = cellAt(pat, i - leftNeedle + piece.offset.x, r - ribRows + piece.offset.y);
          colorSet.add(pat.colors[k]);
          stitchSet.add(pat.stitches[k]);
        }
    } else colorSet.add(0);
    const colors = [...colorSet].sort((a, b) => a - b);
    const technique = rib ? 'Ribbing / welt' : classify(stitchSet, colors.length);
    let instruction = '';
    if (r === 0) instruction = spans.length ? `Cast on ${spans.reduce((t, s) => t + spanCount(s), 0)} sts: ${spans.map(spanLabel).join(', ')}` : '';
    else instruction = describeShaping(rows[r - 1], spans);
    const alerts: string[] = [];
    const ck = colors.join(',');
    if (r > 0 && ck !== prevColors) alerts.push(`Yarn change: ${colors.map((c) => `colour ${c + 1}`).join(' + ')}`);
    if (r > 0 && technique !== prevTech) alerts.push(`Technique changes to ${technique}`);
    if (r > 0 && instruction) alerts.push(instruction);
    if (r === ribRows && ribRows > 0) alerts.push('Rib complete – transfer to main bed and start pattern');
    if (piece.markers.includes(r + 1)) alerts.push('Place marker');
    prevColors = ck;
    prevTech = technique;
    out.push({ row: r + 1, spans, instruction, colors, technique, alerts, rib });
  });
  const last = rows[rows.length - 1];
  if (out.length && last.length) out[out.length - 1].alerts.push('Last row – cast off all sts');
  return out;
}

/** Condensed instruction lines for printing: technique changes plus grouped, regular shaping. */
export function summarize(plan: KnitRow[]): string[] {
  if (!plan.length) return [];
  const ev: { row: number; text: string }[] = [];
  ev.push({ row: 1, text: plan[0].instruction });
  plan.forEach((r, i) => {
    if (i === 0 || r.technique !== plan[i - 1].technique) ev.push({ row: r.row, text: `From row ${r.row}: ${r.technique}${r.spans.length ? ` (${r.colors.length} colour${r.colors.length > 1 ? 's' : ''})` : ''}` });
  });
  const shaping = plan.filter((r, i) => i > 0 && r.instruction);
  for (let i = 0; i < shaping.length; ) {
    let j = i;
    const d = shaping[i + 1] ? shaping[i + 1].row - shaping[i].row : 0;
    while (j + 1 < shaping.length && shaping[j + 1].instruction === shaping[i].instruction && shaping[j + 1].row - shaping[j].row === d) j++;
    const n = j - i + 1;
    ev.push({
      row: shaping[i].row,
      text: n > 1
        ? `Rows ${shaping[i].row}–${shaping[j].row}: ${shaping[i].instruction}, every ${d === 1 ? 'row' : `${d} rows`} (${n} times)`
        : `Row ${shaping[i].row}: ${shaping[i].instruction}`,
    });
    i = j + 1;
  }
  ev.sort((a, b) => a.row - b.row);
  const last = plan[plan.length - 1];
  return [...ev.map((e) => (e.row === 1 && e === ev[0] ? `Row 1: ${e.text}` : e.text)), `Row ${last.row}: cast off remaining sts.`];
}

/** Renders the piece with stitch colours into an ImageData-sized canvas (1px per stitch). */
export function renderPieceCanvas(piece: Piece, g: Gauge, pat: Pattern): HTMLCanvasElement {
  const plan = pieceRows(piece, g);
  const ribRows = Math.round(((piece.ribRows ?? 0) * g.rows) / 10);
  const w = plan.width + 2, h = plan.rows.length;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w); cv.height = Math.max(1, h);
  const ctx = cv.getContext('2d')!;
  plan.rows.forEach((spans, r) => {
    for (const [a, b] of spans)
      for (let i = a; i <= b; i++) {
        const k = cellAt(pat, i - plan.leftNeedle + piece.offset.x, r - ribRows + piece.offset.y);
        ctx.fillStyle = r < ribRows ? pat.palette[0] : pat.palette[pat.colors[k]] ?? '#888';
        ctx.fillRect(i - plan.leftNeedle + 1, h - 1 - r, 1, 1);
      }
  });
  return cv;
}
