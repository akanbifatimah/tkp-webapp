import QRCode from "qrcode";
import { useMemo, type CSSProperties } from "react";

/**
 * A QR code drawn as one vector path (PRD QR-5: print quality, high error
 * correction). The quiet zone of 4 modules is part of the image.
 */
export function QrImage({ value, className, style, title }: { value: string; className?: string; style?: CSSProperties; title?: string }) {
  const { size, d } = useMemo(() => {
    const m = QRCode.create(value, { errorCorrectionLevel: "H" }).modules;
    let path = "";
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (!m.get(y, x)) continue;
        // Join runs of dark modules into one rectangle per run.
        let run = 1;
        while (x + run < m.size && m.get(y, x + run)) run++;
        path += `M${x + 4} ${y + 4}h${run}v1h-${run}z`;
        x += run - 1;
      }
    }
    return { size: m.size + 8, d: path };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} style={style} role="img" aria-label={title ?? `QR code for ${value}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#1a0f12" />
    </svg>
  );
}

/** Modules across, quiet zone included: used for the minimum printed size check. */
export const qrModules = (value: string) => QRCode.create(value, { errorCorrectionLevel: "H" }).modules.size + 8;
