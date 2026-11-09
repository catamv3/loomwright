import type { Piece, Pt } from '../store';

export type Measurements = {
  chest: number;
  length: number; // back neck to hem
  armhole: number;
  shoulder: number; // across back
  neck: number; // neck width
  sleeve: number; // underarm to wrist
  upperArm: number;
  wrist: number;
};

export type Style = 'setin' | 'drop' | 'raglan' | 'vest' | 'cardigan';
export type Neckline = 'crew' | 'scoop' | 'v' | 'boat';
export type SleeveLen = 'long' | 'three-quarter' | 'short';

export type GarmentSpec = {
  style: Style;
  neckline: Neckline;
  sleeveLen: SleeveLen;
  sizeTable: string; // key in SIZE_TABLES
  size: string; // size key or 'custom'
  meas: Measurements;
  ease: number; // cm added to chest
  rib: number; // cm of ribbing/welt
};

export const STYLES: { key: Style; label: string }[] = [
  { key: 'setin', label: 'Set-in sleeve sweater' },
  { key: 'drop', label: 'Drop-shoulder sweater' },
  { key: 'raglan', label: 'Raglan sweater' },
  { key: 'cardigan', label: 'Cardigan (set-in)' },
  { key: 'vest', label: 'Sleeveless vest' },
];
export const NECKLINES: { key: Neckline; label: string }[] = [
  { key: 'crew', label: 'Crew' },
  { key: 'scoop', label: 'Scoop' },
  { key: 'v', label: 'V-neck' },
  { key: 'boat', label: 'Boat' },
];

const m = (chest: number, length: number, armhole: number, shoulder: number, neck: number, sleeve: number, upperArm: number, wrist: number): Measurements =>
  ({ chest, length, armhole, shoulder, neck, sleeve, upperArm, wrist });

/** Standard body measurements (cm). Approximations of common industry size charts. */
export const SIZE_TABLES: Record<string, { label: string; sizes: Record<string, Measurements> }> = {
  women: {
    label: "Women's",
    sizes: {
      XS: m(81, 56, 18, 36, 15, 43, 27, 15),
      S: m(86, 58, 19, 37.5, 15.5, 44, 29, 15.5),
      M: m(94, 60, 20, 39, 16, 45, 31, 16),
      L: m(102, 62, 21, 41, 16.5, 46, 33, 16.5),
      XL: m(112, 64, 22, 43, 17, 46.5, 36, 17),
      '2XL': m(122, 66, 23, 45, 17.5, 47, 39, 17.5),
    },
  },
  men: {
    label: "Men's",
    sizes: {
      S: m(91, 66, 21, 43, 17, 48, 31, 17),
      M: m(99, 69, 22, 45, 17.5, 49, 33, 17.5),
      L: m(107, 71, 23, 47, 18, 50, 35, 18),
      XL: m(117, 74, 24, 49, 18.5, 51, 38, 18.5),
      '2XL': m(127, 76, 25, 51, 19, 52, 41, 19),
    },
  },
  children: {
    label: "Children's",
    sizes: {
      '2': m(56, 34, 12, 25, 11, 23, 18, 12),
      '4': m(61, 39, 13, 27, 11.5, 28, 19.5, 12.5),
      '6': m(66, 43, 14, 29, 12, 32, 21, 13),
      '8': m(70, 47, 15, 31, 12.5, 35, 22.5, 13.5),
      '10': m(74, 51, 16, 33, 13, 38, 24, 14),
      '12': m(79, 54, 17, 35, 14, 41, 25.5, 14.5),
    },
  },
};

export const MEAS_LABELS: Record<keyof Measurements, string> = {
  chest: 'Chest',
  length: 'Body length',
  armhole: 'Armhole depth',
  shoulder: 'Shoulder width',
  neck: 'Neck width',
  sleeve: 'Sleeve (underarm)',
  upperArm: 'Upper arm',
  wrist: 'Wrist',
};

export function defaultGarment(): GarmentSpec {
  return { style: 'setin', neckline: 'crew', sleeveLen: 'long', sizeTable: 'women', size: 'M', meas: { ...SIZE_TABLES.women.sizes.M }, ease: 8, rib: 6 };
}

const id = () => Math.random().toString(36).slice(2, 9);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Build a symmetric polygon from its right half (listed top-centre → bottom-centre). */
function mirror(right: Pt[]): Pt[] {
  const left = right.slice(1, -1).reverse().map((p) => ({ x: -p.x, y: p.y }));
  return [...right, ...left].map((p) => ({ x: r1(p.x), y: r1(p.y) }));
}

function neckDepth(n: Neckline) {
  return n === 'crew' ? 7 : n === 'scoop' ? 11 : n === 'v' ? 18 : 3;
}

function neckCurve(nx: number, top: number, depth: number, v: boolean): Pt[] {
  // from centre-bottom of neck to neck edge at top (right half, top-centre first)
  if (v) return [{ x: 0, y: top - depth }, { x: nx, y: top }];
  return [
    { x: 0, y: top - depth },
    { x: nx * 0.55, y: top - depth * 0.92 },
    { x: nx * 0.85, y: top - depth * 0.6 },
    { x: nx, y: top - depth * 0.15 },
    { x: nx, y: top },
  ];
}

