import { useEffect, useMemo, useState, type JSX } from 'react';
import { Section, getState, loadProject, newProject, redo, setState, undo, useStore } from './store';
import { CMD, NumField, pickFile, toast } from './components/ui';
import { downloadBlob, patternDataUrl } from './lib/image';
import { knitPlan, summarize, renderPieceCanvas, bbox } from './lib/knit';
import GarmentStyling from './sections/GarmentStyling';
import PatternDrafting from './sections/PatternDrafting';
import StitchDesigner from './sections/StitchDesigner';
import InteractiveKnitting from './sections/InteractiveKnitting';
import GraphicsStudio from './sections/GraphicsStudio';

const ICONS: Record<Section, JSX.Element> = {
  garment: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M5.5 2 2 4l1.2 3 1.6-.6V14h6.4V6.4l1.6.6L14 4l-3.5-2c-.4 1-1.3 1.6-2.5 1.6S5.9 3 5.5 2Z" /></svg>,
  drafting: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M2 14 11.5 4.5l2 2L4 16" /><path d="M10 6 12 8M2 14l-.5 1.5L3 15" /><circle cx="4" cy="4" r="1.6" /></svg>,
  stitch: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></svg>,
  knitting: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 5l3 3 3-3 3 3 3-3M2 10l3 3 3-3 3 3 3-3" /></svg>,
  graphics: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="m3 12 3.5-4 2.5 3 1.5-1.5L13 12" /><circle cx="11" cy="5.5" r="1.2" /></svg>,
};

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'garment', label: 'Garment Styling' },
  { key: 'drafting', label: 'Pattern Drafting' },
  { key: 'stitch', label: 'Stitch Designer' },
  { key: 'knitting', label: 'Interactive Knitting' },
  { key: 'graphics', label: 'Graphics Studio' },
];

async function saveProject() {
  const s = getState();
  const json = JSON.stringify({ ...s, app: 'loomwright', version: 1 }, null, 1);
  const name = `${s.name.replace(/[^\w\- ]+/g, '').trim() || 'project'}.loomwright.json`;
  const w = window as any;
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Loomwright project', accept: { 'application/json': ['.json'] } }] });
      const wr = await h.createWritable();
      await wr.write(json); await wr.close();
      toast('Project saved');
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  downloadBlob(new Blob([json], { type: 'application/json' }), name);
  toast('Project downloaded');
}

async function openProject() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try { loadProject(await f.text()); toast(`Opened ${f.name}`); } catch (e: any) { toast(e.message || 'Could not open file'); }
}

function PrintView() {
  const s = useStore();
  const url = useMemo(() => patternDataUrl(s.pattern, false), [s.pattern]);
  const pieces = useMemo(() => s.pieces.map((p) => {
    const plan = knitPlan(p, s.gauge, s.pattern);
    const b = bbox(p.points);
    const cv = renderPieceCanvas(p, s.gauge, s.pattern);
    return { p, plan, lines: summarize(plan), b, img: cv.toDataURL(), ratio: (cv.height / cv.width) * (s.gauge.sts / s.gauge.rows) };
  }), [s.pieces, s.gauge, s.pattern]);
  return (
    <div className="print-root">
      <h1>{s.name}</h1>
      <p>Tension: {s.gauge.sts} sts × {s.gauge.rows} rows = 10 cm. Stitch pattern repeat {s.pattern.w} × {s.pattern.h}.
        Yarn colours: {s.pattern.palette.map((c, i) => `${i + 1} (${c})`).join(', ')}.</p>
      <img src={url} style={{ width: Math.min(400, s.pattern.w * 8), height: Math.min(400, s.pattern.w * 8) * (s.pattern.h / s.pattern.w) * (s.gauge.sts / s.gauge.rows) }} alt="Stitch pattern" />
      {pieces.map(({ p, plan, lines, b, img, ratio }) => (
        <section key={p.id} className="print-piece">
          <h2>{p.name} — {b.w.toFixed(1)} × {b.h.toFixed(1)} cm, {plan.length} rows</h2>
          <img src={img} style={{ width: Math.min(260, 340 / ratio), height: Math.min(260, 340 / ratio) * ratio }} alt="" />
          <ol style={{ listStyle: 'none', paddingLeft: 0 }}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
        </section>
      ))}
    </div>
  );
}

export default function App() {
  const s = useStore();
  const [confirmNew, setConfirmNew] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea, select');
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y' && !typing) { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); saveProject(); }
      else if (k === 'o') { e.preventDefault(); openProject(); }
      else if (/^[1-5]$/.test(k)) { e.preventDefault(); setState({ section: SECTIONS[+k - 1].key }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <img src="icon.svg" alt="" />
            <div><b>Loomwright</b><small>Machine knit studio</small></div>
          </div>
          <div className="side-label">Workflow</div>
          {SECTIONS.map((sec, i) => (
            <button key={sec.key} className={`nav-item ${s.section === sec.key ? 'active' : ''}`} onClick={() => setState({ section: sec.key })} title={`${CMD}${i + 1}`}>
              {ICONS[sec.key]}{sec.label}<span className="num">{CMD}{i + 1}</span>
            </button>
          ))}
          <div className="side-box">
            <div className="field wide"><label>Project</label>
              <input type="text" value={s.name} onChange={(e) => setState({ name: e.target.value })} />
            </div>
            <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>TENSION (PER 10 CM)</div>
            <NumField label="Stitches" value={s.gauge.sts} min={4} max={80} onChange={(v) => setState({ gauge: { ...s.gauge, sts: v } })} />
            <NumField label="Rows" value={s.gauge.rows} min={4} max={120} onChange={(v) => setState({ gauge: { ...s.gauge, rows: v } })} />
            <div className="row2">
              <button className="btn" onClick={openProject} title={`${CMD}O`}>Open…</button>
              <button className="btn" onClick={saveProject} title={`${CMD}S`}>Save…</button>
            </div>
            <div className="row2">
              <button className="btn" onClick={undo} title={`${CMD}Z`}>Undo</button>
              <button className="btn" onClick={redo} title={`⇧${CMD}Z`}>Redo</button>
            </div>
            <button className={`btn ${confirmNew ? 'on' : ''}`} onClick={() => {
              if (confirmNew) { newProject(); setConfirmNew(false); toast('New project started'); }
              else { setConfirmNew(true); setTimeout(() => setConfirmNew(false), 3000); }
            }}>{confirmNew ? 'Click again to discard current' : 'New project'}</button>
          </div>
        </aside>
        <main className="main">
          {s.section === 'garment' && <GarmentStyling />}
          {s.section === 'drafting' && <PatternDrafting />}
          {s.section === 'stitch' && <StitchDesigner />}
          {s.section === 'knitting' && <InteractiveKnitting />}
          {s.section === 'graphics' && <GraphicsStudio />}
        </main>
      </div>
      <PrintView />
    </>
  );
}
