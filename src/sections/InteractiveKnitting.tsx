import { useEffect, useMemo, useRef, useState } from 'react';
import { Piece, activePiece, setState, updatePiece, useStore } from '../store';
import { KnitRow, cellAt, knitPlan, needleLabel, pieceRows, renderPieceCanvas, spanCount, spanLabel } from '../lib/knit';
import { downloadBlob } from '../lib/image';
import { NumField, Seg, toast, CMD, useWidth, ZoomControls } from '../components/ui';

const SWATCH_ID = '__swatch__';

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    synth.speak(u);
  } catch { /* speech unavailable */ }
}
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 400);
  } catch { /* audio unavailable */ }
}

export default function InteractiveKnitting() {
  const s = useStore();
  const [target, setTarget] = useState<string>(s.activePiece);
  const [swatch, setSwatch] = useState({ sts: 40, rows: 60 });
  const [voice, setVoice] = useState<'voice' | 'beep' | 'off'>('voice');
  const [passesPerRow, setPassesPerRow] = useState(1);
  const [serial, setSerial] = useState<'none' | 'connected'>('none');
  const portRef = useRef<any>(null);
  const passCount = useRef(0);

  const piece: Piece = useMemo(() => {
    if (target === SWATCH_ID) {
      const w = (swatch.sts / s.gauge.sts) * 10, h = (swatch.rows / s.gauge.rows) * 10;
      return { id: SWATCH_ID, name: 'Swatch', points: [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: h }, { x: -w / 2, y: h }], offset: { x: 0, y: 0 }, markers: [], ribRows: 0 };
    }
    return s.pieces.find((p) => p.id === target) ?? activePiece(s);
  }, [target, swatch, s.pieces, s.gauge]);

  const plan = useMemo(() => knitPlan(piece, s.gauge, s.pattern), [piece, s.gauge, s.pattern]);
  const geo = useMemo(() => pieceRows(piece, s.gauge), [piece, s.gauge]);
  const row = Math.min(s.knitRow[piece.id] ?? 0, plan.length - 1);
  const cur: KnitRow | undefined = plan[row];

  const setRow = (r: number) => setState((st) => ({ knitRow: { ...st.knitRow, [piece.id]: Math.max(0, Math.min(plan.length - 1, r)) } }));

  // Announce alerts on row change
  const lastAnnounced = useRef<string>('');
  useEffect(() => {
    if (!cur) return;
    const key = `${piece.id}:${row}`;
    if (lastAnnounced.current === key) return;
    lastAnnounced.current = key;
    if (!cur.alerts.length || voice === 'off') return;
    if (voice === 'beep') beep();
    else speak(`Row ${cur.row}. ${cur.alerts.join('. ')}`);
  }, [row, piece.id, cur, voice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select') || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setRow(row + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setRow(row - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Chart canvas
  const chartRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const fitW = useWidth(scrollRef) - 2;
  // 1 = fit the whole piece across the screen; zoom multiplies that
  const fitCell = Math.min(10, fitW / Math.max(1, geo.width + 2));
  const cellW = Math.max(0.5, fitCell * zoom);
  const cellH = cellW * (s.gauge.sts / s.gauge.rows);
  useEffect(() => {
    const cv = chartRef.current;
    if (!cv) return;
    const src = renderPieceCanvas(piece, s.gauge, s.pattern);
    const dpr = window.devicePixelRatio || 1;
    const W = src.width * cellW, H = src.height * cellH;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, W, H);
    // dim completed rows
    const yCur = (src.height - 1 - row) * cellH;
    ctx.fillStyle = 'rgba(120,120,120,0.45)';
    ctx.fillRect(0, yCur + cellH, W, H - yCur - cellH);
    ctx.strokeStyle = '#d9542b'; ctx.lineWidth = 2;
    ctx.strokeRect(1, yCur, W - 2, cellH);
    // markers
    ctx.fillStyle = '#d9542b';
    piece.markers.forEach((m) => { const y = (src.height - m) * cellH; ctx.fillRect(0, y, 6, cellH); });
    const sc = scrollRef.current;
    if (sc) {
      const top = cv.offsetTop + yCur - sc.clientHeight / 2;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      sc.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [piece, s.gauge, s.pattern, row, cellW, cellH]);

  // Machine link via Web Serial (Chrome/Edge). Each carriage pass sends data; N passes advance one row.
  const connect = async () => {
    const nav = navigator as any;
    if (!nav.serial) { toast('Machine link needs Chrome or Edge (Web Serial). Keyboard: space advances a row.'); return; }
    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setSerial('connected');
      toast('Machine link connected');
      const reader = port.readable.getReader();
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) {
              passCount.current++;
              if (passCount.current >= passesPerRow) {
                passCount.current = 0;
                setState((st) => {
                  const id = piece.id;
                  const r = Math.min((st.knitRow[id] ?? 0) + 1, plan.length - 1);
                  return { knitRow: { ...st.knitRow, [id]: r } };
                });
              }
            }
          }
        } catch { /* port closed */ }
        reader.releaseLock();
      })();
    } catch (e: any) {
      if (e?.name !== 'NotFoundError') toast('Could not open machine link');
    }
  };
  const disconnect = async () => {
    try { await portRef.current?.close(); } catch { /* ignore */ }
    portRef.current = null;
    setSerial('none');
  };

  const exportChart = () => {
    renderPieceCanvas(piece, s.gauge, s.pattern).toBlob((b) => b && downloadBlob(b, `${piece.name}-chart.png`));
  };

  // needle bed strip for current row
  const bedCells = useMemo(() => {
    if (!cur) return [];
    const out: { n: number; color: string | null; st: number }[] = [];
    const ribRows = Math.round(((piece.ribRows ?? 0) * s.gauge.rows) / 10);
    for (let n = geo.leftNeedle; n < geo.leftNeedle + geo.width; n++) {
      const inWork = cur.spans.some(([a, b]) => n >= a && n <= b);
      if (!inWork) { out.push({ n, color: null, st: 0 }); continue; }
      const k = cellAt(s.pattern, n - geo.leftNeedle + piece.offset.x, row - ribRows + piece.offset.y);
      out.push({ n, color: cur.rib ? s.pattern.palette[0] : s.pattern.palette[s.pattern.colors[k]], st: cur.rib ? 0 : s.pattern.stitches[k] });
    }
    return out;
  }, [cur, geo, s.pattern, piece, row, s.gauge.rows]);

  const total = cur ? cur.spans.reduce((t, sp) => t + spanCount(sp), 0) : 0;
  const labelStep = [10, 20, 30, 50, 100].find((st) => st * cellW >= 30) ?? 100;
  const upcoming = plan.slice(row + 1, row + 40).filter((r) => r.alerts.length).slice(0, 5);

  return (
    <>
      <div className="toolbar">
        <h1>Interactive Knitting</h1>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 160 }}>
          {s.pieces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value={SWATCH_ID}>Tension swatch</option>
        </select>
        <div className="sep" />
        <Seg value={voice} options={[{ key: 'voice', label: 'Voice' }, { key: 'beep', label: 'Beep' }, { key: 'off', label: 'Silent' }]} onChange={setVoice} />
        <div className="sep" />
        {serial === 'none'
          ? <button className="btn" onClick={connect} title="Connect a carriage sensor / cable link over USB-serial">Connect machine…</button>
          : <button className="btn on" onClick={disconnect}>Machine linked ✓</button>}
        <div className="spacer" />
        <button className="btn" onClick={exportChart}>Chart PNG</button>
        <button className="btn" onClick={() => window.print()} title={`${CMD}P`}>Print instructions</button>
      </div>
      <div className="content">
        <div className="stage knit-stage">
          <div className="knit-chart-bar">
            <span className="muted">{piece.name} · {geo.width} needles · {plan.length} rows</span>
            <ZoomControls zoom={zoom} setZoom={setZoom} min={0.5} max={8} />
          </div>
          <div className="chart-scroll" ref={scrollRef}>
            <div className="bed" style={{ width: (geo.width + 2) * cellW }}>
              <div className="bed-title">Needle bed · row {cur?.row}</div>
              <div className="bed-cells" style={{ paddingLeft: cellW }}>
                {bedCells.map((c) => (
                  <div key={c.n} title={needleLabel(c.n)} className="bed-cell"
                    style={{ width: cellW, background: c.color ?? 'transparent', borderRight: cellW >= 5 ? '1px solid rgba(0,0,0,.12)' : undefined, opacity: c.color ? 1 : 0.25 }}>
                    {c.st && cellW >= 8 ? <span>{'·-TS\\/o'[c.st]}</span> : null}
                  </div>
                ))}
              </div>
              <div className="bed-labels" style={{ height: 14 }}>
                {bedCells.filter((c) => {
                  const k = c.n < 0 ? -c.n : c.n + 1;
                  return k % labelStep === 0;
                }).map((c) => (
                  <span key={c.n} style={{ left: (c.n - geo.leftNeedle + 1.5) * cellW, color: c.n < 0 ? '#d9822b' : '#2b9d55' }}>{needleLabel(c.n)}</span>
                ))}
                <span style={{ left: (-geo.leftNeedle + 1) * cellW, color: 'var(--muted)' }}>|</span>
              </div>
            </div>
            <canvas ref={chartRef} style={{ display: 'block', imageRendering: 'pixelated', cursor: 'pointer' }}
              onClick={(e) => {
                const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
                setRow(plan.length - 1 - Math.floor((e.clientY - r.top) / cellH));
              }} />
            <div className="chart-tail" aria-hidden="true" />
          </div>
          <p className="hint">Tap a row on the chart to jump to it.</p>
        </div>
        <aside className="inspector">
          {target === SWATCH_ID && (
            <div className="group">
              <h3>Swatch</h3>
              <NumField label="Stitches" value={swatch.sts} min={4} max={200} onChange={(v) => setSwatch({ ...swatch, sts: v })} />
              <NumField label="Rows" value={swatch.rows} min={4} max={400} onChange={(v) => setSwatch({ ...swatch, rows: v })} />
            </div>
          )}
          <div className="group">
            <h3>{piece.name}</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="knit-big">{cur?.row ?? 0}</span><span className="muted">of {plan.length} rows</span>
            </div>
            <div style={{ height: 6, background: 'var(--hover)', borderRadius: 3 }}>
              <div style={{ height: 6, width: `${((row + 1) / plan.length) * 100}%`, background: 'var(--accent)', borderRadius: 3 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn" onClick={() => setRow(row - 1)}>◀ Back</button>
              <button className="btn primary" onClick={() => setRow(row + 1)}>Next row ▶</button>
            </div>
            <div className="hint keys-hint">Space or → advances · ← goes back</div>
          </div>
          {cur && (
            <div className="group">
              <h3>This row</h3>
              <div><b>Needles:</b> {cur.spans.map(spanLabel).join(' and ') || '—'} <span className="muted">({total} sts)</span></div>
              <div><b>Technique:</b> <span className="tag">{cur.technique}</span></div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b>Yarn:</b>
                {cur.colors.map((c) => <span key={c} className="swatch" style={{ width: 20, height: 20, background: s.pattern.palette[c] }} title={`Colour ${c + 1}`} />)}
              </div>
              {cur.alerts.map((a, i) => <div key={i} className="alert">{a}</div>)}
              <button className="btn" onClick={() => {
                if (target === SWATCH_ID) return;
                const has = piece.markers.includes(cur.row);
                updatePiece(piece.id, { markers: has ? piece.markers.filter((m) => m !== cur.row) : [...piece.markers, cur.row] }, true);
              }} disabled={target === SWATCH_ID}>{piece.markers.includes(cur.row) ? 'Remove marker' : 'Add marker on this row'}</button>
            </div>
          )}
          <div className="group">
            <h3>Coming up</h3>
            {upcoming.length ? upcoming.map((r) => (
              <div key={r.row} className="list-item" onClick={() => setRow(r.row - 1)} style={{ alignItems: 'flex-start' }}>
                <b style={{ minWidth: 34 }}>R{r.row}</b><span>{r.alerts[0]}{r.alerts.length > 1 ? ` (+${r.alerts.length - 1})` : ''}</span>
              </div>
            )) : <span className="muted">Nothing in the next 40 rows.</span>}
          </div>
          <div className="group">
            <h3>Machine link</h3>
            <NumField label="Carriage passes per row" value={passesPerRow} min={1} max={4} onChange={setPassesPerRow} />
            <p className="hint" style={{ margin: 0 }}>Works with any USB-serial carriage counter or cable link that sends a signal on each pass (Chrome/Edge on macOS). Without one, use the keyboard or a Bluetooth page-turner pedal mapped to Space.</p>
          </div>
        </aside>
      </div>
      <div className="knit-dock" role="toolbar" aria-label="Row controls">
        <button className="btn dock-back" onClick={() => setRow(row - 1)} aria-label="Previous row">◀</button>
        <div className="dock-info">
          <b>Row {cur?.row ?? 0}<span className="muted"> / {plan.length}</span></b>
          <small>{cur?.alerts[0] ?? `${cur?.spans.map(spanLabel).join(' + ') ?? ''} · ${cur?.technique ?? ''}`}</small>
        </div>
        <button className="btn primary dock-next" onClick={() => setRow(row + 1)} disabled={row >= plan.length - 1}>Next row ▶</button>
      </div>
    </>
  );
}
