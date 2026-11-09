import { useSyncExternalStore } from 'react';
import { GarmentSpec, defaultGarment, generateGarment } from './lib/garment';

export type Pt = { x: number; y: number };
export type Piece = {
  id: string;
  name: string;
  points: Pt[]; // cm, y up
  offset: { x: number; y: number }; // pattern offset in stitches / rows
  markers: number[]; // row numbers with markers
  ribRows?: number;
};
export type Pattern = {
  w: number;
  h: number;
  colors: number[]; // palette index per cell, row 0 = bottom
  stitches: number[]; // stitch type per cell
  palette: string[];
};
export type Gauge = { sts: number; rows: number }; // per 10 cm
export type Tracing = { src: string; widthCm: number; aspect: number; opacity: number; x: number; y: number } | null;
export type Section = 'garment' | 'drafting' | 'stitch' | 'knitting' | 'graphics';

export type State = {
  name: string;
  section: Section;
  gauge: Gauge;
  garment: GarmentSpec;
  pieces: Piece[];
  activePiece: string;
  pattern: Pattern;
  tracing: Tracing;
  knitRow: Record<string, number>;
};

export const STITCH = { KNIT: 0, PURL: 1, TUCK: 2, SLIP: 3, LACE_L: 4, LACE_R: 5, EYELET: 6 } as const;
export const STITCH_NAMES = ['Knit', 'Purl', 'Tuck', 'Slip', 'Transfer ←', 'Transfer →', 'Eyelet'];

export const uid = () => Math.random().toString(36).slice(2, 9);

function fairIsle(): Pattern {
  const w = 24, h = 16;
  const colors: number[] = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const dx = Math.abs((c % 12) - 5.5), dy = Math.abs((r % 16) - 7.5);
      const diamond = dx + dy < 6 && dx + dy > 3;
      const band = r === 0 || r === 15;
      colors.push(diamond || band ? 1 : (dx + dy < 1.6 ? 2 : 0));
    }
  return { w, h, colors, stitches: new Array(w * h).fill(0), palette: ['#f3efe6', '#2f4a6d', '#c0392b', '#e0b13a'] };
}

function initial(): State {
  const garment = defaultGarment();
  const pieces = generateGarment(garment);
  return {
    name: 'Untitled Sweater',
    section: 'garment',
    gauge: { sts: 28, rows: 40 },
    garment,
    pieces,
    activePiece: pieces[0].id,
    pattern: fairIsle(),
    tracing: null,
    knitRow: {},
  };
}

const KEY = 'loomwright.project.v1';
function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    if (!s.pieces || !s.pattern) return null;
    return { ...initial(), ...s };
  } catch {
    return null;
  }
}

let state: State = load() ?? initial();
const listeners = new Set<() => void>();
type Snap = Pick<State, 'pieces' | 'pattern' | 'garment' | 'tracing'>;
const past: Snap[] = [];
const future: Snap[] = [];
let saveTimer: number | undefined;

const snap = (): Snap => ({ pieces: state.pieces, pattern: state.pattern, garment: state.garment, tracing: state.tracing });

function emit() {
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }, 400);
}

export function getState() { return state; }

/** Update state. Pass history=true for undoable edits. */
export function setState(patch: Partial<State> | ((s: State) => Partial<State>), history = false) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  if (history) {
    past.push(snap());
    if (past.length > 80) past.shift();
    future.length = 0;
  }
  state = { ...state, ...p };
  emit();
}

export function undo() {
  const s = past.pop();
  if (!s) return;
  future.push(snap());
  state = { ...state, ...s };
  emit();
}
export function redo() {
  const s = future.pop();
  if (!s) return;
  past.push(snap());
  state = { ...state, ...s };
  emit();
}

export function newProject() {
  past.length = 0; future.length = 0;
  state = initial();
  emit();
}
export function loadProject(json: string) {
  const s = JSON.parse(json);
  if (!s.pieces || !s.pattern || !s.gauge) throw new Error('Not a Loomwright project file');
  past.length = 0; future.length = 0;
  state = { ...initial(), ...s, section: state.section };
  emit();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export function updatePiece(id: string, patch: Partial<Piece>, history = false) {
  setState((s) => ({ pieces: s.pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), history);
}

export function activePiece(s: State): Piece {
  return s.pieces.find((p) => p.id === s.activePiece) ?? s.pieces[0];
}
