import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Piece, Pt, activePiece, getState, setState, uid, updatePiece, useStore } from '../store';
import { bbox } from '../lib/knit';
import { patternDataUrl } from '../lib/image';
import { NumField, pickFile, readFileAsDataUrl, toast, CMD } from '../components/ui';
import { PieceFill } from '../components/PieceShape';

type VB = { x: number; y: number; w: number; h: number }; // cm space, y up (x,y = bottom-left)

const TEMPLATES: Record<string, () => Pt[]> = {
  Rectangle: () => [{ x: -25, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 40 }, { x: -25, y: 40 }],
  Square: () => [{ x: -15, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 30 }, { x: -15, y: 30 }],
  Trapezoid: () => [{ x: -25, y: 0 }, { x: 25, y: 0 }, { x: 15, y: 40 }, { x: -15, y: 40 }],
  Triangle: () => [{ x: -30, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 35 }],
  Circle: () => Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(a) * 200) / 10, y: Math.round((Math.sin(a) * 20 + 20) * 10) / 10 };
  }),
  Hexagon: () => Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(a) * 200) / 10, y: Math.round((Math.sin(a) * 20 + 20) * 10) / 10 };
  }),
};

function fit(p: Piece, aspect: number): VB {
  const b = bbox(p.points);
  const pad = Math.max(8, Math.max(b.w, b.h) * 0.15);
  let w = b.w + pad * 2, h = b.h + pad * 2;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  return { x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - h / 2, w, h };
}