function bodyHalf(g: GarmentSpec, front: boolean): Pt[] {
  const M = g.meas;
  const style = g.style;
  const halfW = (M.chest + g.ease) / 4;
  const L = M.length;
  const armhole = style === 'vest' ? M.armhole + 2 : style === 'raglan' ? M.armhole + 2 : M.armhole;
  const uh = L - armhole;
  const boat = g.neckline === 'boat';
  const nx = (boat ? M.neck * 1.6 : M.neck) / 2;
  const depth = front ? neckDepth(g.neckline) : 2;
  const v = front && g.neckline === 'v';
  const neck = neckCurve(nx, L, depth, v);
  const drop = 2;

  if (style === 'drop') {
    return [...neck, { x: halfW, y: L - drop }, { x: halfW, y: 0 }, { x: 0, y: 0 }];
  }
  if (style === 'raglan') {
    // front raglan finishes lower than the back; a short flat top joins the sleeve saddle
    const topY = front ? L - Math.min(4, depth * 0.4) : L;
    const curve = neck.slice(0, -1).filter((p) => p.y <= topY);
    return [...curve, { x: nx, y: topY }, { x: nx + 1.5, y: topY }, { x: halfW - 2.5, y: uh }, { x: halfW, y: uh }, { x: halfW, y: 0 }, { x: 0, y: 0 }];
  }
  const sx = Math.min(M.shoulder / 2, halfW - 1);
  const inset = halfW - sx;
  return [
    ...neck,
    { x: sx, y: L - drop },
    { x: sx, y: uh + armhole * 0.42 },
    { x: sx + inset * 0.25, y: uh + armhole * 0.18 },
    { x: halfW - inset * 0.55, y: uh + 0.6 },
    { x: halfW - inset * 0.55, y: uh },
    { x: halfW, y: uh },
    { x: halfW, y: 0 },
    { x: 0, y: 0 },
  ];
}

function sleeveHalf(g: GarmentSpec): Pt[] {
  const M = g.meas;
  const topW = M.upperArm + g.ease * 0.5;
  const factor = g.sleeveLen === 'long' ? 1 : g.sleeveLen === 'three-quarter' ? 0.7 : 0.3;
  let SL = M.sleeve * factor;
  const longCuff = M.wrist + 5;
  const cuffW = longCuff + (topW - longCuff) * (1 - factor) * 0.9;
  const halfW = (M.chest + g.ease) / 4;

  if (g.style === 'drop') {
    SL = Math.max(10, SL - (halfW - M.shoulder / 2));
    const w = Math.max(M.armhole, topW / 2 + 1);
    return [{ x: 0, y: SL }, { x: w, y: SL }, { x: cuffW / 2, y: 0 }, { x: 0, y: 0 }].map((p) => ({ x: p.x, y: p.y }));
  }
  if (g.style === 'raglan') {
    const rag = M.armhole + 2 - 1;
    return [{ x: 0, y: SL + rag }, { x: 2.5, y: SL + rag }, { x: topW / 2 - 2.5, y: SL }, { x: topW / 2, y: SL }, { x: cuffW / 2, y: 0 }, { x: 0, y: 0 }];
  }
  const cap = M.armhole * 0.62;
  const hw = topW / 2;
  return [
    { x: 0, y: SL + cap },
    { x: hw * 0.35, y: SL + cap - 0.4 },
    { x: hw * 0.6, y: SL + cap * 0.7 },
    { x: hw * 0.72, y: SL + cap * 0.3 },
    { x: hw - 2.2, y: SL + 0.6 },
    { x: hw - 2.2, y: SL },
    { x: hw, y: SL },
    { x: cuffW / 2, y: 0 },
    { x: 0, y: 0 },
  ];
}

function piece(name: string, points: Pt[], rib: number): Piece {
  return { id: id(), name, points, offset: { x: 0, y: 0 }, markers: [], ribRows: rib };
}

export function generateGarment(g: GarmentSpec): Piece[] {
  const rib = g.rib;
  const back = mirror(bodyHalf(g, false));
  const pieces: Piece[] = [piece('Back', back, rib)];
  if (g.style === 'cardigan') {
    const half = bodyHalf(g, true).map((p) => ({ x: r1(p.x), y: r1(p.y) }));
    // right front: centre front edge with 1.5 cm band allowance
    const band = 1.5;
    const pts = [{ x: -band, y: half[0].y }, ...half.slice(0, -1), { x: -band, y: 0 }];
    pieces.push(piece('Right Front', pts, rib));
    pieces.push(piece('Left Front', pts.map((p) => ({ x: -p.x, y: p.y })).reverse(), rib));
  } else {
    pieces.push(piece('Front', mirror(bodyHalf(g, true)), rib));
  }
  if (g.style !== 'vest') pieces.push(piece('Sleeve', mirror(sleeveHalf(g)), Math.min(rib, 5)));
  return pieces;
}
