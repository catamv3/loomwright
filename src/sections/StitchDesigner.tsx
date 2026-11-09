import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pattern, STITCH, STITCH_NAMES, activePiece, setState, updatePiece, useStore, Piece } from '../store';
import { NumField, Seg, toast, CMD } from '../components/ui';
import { downloadBlob, hexToRgb, patternDataUrl } from '../lib/image';
import { PieceFill, Outline } from '../components/PieceShape';
import { bbox } from '../lib/knit';
import { PRESETS } from '../lib/presets';

type Tool = 'pencil' | 'line' | 'rect' | 'frect' | 'fill' | 'picker' | 'eraser';
const TOOLS: { key: Tool; label: string; title: string }[] = [
  { key: 'pencil', label: '✎', title: 'Pencil (B)' },
  { key: 'line', label: '╱', title: 'Line (L)' },
  { key: 'rect', label: '▭', title: 'Rectangle (R)' },
  { key: 'frect', label: '■', title: 'Filled rectangle (⇧R)' },
  { key: 'fill', label: '◍', title: 'Fill (F)' },
  { key: 'picker', label: '⌖', title: 'Eyedropper (I)' },
  { key: 'eraser', label: '⌫', title: 'Eraser (E)' },
];

const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function drawSymbol(ctx: CanvasRenderingContext2D, st: number, x: number, y: number, w: number, h: number, ink: string) {
  if (!st || w < 5) return;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, w / 9);
  const cx = x + w / 2, cy = y + h / 2, rx = w * 0.3, ry = h * 0.3;
  ctx.beginPath();
  if (st === STITCH.PURL) { ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy); }
  else if (st === STITCH.TUCK) { ctx.moveTo(cx - rx, cy - ry); ctx.lineTo(cx - rx, cy + ry * 0.3); ctx.quadraticCurveTo(cx, cy + ry * 1.4, cx + rx, cy + ry * 0.3); ctx.lineTo(cx + rx, cy - ry); }
  else if (st === STITCH.SLIP) { ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry); }
  else if (st === STITCH.LACE_L) { ctx.moveTo(cx + rx, cy - ry); ctx.lineTo(cx - rx, cy + ry); ctx.moveTo(cx - rx, cy + ry); ctx.lineTo(cx - rx, cy); ctx.moveTo(cx - rx, cy + ry); ctx.lineTo(cx, cy + ry); }
  else if (st === STITCH.LACE_R) { ctx.moveTo(cx - rx, cy - ry); ctx.lineTo(cx + rx, cy + ry); ctx.moveTo(cx + rx, cy + ry); ctx.lineTo(cx + rx, cy); ctx.moveTo(cx + rx, cy + ry); ctx.lineTo(cx, cy + ry); }
  else if (st === STITCH.EYELET) { ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
  ctx.stroke();
}

function drawStitch(ctx: CanvasRenderingContext2D, st: number, color: string, x: number, y: number, w: number, h: number) {
  // knitted-fabric look: each stitch is a "V"
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y, w, h);
  if (st === STITCH.EYELET) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = color;
  const lean = st === STITCH.TUCK ? 0.08 : 0;
  const thin = st === STITCH.SLIP ? 0.3 : 0.46;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    const mx = x + w / 2;
    ctx.moveTo(mx, y + h * 1.05);
    ctx.quadraticCurveTo(mx + side * w * (thin + lean), y + h * 0.7, mx + side * w * (thin + lean), y - h * 0.15);
    ctx.quadraticCurveTo(mx + side * w * 0.05, y + h * 0.15, mx, y + h * 0.45);
    ctx.closePath();
    ctx.fill();
  }
  if (st === STITCH.PURL) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + h * 0.35, w, h * 0.3);
  }
  if (st === STITCH.LACE_L || st === STITCH.LACE_R) {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = Math.max(1, w / 10);
    ctx.beginPath();
    ctx.moveTo(x + (st === STITCH.LACE_L ? w : 0), y); ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  }
}