export default function PatternDrafting() {
  const s = useStore();
  const piece = activePiece(s);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [vb, setVb] = useState<VB>({ x: -40, y: -10, w: 80, h: 70 });
  const [sel, setSel] = useState<number | null>(null);
  const [sym, setSym] = useState(true);
  const [snap, setSnap] = useState(true);
  const [showPattern, setShowPattern] = useState(false);
  const [showDims, setShowDims] = useState(true);
  const drag = useRef<{ i: number; partner: number | null; mode: 'point' } | { mode: 'pan'; sx: number; sy: number; vb: VB } | null>(null);
  const patUrl = useMemo(() => patternDataUrl(s.pattern), [s.pattern]);

  const aspect = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.height ? r.width / r.height : 1.4;
  };
  useEffect(() => { setVb(fit(piece, aspect())); setSel(null); /* eslint-disable-next-line */ }, [piece.id]);
  useEffect(() => {
    const ro = new ResizeObserver(() => setVb(fit(activePiece(getState()), aspect())));
    if (svgRef.current) ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  const toCm = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!, g = gRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(g.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const snapV = (v: number) => (snap ? Math.round(v * 2) / 2 : Math.round(v * 10) / 10);

  const onPointDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(i);
    const p = piece.points[i];
    let partner: number | null = null;
    if (sym && Math.abs(p.x) > 0.05) {
      const j = piece.points.findIndex((q, k) => k !== i && Math.abs(q.x + p.x) < 0.3 && Math.abs(q.y - p.y) < 0.3);
      partner = j >= 0 ? j : null;
    }
    setState({}, true); // snapshot for undo
    drag.current = { mode: 'point', i, partner };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      const r = svgRef.current!.getBoundingClientRect();
      const k = d.vb.w / r.width;
      setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.sx) * k, y: d.vb.y + (e.clientY - d.sy) * k });
      return;
    }
    const c = toCm(e);
    const pts = piece.points.slice();
    const old = pts[d.i];
    const onAxis = sym && Math.abs(old.x) < 0.05;
    pts[d.i] = { x: onAxis ? 0 : snapV(c.x), y: snapV(c.y) };
    if (d.partner !== null) pts[d.partner] = { x: -pts[d.i].x, y: pts[d.i].y };
    updatePiece(piece.id, { points: pts });
  };
  const onUp = () => { drag.current = null; };

  const onBgDown = (e: React.PointerEvent) => {
    setSel(null);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vb };
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      // pinch-to-zoom on Mac trackpads arrives as ctrl+wheel
      const f = Math.exp(e.deltaY * 0.01);
      const c = toCm(e);
      const w = Math.min(600, Math.max(5, vb.w * f)), h = w * (vb.h / vb.w);
      setVb({ x: c.x - (c.x - vb.x) * (w / vb.w), y: c.y - (c.y - vb.y) * (h / vb.h), w, h });
    } else {
      const k = vb.w / r.width;
      setVb({ ...vb, x: vb.x + e.deltaX * k, y: vb.y - e.deltaY * k });
    }
  };
  useEffect(() => {
    // stop the browser's page zoom on pinch
    const el = svgRef.current;
    const h = (e: WheelEvent) => e.preventDefault();
    el?.addEventListener('wheel', h, { passive: false });
    return () => el?.removeEventListener('wheel', h);
  }, []);

  const onDouble = (e: React.MouseEvent) => {
    const c = toCm(e);
    const pts = piece.points;
    let best = -1, bd = Infinity, proj: Pt = c;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const px = a.x + t * dx, py = a.y + t * dy;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < bd) { bd = d; best = i; proj = { x: snapV(px), y: snapV(py) }; }
    }
    if (best < 0 || bd > vb.w * 0.04) return;
    const next = pts.slice();
    next.splice(best + 1, 0, proj);
    let insertedAt = best + 1;
    if (sym && Math.abs(proj.x) > 0.05) {
      // add mirrored point on the matching edge
      const m = { x: -proj.x, y: proj.y };
      let mb = -1, md = Infinity;
      for (let i = 0; i < next.length; i++) {
        const a = next[i], b = next[(i + 1) % next.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(m.x - (a.x + t * dx), m.y - (a.y + t * dy));
        if (d < md) { md = d; mb = i; }
      }
      if (md < 0.5) { next.splice(mb + 1, 0, m); if (mb + 1 <= insertedAt) insertedAt++; }
    }
    updatePiece(piece.id, { points: next }, true);
    setSel(insertedAt);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select')) return;
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel !== null && piece.points.length > 3) {
        e.preventDefault();
        const pts = piece.points.filter((_, i) => i !== sel);
        updatePiece(piece.id, { points: pts }, true);
        setSel(null);
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (arrows[e.key] && sel !== null) {
        e.preventDefault();
        const st = e.shiftKey ? 1 : 0.1;
        const pts = piece.points.slice();
        const p = pts[sel];
        pts[sel] = { x: Math.round((p.x + arrows[e.key][0] * st) * 10) / 10, y: Math.round((p.y + arrows[e.key][1] * st) * 10) / 10 };
        updatePiece(piece.id, { points: pts }, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, piece]);

  const b = bbox(piece.points);
  const range = vb.w;
  const step = range > 160 ? 10 : range > 50 ? 5 : 1;
  const lines: JSX.Element[] = [];
  for (let x = Math.floor(vb.x / step) * step; x <= vb.x + vb.w; x += step)
    lines.push(<line key={`x${x}`} x1={x} x2={x} y1={vb.y} y2={vb.y + vb.h} stroke={x % 10 === 0 ? 'var(--grid-strong)' : 'var(--grid)'} vectorEffect="non-scaling-stroke" />);
  for (let y = Math.floor(vb.y / step) * step; y <= vb.y + vb.h; y += step)
    lines.push(<line key={`y${y}`} y1={y} y2={y} x1={vb.x} x2={vb.x + vb.w} stroke={y % 10 === 0 ? 'var(--grid-strong)' : 'var(--grid)'} vectorEffect="non-scaling-stroke" />);
  const rPx = vb.w / 160; // handle radius relative to view
  const tr = s.tracing;

  const addPiece = (name: string, pts: Pt[]) => {
    const p: Piece = { id: uid(), name, points: pts, offset: { x: 0, y: 0 }, markers: [], ribRows: 0 };
    setState((st) => ({ pieces: [...st.pieces, p], activePiece: p.id }), true);
  };
  const scaleTo = (w: number | null, h: number | null) => {
    const sx = w ? w / (b.w || 1) : 1, sy = h ? h / (b.h || 1) : 1;
    const cx = (b.minX + b.maxX) / 2;
    updatePiece(piece.id, { points: piece.points.map((p) => ({ x: Math.round(((p.x - cx) * sx + cx) * 10) / 10, y: Math.round(((p.y - b.minY) * sy + b.minY) * 10) / 10 })) }, true);
  };

  const loadTracing = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const src = await readFileAsDataUrl(f);
    const img = new Image();
    img.onload = () => {
      const widthCm = Math.round(b.w * 1.2) || 60;
      setState({ tracing: { src, widthCm, aspect: img.height / img.width, opacity: 0.45, x: b.minX - widthCm * 0.1, y: b.minY - 5 } }, true);
      toast('Background image added — drag points to trace it');
    };
    img.src = src;
  };

  return (
    <>
      <div className="toolbar">
        <h1>Pattern Drafting</h1>
        <button className={`btn ${sym ? 'on' : ''}`} onClick={() => setSym(!sym)} title="Mirror edits across the centre line">Symmetry</button>
        <button className={`btn ${snap ? 'on' : ''}`} onClick={() => setSnap(!snap)} title="Snap to 0.5 cm">Snap</button>
        <button className={`btn ${showDims ? 'on' : ''}`} onClick={() => setShowDims(!showDims)}>Measurements</button>
        <button className={`btn ${showPattern ? 'on' : ''}`} onClick={() => setShowPattern(!showPattern)}>Show stitch pattern</button>
        <div className="sep" />
        <button className="btn" onClick={() => setVb(fit(piece, aspect()))}>Fit</button>
        <span className="hint" title="Drag points to reshape · double-click an edge to add a point · ⌫ deletes the selected point · arrow keys nudge (⇧ for 1 cm) · pinch or ⌘-scroll to zoom · drag the background to pan">Drag points · double-click edge to add · ⌫ delete</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setState({ section: 'stitch' })}>Add stitch pattern →</button>
      </div>
      <div className="content">
        <div className="stage" style={{ overflow: 'hidden' }}>
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${-(vb.y + vb.h)} ${vb.w} ${vb.h}`}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onWheel={onWheel} onDoubleClick={onDouble}
          >
            <rect x={vb.x} y={-(vb.y + vb.h)} width={vb.w} height={vb.h} fill="transparent" onPointerDown={onBgDown} />
            {tr && <image href={tr.src} x={tr.x} y={-(tr.y + tr.widthCm * tr.aspect)} width={tr.widthCm} height={tr.widthCm * tr.aspect} opacity={tr.opacity} style={{ pointerEvents: 'none' }} />}
            <g ref={gRef} transform="scale(1,-1)" >
              <g style={{ pointerEvents: 'none' }}>{lines}</g>
              <line x1={0} x2={0} y1={vb.y} y2={vb.y + vb.h} stroke="var(--accent)" strokeDasharray="4 4" opacity={0.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
              {showPattern ? (
                <PieceFill piece={piece} gauge={s.gauge} url={patUrl} pw={s.pattern.w} ph={s.pattern.h} ribColor={s.pattern.palette[0]} idPrefix="draft" />
              ) : (
                <polygon points={piece.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--accent-soft)" style={{ pointerEvents: 'none' }} />
              )}
              <polygon points={piece.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
              {piece.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={rPx * (sel === i ? 1.5 : 1)} fill={sel === i ? 'var(--accent)' : 'var(--panel)'} stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => onPointDown(e, i)} style={{ cursor: 'grab' }} />
              ))}
            </g>
            {showDims && piece.points.map((p, i) => {
              const q = piece.points[(i + 1) % piece.points.length];
              const len = Math.hypot(q.x - p.x, q.y - p.y);
              if (len < vb.w * 0.04) return null;
              return <text key={i} x={(p.x + q.x) / 2} y={-(p.y + q.y) / 2} fontSize={vb.w / 75} fill="var(--muted)" textAnchor="middle" dy={-rPx} style={{ pointerEvents: 'none' }}>{len.toFixed(1)}</text>;
            })}
          </svg>
        </div>
        <aside className="inspector">
          <div className="group">
            <h3>Pieces</h3>
            <div className="list">
              {s.pieces.map((p) => {
                const pb = bbox(p.points);
                return (
                  <div key={p.id} className={`list-item ${p.id === piece.id ? 'active' : ''}`} onClick={() => setState({ activePiece: p.id })}>
                    {p.name}<span className="meta">{pb.w.toFixed(0)}×{pb.h.toFixed(0)} cm</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select value="" onChange={(e) => { if (e.target.value) addPiece(e.target.value, TEMPLATES[e.target.value]()); }} style={{ width: 'auto', flex: 1 }}>
                <option value="">New from shape…</option>
                {Object.keys(TEMPLATES).map((k) => <option key={k}>{k}</option>)}
              </select>
              <button className="btn" onClick={() => addPiece(`${piece.name} copy`, piece.points.map((p) => ({ ...p })))}>Duplicate</button>
              <button className="btn" disabled={s.pieces.length < 2} onClick={() => {
                const rest = s.pieces.filter((p) => p.id !== piece.id);
                setState({ pieces: rest, activePiece: rest[0].id }, true);
              }}>Delete</button>
            </div>
          </div>
          <div className="group">
            <h3>Piece</h3>
            <div className="field"><label>Name</label><input type="text" value={piece.name} onChange={(e) => updatePiece(piece.id, { name: e.target.value })} /></div>
            <NumField label="Width" suffix="cm" value={+b.w.toFixed(1)} step={0.5} min={1} onChange={(v) => scaleTo(v, null)} />
            <NumField label="Length" suffix="cm" value={+b.h.toFixed(1)} step={0.5} min={1} onChange={(v) => scaleTo(null, v)} />
            <NumField label="Ribbing" suffix="cm" value={piece.ribRows ?? 0} step={0.5} min={0} onChange={(v) => updatePiece(piece.id, { ribRows: v })} />
            <div className="hint">{Math.round((b.w * s.gauge.sts) / 10)} stitches × {Math.round((b.h * s.gauge.rows) / 10)} rows at current tension · {piece.points.length} points</div>
            <button className="btn" onClick={() => {
              const cx = (b.minX + b.maxX) / 2;
              updatePiece(piece.id, { points: piece.points.map((p) => ({ x: Math.round((2 * cx - p.x) * 10) / 10, y: p.y })).reverse() }, true);
            }}>Flip horizontally</button>
          </div>
          {sel !== null && piece.points[sel] && (
            <div className="group">
              <h3>Point {sel + 1}</h3>
              <NumField label="X" suffix="cm" value={piece.points[sel].x} step={0.5} onChange={(v) => { const pts = piece.points.slice(); pts[sel] = { ...pts[sel], x: v }; updatePiece(piece.id, { points: pts }, true); }} />
              <NumField label="Y" suffix="cm" value={piece.points[sel].y} step={0.5} onChange={(v) => { const pts = piece.points.slice(); pts[sel] = { ...pts[sel], y: v }; updatePiece(piece.id, { points: pts }, true); }} />
            </div>
          )}
          <div className="group">
            <h3>Tracing image</h3>
            {!tr ? (
              <button className="btn" onClick={loadTracing}>Add background image…</button>
            ) : (
              <>
                <NumField label="Width" suffix="cm" value={tr.widthCm} step={1} min={1} onChange={(v) => setState({ tracing: { ...tr, widthCm: v } })} />
                <NumField label="Left" suffix="cm" value={+tr.x.toFixed(1)} step={0.5} onChange={(v) => setState({ tracing: { ...tr, x: v } })} />
                <NumField label="Bottom" suffix="cm" value={+tr.y.toFixed(1)} step={0.5} onChange={(v) => setState({ tracing: { ...tr, y: v } })} />
                <div className="field"><label>Opacity</label><input type="range" min={0.05} max={1} step={0.05} value={tr.opacity} onChange={(e) => setState({ tracing: { ...tr, opacity: +e.target.value } })} /></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn" onClick={loadTracing}>Replace…</button>
                  <button className="btn" onClick={() => setState({ tracing: null }, true)}>Remove</button>
                </div>
              </>
            )}
            <p className="hint" style={{ margin: 0 }}>Photograph a favourite garment flat next to a tape measure, set its width, then move the outline points onto it.</p>
          </div>
          <div className="hint">Undo with {CMD}Z</div>
        </aside>
      </div>
    </>
  );
}
