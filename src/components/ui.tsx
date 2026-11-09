import React, { ReactNode, useEffect, useState } from 'react';

export function NumField({ label, value, onChange, step = 1, min, max, suffix }: {
  label: ReactNode; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="field">
      <label>{label}{suffix ? <span className="muted"> ({suffix})</span> : null}</label>
      <input
        type="number" value={text} step={step} min={min} max={max}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : v);
        }}
      />
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.key} title={o.title} className={o.key === value ? 'on' : ''} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let el = document.querySelector('.toast') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { if (el) el.style.display = 'none'; }, 2200);
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const CMD = isMac ? '⌘' : 'Ctrl+';

export function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files?.[0] ?? null);
    i.click();
  });
}

/** Live content-box width of an element (for fitting charts to the screen). */
export function useWidth(ref: React.RefObject<HTMLElement | null>, fallback = 600) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth || fallback);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

export function ZoomControls({ zoom, setZoom, min = 0.5, max = 6, label = true }: { zoom: number; setZoom: (z: number) => void; min?: number; max?: number; label?: boolean }) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button className="btn icon" aria-label="Zoom out" onClick={() => setZoom(Math.max(min, +(zoom / 1.4).toFixed(3)))}>−</button>
      <button className="btn" onClick={() => setZoom(1)} title="Fit to screen">{label ? (zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`) : 'Fit'}</button>
      <button className="btn icon" aria-label="Zoom in" onClick={() => setZoom(Math.min(max, +(zoom * 1.4).toFixed(3)))}>+</button>
    </div>
  );
}
