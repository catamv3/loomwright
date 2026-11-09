import { useMemo } from 'react';
import { setState, useStore } from '../store';
import { GarmentSpec, MEAS_LABELS, Measurements, NECKLINES, SIZE_TABLES, STYLES, SleeveLen, generateGarment } from '../lib/garment';
import { NumField, Seg, toast } from '../components/ui';
import { PieceThumb } from '../components/PieceShape';

export default function GarmentStyling() {
  const s = useStore();
  const g = s.garment;
  const preview = useMemo(() => generateGarment(g), [g]);
  const table = SIZE_TABLES[g.sizeTable];

  const update = (patch: Partial<GarmentSpec>) => setState({ garment: { ...g, ...patch } });
  const setSize = (size: string, tableKey = g.sizeTable) => {
    const t = SIZE_TABLES[tableKey];
    if (size === 'custom' || !t.sizes[size]) update({ sizeTable: tableKey, size: 'custom' });
    else update({ sizeTable: tableKey, size, meas: { ...t.sizes[size] } });
  };
  const setMeas = (k: keyof Measurements, v: number) => update({ meas: { ...g.meas, [k]: v }, size: 'custom' });

  const apply = (goto?: 'drafting' | 'stitch') => {
    setState({ pieces: preview, activePiece: preview[0].id, ...(goto ? { section: goto } : {}) }, true);
    toast(`${preview.length} garment pieces created`);
  };

  const finished = (g.meas.chest + g.ease).toFixed(0);

  return (
    <>
      <div className="toolbar">
        <h1>Garment Styling</h1>
        <span className="muted">Pick a standard garment, size it, adjust styling.</span>
        <div className="spacer" />
        <button className="btn" onClick={() => apply()}>Use garment</button>
        <button className="btn primary" onClick={() => apply('drafting')}>Open in Pattern Drafting →</button>
      </div>
      <div className="content">
        <div className="stage" style={{ padding: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
            {preview.map((p) => <PieceThumb key={p.id} piece={p} gauge={s.gauge} size={240} />)}
          </div>
          <div className="card" style={{ padding: 16, marginTop: 20, maxWidth: 760 }}>
            <b>Finished measurements</b>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 8 }} className="muted">
              <span>Chest {finished} cm</span>
              <span>Length {g.meas.length} cm</span>
              <span>Ribbing {g.rib} cm</span>
              <span>Tension {s.gauge.sts} sts / {s.gauge.rows} rows</span>
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              Knit this garment as-is in Interactive Knitting, or take it to Pattern Drafting to reshape any piece freely.
            </p>
          </div>
        </div>
        <aside className="inspector">
          <div className="group">
            <h3>Garment</h3>
            <select value={g.style} onChange={(e) => update({ style: e.target.value as GarmentSpec['style'] })}>
              {STYLES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </div>
          <div className="group">
            <h3>Neckline</h3>
            <Seg value={g.neckline} options={NECKLINES} onChange={(v) => update({ neckline: v })} />
          </div>
          {g.style !== 'vest' && (
            <div className="group">
              <h3>Sleeve length</h3>
              <Seg<SleeveLen> value={g.sleeveLen} options={[{ key: 'long', label: 'Long' }, { key: 'three-quarter', label: '¾' }, { key: 'short', label: 'Short' }]} onChange={(v) => update({ sleeveLen: v })} />
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
            {(Object.keys(MEAS_LABELS) as (keyof Measurements)[]).map((k) => (
              <NumField key={k} label={MEAS_LABELS[k]} value={g.meas[k]} step={0.5} min={1} onChange={(v) => setMeas(k, v)} />
            ))}
            <p className="hint" style={{ margin: 0 }}>Editing a measurement switches to your own (custom) size.</p>
          </div>
          <div className="group">
            <h3>Styling</h3>
            <NumField label="Ease" suffix="cm" value={g.ease} step={1} min={-10} max={40} onChange={(v) => update({ ease: v })} />
            <NumField label="Ribbing / welt" suffix="cm" value={g.rib} step={0.5} min={0} max={20} onChange={(v) => update({ rib: v })} />
          </div>
        </aside>
      </div>
    </>
  );
}
