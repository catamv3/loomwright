import { useEffect, useMemo, useRef, useState } from 'react';
import { setState, useStore, Pt } from '../store';
import {
  BODY_MEAS, GarmentSpec, Landmark, MEAS_LABELS, Measurements, NECKLINES, Role, SHAPE_MEAS, SIZE_TABLES, SKIRTS, STYLES,
  ShapePoint, SleeveLen, edgeAt, generateGarment, isSymmetric, landmarks, newShapeId, shapeY,
} from '../lib/garment';
import { NumField, Seg, toast } from '../components/ui';
import { PieceThumb } from '../components/PieceShape';
import { bbox } from '../lib/knit';

const ROLE_LABEL: Record<Role, string> = { back: 'Back', front: 'Front', sleeve: 'Sleeve' };

export default function GarmentStyling() {
  const s = useStore();
  const g = s.garment;
  const preview = useMemo(() => generateGarment(g), [g]);
  const table = SIZE_TABLES[g.sizeTable];
  const roles = useMemo(() => [...new Set(preview.map((p) => p.role as Role))], [preview]);
  const [roleSel, setRole] = useState<Role>('front');
  const role: Role = roles.includes(roleSel) ? roleSel : roles[0];
  const [selPoint, setSelPoint] = useState<string | null>(null);

  const update = (patch: Partial<GarmentSpec>, history = false) => setState({ garment: { ...g, ...patch } }, history);
  const setSize = (size: string, tableKey = g.sizeTable) => {
    const t = SIZE_TABLES[tableKey];
    if (size === 'custom' || !t.sizes[size]) update({ sizeTable: tableKey, size: 'custom' });
    else update({ sizeTable: tableKey, size, meas: { ...t.sizes[size] } });
  };
  const setMeas = (k: keyof Measurements, v: number) => update({ meas: { ...g.meas, [k]: v }, size: 'custom' });
  const setStyle = (style: GarmentSpec['style']) => {
    // a dress defaults to a scoop neck and short sleeves the first time it's picked
    if (style === 'dress' && g.style !== 'dress') update({ style, neckline: g.neckline === 'crew' ? 'scoop' : g.neckline, sleeveLen: g.sleeveLen === 'long' ? 'short' : g.sleeveLen });
    else update({ style, sleeveLen: style !== 'dress' && g.sleeveLen === 'none' ? 'long' : g.sleeveLen });
  };

  const points = g.custom?.[role] ?? [];
  const setPoints = (list: ShapePoint[], history = false) => update({ custom: { ...(g.custom ?? {}), [role]: list } }, history);

  const apply = (goto?: 'drafting' | 'stitch') => {
    setState({ pieces: preview, activePiece: preview[0].id, ...(goto ? { section: goto } : {}) }, true);
    toast(`${preview.length} garment pieces created`);
  };

  const finished = (g.meas.chest + g.ease).toFixed(0);
  const isDress = g.style === 'dress';
  const sleeveOpts: { key: SleeveLen; label: string }[] = [
    { key: 'long', label: 'Long' }, { key: 'three-quarter', label: '¾' }, { key: 'short', label: 'Short' },
    ...(isDress ? [{ key: 'none' as SleeveLen, label: 'Sleeveless' }] : []),
  ];

  return (
    <>
      <div className="toolbar">
        <h1>Garment Styling</h1>
        <span className="muted tb-sub">Pick a garment, size it, then place shaping points anywhere on it.</span>
        <div className="spacer" />
        <button className="btn" onClick={() => apply()}>Use garment</button>
        <button className="btn primary" onClick={() => apply('drafting')}>Open in Pattern Drafting →</button>
      </div>
      <div className="content">
        <div className="stage" style={{ padding: 24, display: 'grid', gap: 18, alignContent: 'start' }}>
          <ShapeEditor
            g={g} role={role} roles={roles} setRole={(r) => { setRole(r); setSelPoint(null); }}
            points={points} setPoints={setPoints} sel={selPoint} setSel={setSelPoint}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
            {preview.map((p) => (
              <PieceThumb key={p.id} piece={p} gauge={s.gauge} size={150} active={p.role === role} onClick={() => { setRole(p.role as Role); setSelPoint(null); }} />
            ))}
          </div>
          <div className="card" style={{ padding: 16, maxWidth: 760 }}>
            <b>Finished measurements</b>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }} className="muted">
              <span>Chest {finished} cm</span>
              {isDress && <span>Waist {(g.meas.waist + g.ease * 0.5).toFixed(0)} cm</span>}
              {isDress && <span>Hip {(g.meas.hip + g.ease * 0.6).toFixed(0)} cm</span>}
              <span>Length {isDress ? g.meas.dressLength : g.meas.length} cm</span>
              <span>Ribbing {g.rib} cm</span>
              <span>Tension {s.gauge.sts} sts / {s.gauge.rows} rows</span>
            </div>
          </div>
        </div>
        <aside className="inspector">
          <ShapeList g={g} role={role} points={points} setPoints={setPoints} sel={selPoint} setSel={setSelPoint} />
          <div className="group">
            <h3>Garment</h3>
            <select value={g.style} onChange={(e) => setStyle(e.target.value as GarmentSpec['style'])}>
              {STYLES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </div>
          {isDress && (
            <div className="group">
              <h3>Skirt</h3>
              <Seg value={g.skirt ?? 'aline'} options={SKIRTS} onChange={(v) => update({ skirt: v })} />
            </div>
          )}
          <div className="group">
            <h3>Neckline</h3>
            <Seg value={g.neckline} options={NECKLINES} onChange={(v) => update({ neckline: v })} />
          </div>
          {g.style !== 'vest' && (
            <div className="group">
              <h3>Sleeves</h3>
              <Seg<SleeveLen> value={g.sleeveLen} options={sleeveOpts} onChange={(v) => update({ sleeveLen: v })} />
            </div>
          )}
          <div className="group">
            <h3>Size</h3>
            <div className="field"><label>Size table</label>
              <select value={g.sizeTable} onChange={(e) => setSize(Object.keys(SIZE_TABLES[e.target.value].sizes)[1] ?? 'custom', e.target.value)}>
                {Object.entries(SIZE_TABLES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </div>
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              {Object.keys(table.sizes).map((k) => (
                <button key={k} className={g.size === k ? 'on' : ''} onClick={() => setSize(k)}>{k}</button>
              ))}
              <button className={g.size === 'custom' ? 'on' : ''} onClick={() => setSize('custom')}>Custom</button>
            </div>
          </div>
          <div className="group">
            <h3>Body measurements (cm)</h3>
            {BODY_MEAS.filter((k) => !(isDress && k === 'length')).map((k) => (
              <NumField key={k} label={MEAS_LABELS[k]} value={g.meas[k]} step={0.5} min={1} onChange={(v) => setMeas(k, v)} />
            ))}
          </div>
          <div className="group">
            <h3>Waist & hip (cm)</h3>
            {SHAPE_MEAS.filter((k) => isDress || k !== 'dressLength').map((k) => (
              <NumField key={k} label={MEAS_LABELS[k]} value={g.meas[k]} step={0.5} min={1} onChange={(v) => setMeas(k, v)} />
            ))}
            <p className="hint" style={{ margin: 0 }}>These set the Waist and Hip guide lines{isDress ? ' and the dress shaping' : ''}. Editing any measurement switches to your own (custom) size.</p>
          </div>
          <div className="group">
            <h3>Styling</h3>
            <NumField label="Ease" suffix="cm" value={g.ease} step={1} min={-10} max={40} onChange={(v) => update({ ease: v })} />
            <NumField label={isDress ? 'Hem / welt' : 'Ribbing / welt'} suffix="cm" value={g.rib} step={0.5} min={0} max={20} onChange={(v) => update({ rib: v })} />
          </div>
        </aside>
      </div>
    </>
  );
}

/** Large interactive view of one piece: guide lines at body landmarks plus draggable shaping points. */
function ShapeEditor({ g, role, roles, setRole, points, setPoints, sel, setSel }: {
  g: GarmentSpec; role: Role; roles: Role[]; setRole: (r: Role) => void;
  points: ShapePoint[]; setPoints: (p: ShapePoint[], history?: boolean) => void; sel: string | null; setSel: (id: string | null) => void;
}) {
  const [mirrorBoth, setMirrorBoth] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const symmetric = isSymmetric(g, role);
  const lms = useMemo(() => landmarks(g, role), [g, role]);
  const basePts = useMemo(() => generateGarment(g, true).find((p) => p.role === role)?.points ?? [], [g, role]);
  const finalPts = useMemo(() => generateGarment(g).find((p) => p.role === role)?.points ?? [], [g, role]);
  const drag = useRef<{ id: string; side: 'left' | 'right' } | null>(null);

  const b = bbox([...basePts, ...finalPts]);
  const cx = (b.minX + b.maxX) / 2;
  const padL = Math.max(14, b.w * 0.28), pad = 5;
  const unit0 = Math.max(b.w + padL * 2, b.h + pad * 2) / 100;
  // labels that would collide with the one below move to the right-hand side
  const crowded = lms.map((l, i) => i > 0 && Math.abs(l.y - lms[i - 1].y) < unit0 * 3.2);
  const padR = crowded.some(Boolean) ? padL : pad;
  const vb = { x: b.minX - padL, y: -(b.maxY + pad), w: b.w + padL + padR, h: b.h + pad * 2 };
  const unit = Math.max(vb.w, vb.h) / 100; // ~1% of the view, for handle and text sizes

  const toCm = (e: { clientX: number; clientY: number }): Pt => {
    const pt = svgRef.current!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(gRef.current!.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  // Turn a height into a landmark pair + fraction, keeping the user's chosen pair while it still fits.
  const place = (y: number, keep?: ShapePoint): Pick<ShapePoint, 'from' | 'to' | 't'> => {
    const yy = Math.max(lms[0].y + 0.2, Math.min(lms[lms.length - 1].y - 0.2, y));
    if (keep) {
      const a = lms.find((l) => l.key === keep.from), c = lms.find((l) => l.key === keep.to);
      if (a && c && yy >= Math.min(a.y, c.y) && yy <= Math.max(a.y, c.y) && a.y !== c.y) return { from: keep.from, to: keep.to, t: (yy - a.y) / (c.y - a.y) };
    }
    let i = lms.findIndex((l, k) => k < lms.length - 1 && yy >= l.y && yy <= lms[k + 1].y);
    if (i < 0) i = 0;
    const lo = lms[i], hi = lms[i + 1];
    return { from: lo.key, to: hi.key, t: (yy - lo.y) / (hi.y - lo.y) };
  };
  const baseX = (y: number, side: 'left' | 'right') => edgeAt(basePts, y, side)?.x ?? (side === 'right' ? b.maxX : b.minX);

  const onOutlineDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toCm(e);
    const side: 'left' | 'right' = c.x >= cx ? 'right' : 'left';
    const sp: ShapePoint = { id: newShapeId(), ...place(c.y), dx: 0, side: symmetric && mirrorBoth ? 'both' : side };
    setPoints([...points, sp], true);
    setSel(sp.id);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id: sp.id, side };
  };
  const onHandleDown = (e: React.PointerEvent, sp: ShapePoint, side: 'left' | 'right') => {
    e.stopPropagation();
    setSel(sp.id);
    setPoints(points, true); // undo snapshot
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id: sp.id, side };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const sp = points.find((p) => p.id === d.id);
    if (!sp) return;
    const c = toCm(e);
    const pos = place(Math.round(c.y * 2) / 2, sp);
    const y = shapeY({ ...sp, ...pos }, lms) ?? c.y;
    const bx = baseX(y, d.side);
    const dx = Math.round((d.side === 'right' ? c.x - bx : bx - c.x) * 2) / 2;
    setPoints(points.map((p) => (p.id === d.id ? { ...p, ...pos, dx } : p)));
  };
  const onUp = () => { drag.current = null; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select')) return;
      if ((e.key === 'Backspace' || e.key === 'Delete') && sel) {
        e.preventDefault();
        setPoints(points.filter((p) => p.id !== sel), true);
        setSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, points]);

  const selPt = points.find((p) => p.id === sel);
  const band = selPt ? [lms.find((l) => l.key === selPt.from)?.y, lms.find((l) => l.key === selPt.to)?.y] : null;
  const poly = (pts: Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="card shape-editor">
      <div className="shape-editor-bar">
        <Seg value={role} options={roles.map((r) => ({ key: r, label: g.style === 'cardigan' && r === 'front' ? 'Right Front' : ROLE_LABEL[r] }))} onChange={setRole} />
        {symmetric && (
          <button className={`btn ${mirrorBoth ? 'on' : ''}`} onClick={() => setMirrorBoth(!mirrorBoth)} title="New points shape both sides of the piece">Both sides</button>
        )}
        <span className="hint">Tap the outline to add a point, then drag it in, out, up or down.</span>
      </div>
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="shape-svg" style={{ aspectRatio: `${vb.w} / ${vb.h}` }}
        onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerDown={() => setSel(null)}
        role="img" aria-label={`${ROLE_LABEL[role]} piece with shaping guides`}>
        {band && band[0] !== undefined && band[1] !== undefined && (
          <rect x={vb.x} y={-Math.max(band[0], band[1])} width={vb.w} height={Math.abs(band[1] - band[0])} fill="var(--accent-soft)" />
        )}
        {lms.map((l: Landmark, i) => (
          <g key={l.key}>
            <line x1={b.minX - 2} x2={b.maxX + 2} y1={-l.y} y2={-l.y} stroke="var(--grid-strong)" strokeDasharray="1 1" strokeWidth={0.25} />
            <text x={crowded[i] ? b.maxX + 3 : b.minX - 3} y={-l.y} dy={unit * 0.9} fontSize={unit * 2.6} textAnchor={crowded[i] ? 'start' : 'end'} fill="var(--muted)">{l.label}</text>
          </g>
        ))}
        <g ref={gRef} transform="scale(1,-1)">
          <polygon points={poly(finalPts)} fill="var(--accent-soft)" stroke="none" />
          {points.length > 0 && <polygon points={poly(basePts)} fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          <polygon points={poly(finalPts)} fill="none" stroke="var(--text)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          {/* wide invisible stroke makes the outline easy to tap */}
          <polygon points={poly(basePts)} fill="none" stroke="transparent" strokeWidth={22} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'stroke', cursor: 'copy' }} onPointerDown={onOutlineDown} />
          {points.flatMap((sp) => {
            const y = shapeY(sp, lms);
            if (y === null) return [];
            const sides: ('left' | 'right')[] = sp.side === 'both' && symmetric ? ['left', 'right'] : sp.side === 'left' ? ['left'] : ['right'];
            return sides.map((side) => {
              const x = baseX(y, side) + (side === 'right' ? sp.dx : -sp.dx);
              const on = sp.id === sel;
              return (
                <circle key={sp.id + side} cx={x} cy={y} r={unit * (on ? 1.9 : 1.5)} fill={on ? 'var(--accent)' : 'var(--panel)'} stroke="var(--accent)" strokeWidth={2}
                  vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={(e) => onHandleDown(e, sp, side)} />
              );
            });
          })}
        </g>
      </svg>
    </div>
  );
}

