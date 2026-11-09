import { useEffect, useRef, useState } from 'react';
import { setState, useStore } from '../store';
import { NumField, readFileAsDataUrl, toast } from '../components/ui';
import { buildPalette, hexToRgb, mapToPalette, rgbToHex, sampleImage } from '../lib/image';

type Result = { w: number; h: number; colors: number[]; palette: string[] };

export default function GraphicsStudio() {
  const s = useStore();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [over, setOver] = useState(false);
  const [sts, setSts] = useState(60);
  const [rows, setRows] = useState(80);
  const [keepRatio, setKeepRatio] = useState(true);
  const [nColors, setNColors] = useState(2);
  const [perRow, setPerRow] = useState(2);
  const [dither, setDither] = useState(false);
  const [locked, setLocked] = useState<(string | null)[]>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const srcRef = useRef<HTMLCanvasElement>(null);

  const autoRows = (w: number, im = img) => (im ? Math.max(1, Math.round(w * (im.height / im.width) * (s.gauge.rows / s.gauge.sts))) : rows);

  const load = async (f: File) => {
    if (!f.type.startsWith('image/')) { toast('Please choose an image file'); return; }
    const url = await readFileAsDataUrl(f);
    const im = new Image();
    im.onload = () => { setImg(im); setRows(autoRows(sts, im)); setLocked([]); };
    im.src = url;
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); load(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // convert (debounced)
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const px = sampleImage(img, sts, rows);
      const lockRgb = Array.from({ length: nColors }, (_, i) => (locked[i] ? hexToRgb(locked[i]!) : null));
      const pal = buildPalette(px, nColors, lockRgb);
      const idx = mapToPalette(px, sts, rows, pal, Math.min(perRow, nColors), dither);
      // sort palette: lightest first so colour 1 is the background/main yarn
      const order = pal.map((c, i) => [0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], i]).sort((a, b) => b[0] - a[0]).map((a) => a[1]);
      const lockedAny = locked.some(Boolean);
      const finalOrder = lockedAny ? pal.map((_, i) => i) : order;
      const remap = new Map(finalOrder.map((old, neu) => [old, neu]));
      setResult({ w: sts, h: rows, colors: idx.map((i) => remap.get(i)!), palette: finalOrder.map((i) => rgbToHex(pal[i])) });
    }, 120);
    return () => clearTimeout(t);
  }, [img, sts, rows, nColors, perRow, dither, locked]);

  // draw preview & source
  useEffect(() => {
    const cv = previewRef.current;
    if (!cv || !result) return;
    const box = 460;
    const ar = (result.h * (s.gauge.sts / s.gauge.rows)) / result.w;
    const cw = Math.max(1, box / Math.max(result.w, result.h * (s.gauge.sts / s.gauge.rows)));
    const ch = cw * (s.gauge.sts / s.gauge.rows);
    const dpr = window.devicePixelRatio || 1;
    cv.width = result.w * cw * dpr; cv.height = result.h * ch * dpr;
    cv.style.width = `${result.w * cw}px`; cv.style.height = `${result.w * cw * ar}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < result.h; y++) for (let x = 0; x < result.w; x++) {
      ctx.fillStyle = result.palette[result.colors[y * result.w + x]];
      ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
    }
    if (cw >= 5) {
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.beginPath();
      for (let x = 0; x <= result.w; x++) { ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, result.h * ch); }
      for (let y = 0; y <= result.h; y++) { ctx.moveTo(0, y * ch); ctx.lineTo(result.w * cw, y * ch); }
      ctx.stroke();
    }
  }, [result, s.gauge]);
  useEffect(() => {
    const cv = srcRef.current;
    if (!cv || !img) return;
    const box = 460, k = Math.min(box / img.width, box / img.height);
    cv.width = img.width * k; cv.height = img.height * k;
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
  }, [img]);

  const pickFrom = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (picking === null) return;
    const cv = srcRef.current!;
    const r = cv.getBoundingClientRect();
    const d = cv.getContext('2d')!.getImageData(Math.floor(((e.clientX - r.left) / r.width) * cv.width), Math.floor(((e.clientY - r.top) / r.height) * cv.height), 1, 1).data;
    const next = Array.from({ length: nColors }, (_, i) => locked[i] ?? null);
    next[picking] = rgbToHex([d[0], d[1], d[2]]);
    setLocked(next);
    setPicking(null);
  };

  const send = () => {
    if (!result) return;
    // stitch designer rows are bottom-up, image rows are top-down
    const colors: number[] = [];
    for (let r = 0; r < result.h; r++) for (let c = 0; c < result.w; c++) colors.push(result.colors[(result.h - 1 - r) * result.w + c]);
    setState({ pattern: { w: result.w, h: result.h, colors, stitches: new Array(colors.length).fill(0), palette: result.palette }, section: 'stitch' }, true);
    toast('Image converted to a stitch pattern');
  };

  const shown = result?.palette ?? [];

  return (
    <>
      <div className="toolbar">
        <h1>Graphics Studio</h1>
        <span className="muted">Turn photos, scans and artwork into knittable stitch patterns.</span>
        <div className="spacer" />
        <label className="btn">Open image…<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        <button className="btn primary" disabled={!result} onClick={send}>Send to Stitch Designer →</button>
      </div>
      <div className="content">
        <div className="stage" style={{ padding: 24 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
          {!img ? (
            <div className={`drop ${over ? 'over' : ''}`}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>🖼</div>
              <b>Drop an image here</b>
              <div>or paste with ⌘V, or use Open image…</div>
              <div className="hint" style={{ marginTop: 8 }}>PNG, JPEG, HEIC (Safari), GIF, WebP, screenshots</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="card" style={{ padding: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Original {picking !== null && <b style={{ color: 'var(--accent)' }}>— click to pick colour {picking + 1}</b>}</div>
                <canvas ref={srcRef} onClick={pickFrom} style={{ display: 'block', cursor: picking !== null ? 'crosshair' : 'default', maxWidth: '100%' }} />
              </div>
              <div className="card" style={{ padding: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Knitted preview · {sts} sts × {rows} rows · {(sts / s.gauge.sts * 10).toFixed(1)} × {(rows / s.gauge.rows * 10).toFixed(1)} cm</div>
                <canvas ref={previewRef} style={{ display: 'block' }} />
              </div>
            </div>
          )}
        </div>
        <aside className="inspector">
          <div className="group">
            <h3>Size</h3>
            <NumField label="Stitches" value={sts} min={2} max={400} onChange={(v) => { setSts(v); if (keepRatio) setRows(autoRows(v)); }} />
            <NumField label="Rows" value={rows} min={2} max={600} onChange={(v) => { setRows(v); setKeepRatio(false); }} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={keepRatio} onChange={(e) => { setKeepRatio(e.target.checked); if (e.target.checked) setRows(autoRows(sts)); }} />Keep proportions at current tension</label>
          </div>
          <div className="group">
            <h3>Yarn colours</h3>
            <NumField label="Colours in design" value={nColors} min={2} max={12} onChange={(v) => { setNColors(v); setPerRow(Math.min(perRow, v)); }} />
            <NumField label="Max colours per row" value={perRow} min={1} max={nColors} onChange={setPerRow} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} />Dither (smoother shading)</label>
            <p className="hint" style={{ margin: 0 }}>Most Fair Isle carriages knit 2 colours per row; double-jacquard can do more.</p>
          </div>
          <div className="group">
            <h3>Colour mapping</h3>
            {Array.from({ length: nColors }, (_, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="swatch" style={{ background: locked[i] ?? shown[i] ?? '#ccc', width: 24, height: 24 }} />
                <span style={{ minWidth: 64 }}>Colour {i + 1}</span>
                <input type="color" value={locked[i] ?? shown[i] ?? '#cccccc'} title="Choose any shade" onChange={(e) => { const n = Array.from({ length: nColors }, (_, k) => locked[k] ?? null); n[i] = e.target.value; setLocked(n); }} />
                <button className={`btn icon ${picking === i ? 'on' : ''}`} title="Pick from image" disabled={!img} onClick={() => setPicking(picking === i ? null : i)}>⌖</button>
                {locked[i] && <button className="btn icon" title="Unlock (let auto choose)" onClick={() => { const n = locked.slice(); n[i] = null; setLocked(n); }}>✕</button>}
              </div>
            ))}
            <p className="hint" style={{ margin: 0 }}>Colours are chosen automatically; pick from the image or choose any shade to lock a colour to your yarn.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