function bresenham(x0: number, y0: number, x1: number, y1: number, cb: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cb(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export default function StitchDesigner() {
  const s = useStore();
  const p = s.pattern;
  const [tab, setTab] = useState<'design' | 'arrange'>('design');
  const [tool, setTool] = useState<Tool>('pencil');
  const [mode, setMode] = useState<'color' | 'stitch'>('color');
  const [ciRaw, setCi] = useState(1);
  const ci = Math.min(ciRaw, s.pattern.palette.length - 1);
  const [st, setSt] = useState<number>(STITCH.TUCK);
  const [cell, setCell] = useState(18);
  const [rep, setRep] = useState({ x: 3, y: 2 });
  const [trueTension, setTrueTension] = useState(true);
  const [texture, setTexture] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const work = useRef<{ colors: number[]; stitches: number[]; base: { colors: number[]; stitches: number[] }; start: [number, number]; last: [number, number] } | null>(null);

  const cw = cell, ch = trueTension ? cell * (s.gauge.sts / s.gauge.rows) : cell;
  const W = p.w * rep.x * cw, H = p.h * rep.y * ch;

  const render = useCallback((colors = p.colors, stitches = p.stitches) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const rows = p.h * rep.y, cols = p.w * rep.x;
    for (let R = 0; R < rows; R++)
      for (let C = 0; C < cols; C++) {
        const k = (R % p.h) * p.w + (C % p.w);
        const x = C * cw, y = (rows - 1 - R) * ch;
        const col = p.palette[colors[k]] ?? '#888';
        if (texture) drawStitch(ctx, stitches[k], col, x, y, cw, ch);
        else {
          ctx.fillStyle = col; ctx.fillRect(x, y, cw, ch);
          drawSymbol(ctx, stitches[k], x, y, cw, ch, lum(col) > 0.55 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)');
        }
      }
    // dim the repeats outside the primary tile
    ctx.fillStyle = 'rgba(128,128,128,0.28)';
    ctx.fillRect(p.w * cw, 0, W - p.w * cw, H);
    ctx.fillRect(0, 0, p.w * cw, H - p.h * ch);
    if (!texture && cw >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let C = 0; C <= cols; C++) { ctx.moveTo(C * cw + 0.5, 0); ctx.lineTo(C * cw + 0.5, H); }
      for (let R = 0; R <= rows; R++) { ctx.moveTo(0, R * ch + 0.5); ctx.lineTo(W, R * ch + 0.5); }
      ctx.stroke();
    }
    ctx.strokeStyle = '#d9542b'; ctx.lineWidth = 2;
    ctx.strokeRect(1, H - p.h * ch + 1, p.w * cw - 2, p.h * ch - 2);
  }, [p, W, H, cw, ch, rep, texture]);

  useEffect(() => { if (tab === 'design') render(); }, [render, tab]);

  const cellFrom = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    const C = Math.floor((e.clientX - r.left) / cw), Rt = Math.floor((H - (e.clientY - r.top)) / ch);
    return [((C % p.w) + p.w) % p.w, ((Rt % p.h) + p.h) % p.h];
  };

  const paint = (colors: number[], stitches: number[], c: number, r: number) => {
    const k = r * p.w + c;
    if (tool === 'eraser') { colors[k] = 0; stitches[k] = 0; return; }
    if (mode === 'color') colors[k] = ci; else stitches[k] = st;
  };

  const applyShape = (a: [number, number], b: [number, number]) => {
    const w = work.current!;
    w.colors = w.base.colors.slice(); w.stitches = w.base.stitches.slice();
    if (tool === 'line') bresenham(a[0], a[1], b[0], b[1], (x, y) => paint(w.colors, w.stitches, x, y));
    else {
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
        if (tool === 'frect' || x === x0 || x === x1 || y === y0 || y === y1) paint(w.colors, w.stitches, x, y);
    }
  };

  const flood = (c: number, r: number) => {
    const arr = mode === 'color' ? p.colors.slice() : p.stitches.slice();
    const target = arr[r * p.w + c], val = mode === 'color' ? ci : st;
    if (target === val) return;
    const stack = [[c, r]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= p.w || y >= p.h || arr[y * p.w + x] !== target) continue;
      arr[y * p.w + x] = val;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    setState({ pattern: { ...p, [mode === 'color' ? 'colors' : 'stitches']: arr } }, true);
  };

  const onDown = (e: React.PointerEvent) => {
    const [c, r] = cellFrom(e);
    if (tool === 'picker') {
      const k = r * p.w + c;
      if (mode === 'color') setCi(p.colors[k]); else setSt(p.stitches[k]);
      setTool('pencil');
      return;
    }
    if (tool === 'fill') { flood(c, r); return; }
    (e.target as Element).setPointerCapture(e.pointerId);
    const base = { colors: p.colors.slice(), stitches: p.stitches.slice() };
    work.current = { colors: base.colors.slice(), stitches: base.stitches.slice(), base, start: [c, r], last: [c, r] };
    if (tool === 'pencil' || tool === 'eraser') paint(work.current.colors, work.current.stitches, c, r);
    else applyShape([c, r], [c, r]);
    render(work.current.colors, work.current.stitches);
  };
  const onMove = (e: React.PointerEvent) => {
    const w = work.current;
    if (!w) return;
    const cr = cellFrom(e);
    if (tool === 'pencil' || tool === 'eraser') {
      bresenham(w.last[0], w.last[1], cr[0], cr[1], (x, y) => paint(w.colors, w.stitches, x, y));
    } else applyShape(w.start, cr);
    w.last = cr;
    render(w.colors, w.stitches);
  };
  const onUp = () => {
    const w = work.current;
    if (!w) return;
    work.current = null;
    setState({ pattern: { ...p, colors: w.colors, stitches: w.stitches } }, true);
  };

  // pinch zoom
  const stageRef = useRef<HTMLDivElement>(null);
  const fitCell = () => {
    const el = stageRef.current;
    const avail = (el?.clientWidth ?? 640) - 48;
    setCell(Math.max(2, Math.min(48, avail / (p.w * rep.x))));
  };
  useEffect(() => {
    // phones start zoomed to fit the screen
    if (window.matchMedia?.('(max-width: 860px)').matches) fitCell();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = stageRef.current;
    const h = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setCell((c) => Math.max(2, Math.min(48, c * Math.exp(-e.deltaY * 0.01))));
    };
    el?.addEventListener('wheel', h, { passive: false });
    return () => el?.removeEventListener('wheel', h);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select') || e.metaKey || e.ctrlKey) {
        if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setCell((c) => Math.min(48, c * 1.3)); }
        if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); setCell((c) => Math.max(2, c / 1.3)); }
        return;
      }
      const map: Record<string, Tool> = { b: 'pencil', l: 'line', r: 'rect', R: 'frect', f: 'fill', i: 'picker', e: 'eraser' };
      if (map[e.key]) setTool(map[e.key]);
      if (/^[1-9]$/.test(e.key) && +e.key <= p.palette.length) { setMode('color'); setCi(+e.key - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.palette.length]);

  // --- pattern operations
  const op = (fn: (x: number, y: number) => number, w = p.w, h = p.h) => {
    const colors: number[] = [], stitches: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = fn(x, y);
      colors.push(k < 0 ? 0 : p.colors[k]); stitches.push(k < 0 ? 0 : p.stitches[k]);
    }
    setState({ pattern: { ...p, w, h, colors, stitches } }, true);
  };
  const idx = (x: number, y: number) => y * p.w + x;
  const wrapX = (x: number) => ((x % p.w) + p.w) % p.w, wrapY = (y: number) => ((y % p.h) + p.h) % p.h;
  const resize = (w: number, h: number) => op((x, y) => (x < p.w && y < p.h ? idx(x, y) : -1), Math.max(1, Math.min(400, Math.round(w))), Math.max(1, Math.min(600, Math.round(h))));

  const exportPng = (machine: boolean) => {
    const cv = document.createElement('canvas');
    cv.width = p.w; cv.height = p.h;
    const ctx = cv.getContext('2d')!;
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
      const v = p.colors[r * p.w + c];
      ctx.fillStyle = machine ? (v === 0 ? '#ffffff' : '#000000') : p.palette[v];
      ctx.fillRect(c, p.h - 1 - r, 1, 1);
    }
    cv.toBlob((b) => b && downloadBlob(b, `${s.name || 'pattern'}${machine ? '-machine' : ''}.png`));
    toast(machine ? 'Exported 1-bit PNG (black = contrast colour / selected needle)' : 'Exported pattern PNG');
  };

  return (
    <>
      <div className="toolbar">
        <h1>Stitch Designer</h1>
        <Seg value={tab} options={[{ key: 'design', label: 'Design' }, { key: 'arrange', label: 'Arrange on garment' }]} onChange={setTab} />
        {tab === 'design' && (
          <>
            <div className="sep" />
            <div className="seg">
              {TOOLS.map((t) => <button key={t.key} title={t.title} className={tool === t.key ? 'on' : ''} onClick={() => setTool(t.key)} style={{ minWidth: 32 }}>{t.label}</button>)}
            </div>
            <div className="sep" />
            <Seg value={mode} options={[{ key: 'color', label: 'Colour' }, { key: 'stitch', label: 'Stitch' }]} onChange={setMode} />
            <div className="sep" />
            <button className={`btn ${texture ? 'on' : ''}`} onClick={() => setTexture(!texture)}>Fabric view</button>
            <button className={`btn ${trueTension ? 'on' : ''}`} onClick={() => setTrueTension(!trueTension)} title="Show stitches at true tension proportions">True tension</button>
            <div className="zoom-controls" role="group" aria-label="Zoom">
            <button className="btn icon" aria-label="Zoom out" onClick={() => setCell((c) => Math.max(2, c / 1.3))} title={`Zoom out (${CMD}−)`}>−</button>
            <button className="btn" onClick={fitCell} title="Fit repeats to the screen">Fit</button>
            <button className="btn icon" aria-label="Zoom in" onClick={() => setCell((c) => Math.min(48, c * 1.3))} title={`Zoom in (${CMD}+)`}>+</button>
            </div>
          </>
        )}
        <div className="spacer" />
        <button className="btn primary" onClick={() => setState({ section: 'knitting' })}>Knit it →</button>
      </div>
      <div className="content">
        {tab === 'design' ? (
          <div className="stage stitch-stage" ref={stageRef} style={{ padding: 24 }}>
            <div className="canvas-scroll">
              <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                style={{ display: 'block', boxShadow: 'var(--shadow)', touchAction: 'none', cursor: 'crosshair', imageRendering: 'pixelated' }} />
            </div>
            <p className="hint">Repeat {p.w} sts × {p.h} rows · orange box is the repeat you edit, grey tiles show how it repeats · row 1 is at the bottom</p>
          </div>
        ) : (
          <Arrange />
        )}
        <aside className="inspector">
          {tab === 'design' ? (
            <>
              <div className="group">
                <h3>Yarn colours</h3>
                <div className="swatches">
                  {p.palette.map((c, i) => (
                    <div key={i} className={`swatch ${mode === 'color' && ci === i ? 'on' : ''}`} style={{ background: c }} title={`Colour ${i + 1} (key ${i + 1})`} onClick={() => { setCi(i); setMode('color'); }}>
                      <small>{i + 1}</small>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="color" value={p.palette[ci] ?? '#000000'} onChange={(e) => { const pal = p.palette.slice(); pal[ci] = e.target.value; setState({ pattern: { ...p, palette: pal } }); }} />
                  <span className="muted">Edit colour {ci + 1}</span>
                  <div className="spacer" style={{ flex: 1 }} />
                  <button className="btn icon" disabled={p.palette.length >= 16} onClick={() => { setState({ pattern: { ...p, palette: [...p.palette, '#7f8c8d'] } }, true); setCi(p.palette.length); }}>+</button>
                  <button className="btn icon" disabled={p.palette.length <= 1} onClick={() => {
                    const n = p.palette.length - 1;
                    setState({ pattern: { ...p, palette: p.palette.slice(0, n), colors: p.colors.map((v) => (v >= n ? 0 : v)) } }, true);
                    setCi(Math.min(ci, n - 1));
                  }}>−</button>
                </div>
              </div>
              <div className="group">
                <h3>Stitch types</h3>
                <div className="list">
                  {STITCH_NAMES.map((n, i) => (
                    <div key={i} className={`list-item ${mode === 'stitch' && st === i ? 'active' : ''}`} onClick={() => { setSt(i); setMode('stitch'); }}>
                      <StitchIcon st={i} />{n}
                    </div>
                  ))}
                </div>
                <p className="hint" style={{ margin: 0 }}>Lace: mark transfer stitches with ← / → and the resulting holes with Eyelet. Tuck and slip mark needles held by the carriage.</p>
              </div>
              <div className="group">
                <h3>Repeat</h3>
                <NumField label="Stitches" value={p.w} min={1} max={400} onChange={(v) => resize(v, p.h)} />
                <NumField label="Rows" value={p.h} min={1} max={600} onChange={(v) => resize(p.w, v)} />
                <NumField label="Show repeats across" value={rep.x} min={1} max={20} onChange={(v) => setRep({ ...rep, x: v })} />
                <NumField label="Show repeats up" value={rep.y} min={1} max={20} onChange={(v) => setRep({ ...rep, y: v })} />
              </div>
              <div className="group">
                <h3>Transform</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button className="btn" onClick={() => op((x, y) => idx(p.w - 1 - x, y))}>Flip ↔</button>
                  <button className="btn" onClick={() => op((x, y) => idx(x, p.h - 1 - y))}>Flip ↕</button>
                  <button className="btn" onClick={() => op((x, y) => idx(x < p.w / 2 ? x : p.w - 1 - x, y))}>Mirror L→R</button>
                  <button className="btn" onClick={() => op((x, y) => idx(x, y < p.h / 2 ? y : p.h - 1 - y))}>Mirror B→T</button>
                  <button className="btn" onClick={() => op((x, y) => idx(wrapX(x + 1), y))}>Shift ←</button>
                  <button className="btn" onClick={() => op((x, y) => idx(wrapX(x - 1), y))}>Shift →</button>
                  <button className="btn" onClick={() => op((x, y) => idx(x, wrapY(y - 1)))}>Shift ↑</button>
                  <button className="btn" onClick={() => op((x, y) => idx(x, wrapY(y + 1)))}>Shift ↓</button>
                  <button className="btn" onClick={() => setState({ pattern: { ...p, colors: p.colors.map((v) => (v === 0 ? 1 : v === 1 ? 0 : v)) } }, true)}>Swap 1 ↔ 2</button>
                  <button className="btn" onClick={() => op((x, y) => idx(Math.floor(x / 2), Math.floor(y / 2)), Math.min(400, p.w * 2), Math.min(600, p.h * 2))}>Double size</button>
                  <button className="btn" onClick={() => setState({ pattern: { ...p, stitches: p.stitches.map(() => 0) } }, true)}>Clear stitches</button>
                  <button className="btn" onClick={() => setState({ pattern: { ...p, colors: p.colors.map(() => 0), stitches: p.stitches.map(() => 0) } }, true)}>Clear all</button>
                </div>
              </div>
              <div className="group">
                <h3>Library & export</h3>
                <select value="" onChange={(e) => { if (e.target.value) { setState({ pattern: PRESETS[e.target.value]() }, true); } }}>
                  <option value="">Load a starter pattern…</option>
                  {Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button className="btn" onClick={() => exportPng(false)}>Colour PNG</button>
                  <button className="btn" onClick={() => exportPng(true)} title="Black/white image for electronic machine tools (e.g. AYAB, img2track)">Machine PNG</button>
                </div>
              </div>
            </>
          ) : (
            <ArrangeInspector />
          )}
        </aside>
      </div>
    </>
  );
}

function StitchIcon({ st }: { st: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const d = window.devicePixelRatio || 1;
    cv.width = 20 * d; cv.height = 20 * d;
    const ctx = cv.getContext('2d')!;
    ctx.scale(d, d);
    ctx.fillStyle = '#f2ede4'; ctx.fillRect(0, 0, 20, 20);
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.strokeRect(0.5, 0.5, 19, 19);
    drawSymbol(ctx, st, 0, 0, 20, 20, '#333');
  }, [st]);
  return <canvas ref={ref} style={{ width: 20, height: 20, borderRadius: 4 }} />;
}

function layout(pieces: Piece[]) {
  let x = 0;
  const gap = 8;
  return pieces.map((p) => {
    const b = bbox(p.points);
    const dx = x - b.minX;
    x += b.w + gap;
    return { p, dx, b };
  });
}

function Arrange() {
  const s = useStore();
  const url = useMemo(() => patternDataUrl(s.pattern), [s.pattern]);
  const items = layout(s.pieces);
  const totalW = items.reduce((t, i) => Math.max(t, i.dx + i.b.maxX), 0);
  const maxH = Math.max(...items.map((i) => i.b.maxY), 1);
  const minY = Math.min(...items.map((i) => i.b.minY), 0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const pad = 6;
  const vbW = totalW + pad * 2, vbH = maxH - minY + pad * 2;

  const onDown = (e: React.PointerEvent, p: Piece) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setState({ activePiece: p.id }, true);
    drag.current = { id: p.id, sx: e.clientX, sy: e.clientY, ox: p.offset.x, oy: p.offset.y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const k = Math.max(vbW / r.width, vbH / r.height);
    const dxCm = (e.clientX - d.sx) * k, dyCm = -(e.clientY - d.sy) * k;
    updatePiece(d.id, { offset: { x: Math.round(d.ox - (dxCm * s.gauge.sts) / 10), y: Math.round(d.oy - (dyCm * s.gauge.rows) / 10) } });
  };

  return (
    <div className="stage" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
      <svg ref={svgRef} viewBox={`${-pad} ${-(maxH + pad)} ${vbW} ${vbH}`} style={{ flex: 1, width: '100%', minHeight: 300, touchAction: 'none' }}
        onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <g transform="scale(1,-1)">
          {items.map(({ p, dx }) => (
            <g key={p.id} transform={`translate(${dx},0)`} onPointerDown={(e) => onDown(e, p)} style={{ cursor: 'move' }}>
              <PieceFill piece={p} gauge={s.gauge} url={url} pw={s.pattern.w} ph={s.pattern.h} ribColor={s.pattern.palette[0]} idPrefix={`arr-${p.id}`} />
              <Outline piece={p} strokeWidth={p.id === s.activePiece ? 3 : 1.2} />
            </g>
          ))}
        </g>
        {items.map(({ p, dx, b }) => (
          <text key={p.id} x={dx + (b.minX + b.maxX) / 2} y={-minY + pad - 1.5} fontSize={3} textAnchor="middle" fill={p.id === s.activePiece ? 'var(--accent)' : 'var(--muted)'}>{p.name}</text>
        ))}
      </svg>
      <p className="hint">Drag a piece to slide the stitch pattern across it. Knitting instructions follow the placement exactly.</p>
    </div>
  );
}

function ArrangeInspector() {
  const s = useStore();
  const piece = activePiece(s);
  const b = bbox(piece.points);
  const W = Math.round((b.w * s.gauge.sts) / 10);
  const p: Pattern = s.pattern;
  return (
    <>
      <div className="group">
        <h3>Placement — {piece.name}</h3>
        <NumField label="Stitch offset" value={piece.offset.x} onChange={(v) => updatePiece(piece.id, { offset: { ...piece.offset, x: Math.round(v) } }, true)} />
        <NumField label="Row offset" value={piece.offset.y} onChange={(v) => updatePiece(piece.id, { offset: { ...piece.offset, y: Math.round(v) } }, true)} />
        <button className="btn" onClick={() => updatePiece(piece.id, { offset: { ...piece.offset, x: Math.round(p.w / 2 - W / 2) } }, true)}>Centre repeat on piece</button>
        <button className="btn" onClick={() => setState((st) => ({ pieces: st.pieces.map((q) => {
          const qb = bbox(q.points);
          const QW = Math.round((qb.w * st.gauge.sts) / 10);
          return { ...q, offset: { x: Math.round(p.w / 2 - QW / 2), y: piece.offset.y } };
        }) }), true)}>Centre on all pieces</button>
      </div>
      <div className="group">
        <h3>Pieces</h3>
        <div className="list">
          {s.pieces.map((q) => (
            <div key={q.id} className={`list-item ${q.id === piece.id ? 'active' : ''}`} onClick={() => setState({ activePiece: q.id })}>
              {q.name}<span className="meta">offset {q.offset.x}, {q.offset.y}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
