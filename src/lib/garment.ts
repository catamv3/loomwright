import type { Piece, Pt } from '../store';

export type Measurements = {
  chest: number;
  length: number; // back neck to hem (sweaters)
  armhole: number;
  shoulder: number; // across back
  neck: number; // neck width
  sleeve: number; // underarm to wrist
  upperArm: number;
  wrist: number;
  waist: number;
  hip: number;
  napeToWaist: number; // back neck down to natural waist
  waistToHip: number; // natural waist down to fullest hip
  dressLength: number; // back neck to hem (dresses)
};

export type Style = 'setin' | 'drop' | 'raglan' | 'vest' | 'cardigan' | 'dress';
export type Neckline = 'crew' | 'scoop' | 'v' | 'boat';
export type SleeveLen = 'long' | 'three-quarter' | 'short' | 'none';
export type SkirtShape = 'pencil' | 'straight' | 'aline' | 'flare';
export type Role = 'back' | 'front' | 'sleeve';

/** A user-placed shaping point, stored relative to body landmarks so it follows size changes. */
export type ShapePoint = {
  id: string;
  from: string; // landmark key
  to: string; // landmark key
  t: number; // 0..1 position between the two landmarks
  dx: number; // cm wider (+) or narrower (−) than the standard outline at that height
  side: 'both' | 'left' | 'right';
};
export type Landmark = { key: string; label: string; y: number };

export type GarmentSpec = {
  style: Style;
  neckline: Neckline;
  sleeveLen: SleeveLen;
  skirt?: SkirtShape;
  sizeTable: string; // key in SIZE_TABLES
  size: string; // size key or 'custom'
  meas: Measurements;
  ease: number; // cm added to chest
  rib: number; // cm of ribbing/welt
  custom?: Partial<Record<Role, ShapePoint[]>>;
};

export const STYLES: { key: Style; label: string }[] = [
  { key: 'setin', label: 'Set-in sleeve sweater' },
  { key: 'drop', label: 'Drop-shoulder sweater' },
  { key: 'raglan', label: 'Raglan sweater' },
  { key: 'cardigan', label: 'Cardigan (set-in)' },
  { key: 'vest', label: 'Sleeveless vest' },
  { key: 'dress', label: 'Dress' },
];
export const SKIRTS: { key: SkirtShape; label: string }[] = [
  { key: 'pencil', label: 'Pencil' },
  { key: 'straight', label: 'Straight' },
  { key: 'aline', label: 'A-line' },
  { key: 'flare', label: 'Flared' },
];
export const NECKLINES: { key: Neckline; label: string }[] = [
  { key: 'crew', label: 'Crew' },
  { key: 'scoop', label: 'Scoop' },
  { key: 'v', label: 'V-neck' },
  { key: 'boat', label: 'Boat' },
];

type Fit = 'women' | 'men' | 'children';
// Waist, hip and dress lengths are derived from typical body proportions for each size table.
const DERIVE: Record<Fit, { waist: number; hip: number; w2h: number }> = {
  women: { waist: -20, hip: 8, w2h: 20 },
  men: { waist: -12, hip: 2, w2h: 20 },
  children: { waist: -4, hip: 4, w2h: 12 },
};
const mk = (fit: Fit) => (chest: number, length: number, armhole: number, shoulder: number, neck: number, sleeve: number, upperArm: number, wrist: number): Measurements => ({
  chest, length, armhole, shoulder, neck, sleeve, upperArm, wrist,
  waist: chest + DERIVE[fit].waist,
  hip: chest + DERIVE[fit].hip,
  napeToWaist: Math.round(length * 0.67),
  waistToHip: DERIVE[fit].w2h,
  dressLength: Math.round(length * 1.6),
});
const m = mk('women');
const mm = mk('men');
const mc = mk('children');

