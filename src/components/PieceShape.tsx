import type { Gauge, Piece } from '../store';
import { bbox } from '../lib/knit';

/** Pattern-fill definitions for a piece, in cm coordinates (use inside a y-flipped group). */
export function PieceFill({ piece, gauge, url, pw, ph, ribColor, idPrefix }: {
  piece: Piece; gauge: Gauge; url: string; pw: number; ph: number; ribColor: string; idPrefix: string;
}) {
  const sPerCm = gauge.sts / 10, rPerCm = gauge.rows / 10;
  const b = bbox(piece.points);
  const ribRows = Math.round(((piece.ribRows ?? 0) * gauge.rows) / 10);
  const ribH = ribRows / rPerCm;
  const tw = pw / sPerCm, th = ph / rPerCm;
  const ox = b.minX - piece.offset.x / sPerCm;
  const oy = b.minY + ribH - piece.offset.y / rPerCm;
  const clip = `${idPrefix}-clip`;
  return (
    <>
      <defs>
        <pattern id={`${idPrefix}-pat`} patternUnits="userSpaceOnUse" x={ox} y={oy} width={tw} height={th}>
          <image href={url} x={0} y={0} width={tw} height={th} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} />
        </pattern>
        <pattern id={`${idPrefix}-rib`} patternUnits="userSpaceOnUse" x={b.minX} y={0} width={2 / sPerCm} height={1}>
          <rect width={2 / sPerCm} height={1} fill={ribColor} />
          <rect width={0.6 / sPerCm} height={1} fill="rgba(0,0,0,0.18)" />
        </pattern>
        <clipPath id={clip}>
          <polygon points={piece.points.map((p) => `${p.x},${p.y}`).join(' ')} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x={b.minX} y={b.minY + ribH} width={b.w} height={Math.max(0, b.h - ribH)} fill={`url(#${idPrefix}-pat)`} />
        {ribH > 0 && <rect x={b.minX} y={b.minY} width={b.w} height={ribH} fill={`url(#${idPrefix}-rib)`} />}
      </g>
    </>
  );
}

export function Outline({ piece, strokeWidth = 0.25, fill = 'none', dash }: { piece: Piece; strokeWidth?: number; fill?: string; dash?: string }) {
  return (
    <polygon
      points={piece.points.map((p) => `${p.x},${p.y}`).join(' ')}
      fill={fill} stroke="var(--text)" strokeWidth={strokeWidth} strokeLinejoin="round" strokeDasharray={dash}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Static schematic of a piece with dimension labels. */
export function PieceThumb({ piece, gauge, fillUrl, pw, ph, ribColor, size = 220, onClick, active }: {
  piece: Piece; gauge: Gauge; fillUrl?: string; pw?: number; ph?: number; ribColor?: string; size?: number; onClick?: () => void; active?: boolean;
}) {
  const b = bbox(piece.points);
  const pad = 6;
  const vb = `${b.minX - pad} ${-(b.maxY + pad)} ${b.w + pad * 2} ${b.h + pad * 2}`;
  const sts = Math.round((b.w * gauge.sts) / 10), rows = Math.round((b.h * gauge.rows) / 10);
  return (
    <div className="card" onClick={onClick} style={{ padding: 12, outline: active ? '2px solid var(--accent)' : 'none', cursor: onClick ? 'default' : undefined }}>
      <svg viewBox={vb} style={{ width: size, height: size, display: 'block' }}>
        <g transform="scale(1,-1)">
          {fillUrl && pw && ph ? (
            <PieceFill piece={piece} gauge={gauge} url={fillUrl} pw={pw} ph={ph} ribColor={ribColor ?? '#ddd'} idPrefix={`thumb-${piece.id}`} />
          ) : (
            <polygon points={piece.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--accent-soft)" />
          )}
          <Outline piece={piece} strokeWidth={1.5} />
        </g>
        <text x={(b.minX + b.maxX) / 2} y={-(b.minY) + pad - 1.2} fontSize={3} textAnchor="middle" fill="var(--muted)">{b.w.toFixed(1)} cm</text>
        <text x={b.maxX + pad - 1} y={-(b.minY + b.maxY) / 2} fontSize={3} textAnchor="middle" fill="var(--muted)" transform={`rotate(90 ${b.maxX + pad - 1} ${-(b.minY + b.maxY) / 2})`}>{b.h.toFixed(1)} cm</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <b>{piece.name}</b>
        <span className="muted">{sts} sts × {rows} rows</span>
      </div>
    </div>
  );
}