/** Inspector list: target any span between two landmarks, set position and width change. */
function ShapeList({ g, role, points, setPoints, sel, setSel }: {
  g: GarmentSpec; role: Role; points: ShapePoint[]; setPoints: (p: ShapePoint[], history?: boolean) => void; sel: string | null; setSel: (id: string | null) => void;
}) {
  const lms = landmarks(g, role);
  const symmetric = isSymmetric(g, role);
  const upd = (id: string, patch: Partial<ShapePoint>) => setPoints(points.map((p) => (p.id === id ? { ...p, ...patch } : p)), true);
  const add = () => {
    const lo = lms.find((l) => l.key === 'waist') ?? lms[Math.max(0, lms.length - 3)];
    const hi = lms.find((l) => l.key === 'bust') ?? lms[lms.length - 1];
    const sp: ShapePoint = { id: newShapeId(), from: lo.key, to: hi.key, t: 0.5, dx: 0, side: symmetric ? 'both' : 'right' };
    setPoints([...points, sp], true);
    setSel(sp.id);
  };
  const sideLabel = symmetric ? { both: 'Both sides', left: 'Left only', right: 'Right only' } : { both: 'Side seam', left: 'Centre front', right: 'Side seam' };
  const lmName = (k: string) => lms.find((l) => l.key === k)?.label ?? k;

  return (
    <div className="group">
      <h3>Shaping points — {g.style === 'cardigan' && role === 'front' ? 'Right Front' : ROLE_LABEL[role]}</h3>
      {points.length === 0 && <p className="hint" style={{ margin: 0 }}>No points yet. Tap the outline on the piece, or add one here and choose the area to target (for example between Neck and Bust, or Waist and Hem).</p>}
      {points.map((sp, i) => {
        const missing = shapeY(sp, lms) === null;
        return (
          <div key={sp.id} className={`shape-row ${sp.id === sel ? 'on' : ''}`} onClick={() => setSel(sp.id)}>
            <div className="shape-row-head">
              <b>Point {i + 1}</b>
              <span className="muted">{lmName(sp.from)} → {lmName(sp.to)} · {Math.round(sp.t * 100)}% · {sp.dx > 0 ? '+' : ''}{sp.dx} cm</span>
              <button className="btn icon" aria-label={`Delete point ${i + 1}`} onClick={(e) => { e.stopPropagation(); setPoints(points.filter((p) => p.id !== sp.id), true); setSel(null); }}>✕</button>
            </div>
            {missing && <div className="hint" style={{ color: 'var(--accent)' }}>This area doesn't exist on the current garment. Pick other guide lines.</div>}
            {sp.id === sel && (
              <div className="shape-row-body">
                <div className="field"><label>Between</label>
                  <select value={sp.from} onChange={(e) => upd(sp.id, { from: e.target.value })}>
                    {lms.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field"><label>and</label>
                  <select value={sp.to} onChange={(e) => upd(sp.id, { to: e.target.value })}>
                    {lms.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </div>
                <div className="field"><label>Position <span className="muted">({Math.round(sp.t * 100)}%)</span></label>
                  <input type="range" min={0} max={1} step={0.01} value={sp.t} onChange={(e) => setPoints(points.map((p) => (p.id === sp.id ? { ...p, t: +e.target.value } : p)))} aria-label="Position between the two guide lines" />
                </div>
                <NumField label="Wider / narrower" suffix="cm" value={sp.dx} step={0.5} min={-40} max={40} onChange={(v) => upd(sp.id, { dx: v })} />
                <div className="field"><label>Apply to</label>
                  <select value={sp.side} onChange={(e) => upd(sp.id, { side: e.target.value as ShapePoint['side'] })}>
                    {(symmetric ? ['both', 'left', 'right'] : ['right', 'left']).map((k) => <option key={k} value={k}>{sideLabel[k as keyof typeof sideLabel]}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn" onClick={add}>Add point</button>
        {points.length > 0 && <button className="btn" onClick={() => { setPoints([], true); setSel(null); }}>Clear all</button>}
      </div>
      <p className="hint" style={{ margin: 0 }}>Points sit between guide lines, so they follow along when you change size or measurements. Positive cm makes the piece wider there; negative pulls it in.</p>
    </div>
  );
}