/** Fills in measurements missing from projects saved before dresses existed. */
export function fullMeas(x: Partial<Measurements> & Pick<Measurements, 'chest' | 'length'>): Measurements {
  const d = mk('women')(x.chest, x.length, x.armhole ?? 20, x.shoulder ?? 39, x.neck ?? 16, x.sleeve ?? 45, x.upperArm ?? 31, x.wrist ?? 16);
  return { ...d, ...Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'number' && !Number.isNaN(v))) } as Measurements;
}

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
      S: mm(91, 66, 21, 43, 17, 48, 31, 17),
      M: mm(99, 69, 22, 45, 17.5, 49, 33, 17.5),
      L: mm(107, 71, 23, 47, 18, 50, 35, 18),
      XL: mm(117, 74, 24, 49, 18.5, 51, 38, 18.5),
      '2XL': mm(127, 76, 25, 51, 19, 52, 41, 19),
    },
  },
  children: {
    label: "Children's",
    sizes: {
      '2': mc(56, 34, 12, 25, 11, 23, 18, 12),
      '4': mc(61, 39, 13, 27, 11.5, 28, 19.5, 12.5),
      '6': mc(66, 43, 14, 29, 12, 32, 21, 13),
      '8': mc(70, 47, 15, 31, 12.5, 35, 22.5, 13.5),
      '10': mc(74, 51, 16, 33, 13, 38, 24, 14),
      '12': mc(79, 54, 17, 35, 14, 41, 25.5, 14.5),
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
  waist: 'Waist',
  hip: 'Hip',
  napeToWaist: 'Back neck to waist',
  waistToHip: 'Waist to hip',
  dressLength: 'Dress length (back neck to hem)',
};
export const BODY_MEAS: (keyof Measurements)[] = ['chest', 'length', 'armhole', 'shoulder', 'neck', 'sleeve', 'upperArm', 'wrist'];
export const SHAPE_MEAS: (keyof Measurements)[] = ['waist', 'hip', 'napeToWaist', 'waistToHip', 'dressLength'];

export function defaultGarment(): GarmentSpec {
  return { style: 'setin', neckline: 'crew', sleeveLen: 'long', skirt: 'aline', sizeTable: 'women', size: 'M', meas: { ...SIZE_TABLES.women.sizes.M }, ease: 8, rib: 6, custom: {} };
}

const id = () => Math.random().toString(36).slice(2, 9);
export const newShapeId = id;
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

/** Key heights of a body piece (cm from the hem). */
function bodyDims(g: GarmentSpec) {
  const M = g.meas;
  const style = g.style;
  const L = style === 'dress' ? M.dressLength : M.length;
  const armhole = style === 'vest' || style === 'raglan' ? M.armhole + 2 : M.armhole;
  const uh = L - armhole;
  const yWaist = L - M.napeToWaist;
  const yHip = yWaist - M.waistToHip;
  return { L, armhole, uh, yWaist, yHip, drop: 2 };
}

function bodyHalf(g: GarmentSpec, front: boolean): Pt[] {
  const M = g.meas;
  const style = g.style;
  const halfW = (M.chest + g.ease) / 4;
  const { L, armhole, uh, yWaist, yHip, drop } = bodyDims(g);
  const boat = g.neckline === 'boat';
  const nx = (boat ? M.neck * 1.6 : M.neck) / 2;
  const depth = front ? neckDepth(g.neckline) : 2;
  const v = front && g.neckline === 'v';
  const neck = neckCurve(nx, L, depth, v);

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
  const top = [
    ...neck,
    { x: sx, y: L - drop },
    { x: sx, y: uh + armhole * 0.42 },
    { x: sx + inset * 0.25, y: uh + armhole * 0.18 },
    { x: halfW - inset * 0.55, y: uh + 0.6 },
    { x: halfW - inset * 0.55, y: uh },
    { x: halfW, y: uh },
  ];
  if (style !== 'dress') return [...top, { x: halfW, y: 0 }, { x: 0, y: 0 }];

  // Dress: bodice shapes in to the waist, out over the hip, then the skirt to the hem.
  const wW = Math.min(halfW, (M.waist + g.ease * 0.5) / 4);
  const hW = Math.max(wW, (M.hip + g.ease * 0.6) / 4);
  const skirtLen = Math.max(0, yHip);
  const flare = { pencil: -0.06, straight: 0, aline: 0.15, flare: 0.35 }[g.skirt ?? 'aline'];
  const hemW = Math.max(wW, hW + skirtLen * flare);
  const body: Pt[] = [];
  if (yWaist > 1 && yWaist < uh - 1) {
    body.push({ x: halfW - (halfW - wW) * 0.35, y: uh - (uh - yWaist) * 0.45 });
    body.push({ x: wW, y: yWaist });
    if (yHip > 1) {
      body.push({ x: wW + (hW - wW) * 0.72, y: yWaist - (yWaist - yHip) * 0.5 });
      body.push({ x: hW, y: yHip });
    }
  }
  const last = body.length ? body[body.length - 1] : { x: halfW, y: uh };
  return [...top, ...body, { x: yHip > 1 ? hemW : last.x, y: 0 }, { x: 0, y: 0 }];
}

function sleeveDims(g: GarmentSpec) {
  const M = g.meas;
  const factor = g.sleeveLen === 'long' ? 1 : g.sleeveLen === 'three-quarter' ? 0.7 : 0.3;
  const halfW = (M.chest + g.ease) / 4;
  let SL = M.sleeve * factor;
  if (g.style === 'drop') SL = Math.max(10, SL - (halfW - M.shoulder / 2));
  return { factor, SL, elbow: SL - M.sleeve * 0.45 };
}

function sleeveHalf(g: GarmentSpec): Pt[] {
  const M = g.meas;
  const topW = M.upperArm + g.ease * 0.5;
  const { factor, SL } = sleeveDims(g);
  const longCuff = M.wrist + 5;
  const cuffW = longCuff + (topW - longCuff) * (1 - factor) * 0.9;

  if (g.style === 'drop') {
    const w = Math.max(M.armhole, topW / 2 + 1);
    return [{ x: 0, y: SL }, { x: w, y: SL }, { x: cuffW / 2, y: 0 }, { x: 0, y: 0 }];
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

/** Named heights on a piece that shaping points are positioned between (bottom → top). */
export function landmarks(g0: GarmentSpec, role: Role): Landmark[] {
  const g = { ...g0, meas: fullMeas(g0.meas) };
  const out: Landmark[] = [];
  if (role === 'sleeve') {
    const { SL, elbow } = sleeveDims(g);
    const top = Math.max(...sleeveHalf(g).map((p) => p.y));
    out.push({ key: 'cuff', label: 'Cuff', y: 0 });
    if (elbow > 2 && elbow < SL - 2) out.push({ key: 'elbow', label: 'Elbow', y: r1(elbow) });
    out.push({ key: 'underarm', label: 'Underarm', y: r1(SL) });
    if (top > SL + 1) out.push({ key: 'captop', label: 'Sleeve top', y: r1(top) });
    return out;
  }
  const { L, uh, yWaist, yHip, drop } = bodyDims(g);
  out.push({ key: 'hem', label: 'Hem', y: 0 });
  if (yHip > 1 && yHip < uh - 1) out.push({ key: 'hip', label: 'Hip', y: r1(yHip) });
  if (yWaist > 1 && yWaist < uh - 1) out.push({ key: 'waist', label: 'Waist', y: r1(yWaist) });
  out.push({ key: 'bust', label: 'Bust', y: r1(uh) });
  if (g.style !== 'drop' && g.style !== 'raglan') out.push({ key: 'shoulder', label: 'Shoulder', y: r1(L - drop) });
  out.push({ key: 'neck', label: 'Neck', y: r1(L) });
  return out;
}

/** Height (cm) of a shaping point, or null if its landmarks don't exist on this garment. */
export function shapeY(sp: ShapePoint, lms: Landmark[]): number | null {
  const a = lms.find((l) => l.key === sp.from), b = lms.find((l) => l.key === sp.to);
  if (!a || !b) return null;
  return a.y + (b.y - a.y) * sp.t;
}

/** The outer edge crossing height y on one side: edge index, position along it and x. */
export function edgeAt(pts: Pt[], y: number, side: 'left' | 'right') {
  let best: { i: number; s: number; x: number } | null = null;
  for (const yy of [y, y + 0.01, y - 0.01]) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((yy - a.y) * (yy - b.y) >= 0) continue;
      const s = (yy - a.y) / (b.y - a.y);
      const x = a.x + s * (b.x - a.x);
      if (!best || (side === 'right' ? x > best.x : x < best.x)) best = { i, s, x };
    }
    if (best) return best;
  }
  return null;
}

/** Inserts the user's shaping points into a base outline. Offsets are measured from the base outline. */
export function applyShapePoints(pts: Pt[], shape: ShapePoint[], lms: Landmark[], symmetric: boolean): Pt[] {
  const ins: { edge: number; s: number; p: Pt }[] = [];
  for (const sp of shape) {
    const y = shapeY(sp, lms);
    if (y === null) continue;
    const sides: ('left' | 'right')[] = sp.side === 'both' && symmetric ? ['left', 'right'] : sp.side === 'left' ? ['left'] : ['right'];
    for (const side of sides) {
      const hit = edgeAt(pts, y, side);
      if (!hit) continue;
      ins.push({ edge: hit.i, s: hit.s, p: { x: r1(hit.x + (side === 'right' ? sp.dx : -sp.dx)), y: r1(y) } });
    }
  }
  if (!ins.length) return pts;
  const out: Pt[] = [];
  pts.forEach((p, i) => {
    out.push(p);
    ins.filter((n) => n.edge === i).sort((a, b) => a.s - b.s).forEach((n) => out.push(n.p));
  });
  return out;
}

function piece(name: string, points: Pt[], rib: number, role: Role): Piece {
  return { id: id(), name, points, offset: { x: 0, y: 0 }, markers: [], ribRows: rib, role };
}

/** Generates garment pieces. With base=true the user's shaping points are left out. */
export function generateGarment(g0: GarmentSpec, base = false): Piece[] {
  const g: GarmentSpec = { ...g0, meas: fullMeas(g0.meas) };
  const custom = base ? {} : g.custom ?? {};
  const shape = (role: Role, pts: Pt[], symmetric: boolean) =>
    custom[role]?.length ? applyShapePoints(pts, custom[role]!, landmarks(g, role), symmetric) : pts;
  const rib = g.rib;
  const pieces: Piece[] = [piece('Back', shape('back', mirror(bodyHalf(g, false)), true), rib, 'back')];
  if (g.style === 'cardigan') {
    const half = bodyHalf(g, true).map((p) => ({ x: r1(p.x), y: r1(p.y) }));
    // right front: centre front edge with 1.5 cm band allowance
    const band = 1.5;
    const pts = shape('front', [{ x: -band, y: half[0].y }, ...half.slice(0, -1), { x: -band, y: 0 }], false);
    pieces.push(piece('Right Front', pts, rib, 'front'));
    pieces.push(piece('Left Front', pts.map((p) => ({ x: -p.x, y: p.y })).reverse(), rib, 'front'));
  } else {
    pieces.push(piece('Front', shape('front', mirror(bodyHalf(g, true)), true), rib, 'front'));
  }
  const sleeves = g.style !== 'vest' && g.sleeveLen !== 'none';
  if (sleeves) pieces.push(piece('Sleeve', shape('sleeve', mirror(sleeveHalf(g)), true), Math.min(rib, 5), 'sleeve'));
  return pieces;
}

/** True when a role's piece is drawn as a full, mirrored shape (so "both sides" applies). */
export const isSymmetric = (g: GarmentSpec, role: Role) => !(g.style === 'cardigan' && role === 'front');
