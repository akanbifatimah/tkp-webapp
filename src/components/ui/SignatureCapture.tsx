import { Eraser, PenLine, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Draw a signature, or upload a photo or scan of one. Either way it is cleaned
 * up the same way before it is used: the paper is made transparent, the ink is
 * cropped tight, and it is scaled to fit 600 × 200, so it sits well on a
 * certificate and stays small (a few KB of PNG).
 */

const PAD_W = 600;
const PAD_H = 200;
const INK = "#1d2550";
const MAX_UPLOAD = 5 * 1024 * 1024;

export function SignatureCapture({
  onSave,
  onCancel,
  saveLabel = "Use this signature",
  busy = false,
  className,
}: {
  onSave: (png: string) => void;
  onCancel?: () => void;
  saveLabel?: string;
  busy?: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<"draw" | "upload">("draw");
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const fileId = useId();

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.2;
  }, [tab]);

  const at = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAD_W, y: ((e.clientY - r.top) / r.height) * PAD_H };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = at(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    setHasInk(true);
    setError(null);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = at(e);
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => (last.current = null);
  const clear = () => {
    canvas.current?.getContext("2d")?.clearRect(0, 0, PAD_W, PAD_H);
    setHasInk(false);
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    setUploaded(null);
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError("Choose a PNG or JPEG image");
    if (file.size > MAX_UPLOAD) return setError("Choose an image under 5 MB");
    try {
      const img = await loadImage(file);
      setUploaded(cleanSignature(img, img.naturalWidth, img.naturalHeight));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That image couldn't be read");
    }
  };

  const save = () => {
    try {
      if (tab === "draw") {
        if (!canvas.current || !hasInk) return setError("Sign in the box first");
        onSave(cleanSignature(canvas.current, PAD_W, PAD_H));
      } else {
        if (!uploaded) return setError("Choose an image first");
        onSave(uploaded);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That signature couldn't be used");
    }
  };

  const tabClass = (on: boolean) =>
    cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors", on ? "bg-white text-maroon-800 shadow-card" : "text-muted hover:text-ink");

  return (
    <div className={cn("rounded-2xl border border-line bg-cream-100 p-3 sm:p-4", className)}>
      <div role="tablist" aria-label="How to add the signature" className="mb-3 inline-flex gap-1 rounded-xl bg-cream-200 p-1">
        <button type="button" role="tab" aria-selected={tab === "draw"} onClick={() => (setTab("draw"), setError(null))} className={tabClass(tab === "draw")}>
          <PenLine className="size-4" aria-hidden /> Draw
        </button>
        <button type="button" role="tab" aria-selected={tab === "upload"} onClick={() => (setTab("upload"), setError(null))} className={tabClass(tab === "upload")}>
          <Upload className="size-4" aria-hidden /> Upload
        </button>
      </div>

      {tab === "draw" ? (
        <div className="relative">
          <canvas
            ref={canvas}
            width={PAD_W}
            height={PAD_H}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Signature pad: sign with your mouse, finger or pen"
            className="block aspect-3/1 w-full cursor-crosshair touch-none rounded-xl border border-line bg-white"
          />
          <span className="pointer-events-none absolute inset-x-8 bottom-[24%] border-b border-dashed border-line" aria-hidden />
          {!hasInk ? <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">Sign here</span> : null}
          {hasInk ? (
            <button type="button" onClick={clear} className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-bold text-muted hover:text-ink">
              <Eraser className="size-3.5" aria-hidden /> Clear
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor={fileId} className="flex aspect-3/1 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-white text-sm text-muted hover:border-gold-500">
            {uploaded ? (
              <img src={uploaded} alt="Your signature, cleaned up" className="max-h-[80%] max-w-[85%] object-contain" />
            ) : (
              <>
                <Upload className="size-5" aria-hidden />
                <span className="font-bold text-ink">Choose a photo or scan</span>
                <span className="text-xs">Dark ink on plain white paper works best. PNG or JPEG, up to 5 MB.</span>
              </>
            )}
          </label>
          <input id={fileId} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          {uploaded ? <p className="text-xs text-muted">The paper has been taken out. Click the box to choose a different image.</p> : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-crit">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button variant="dark" size="sm" onClick={save} loading={busy}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error("That image couldn't be read")));
    img.src = url;
  });
}

/** Paper out, ink cropped, scaled to fit 600 × 200: a transparent PNG data URL. */
export function cleanSignature(source: CanvasImageSource, w: number, h: number): string {
  // Work at a sensible size: phone photos can be 4000 px wide.
  const k = Math.min(1, 1600 / Math.max(w, h));
  const W = Math.max(1, Math.round(w * k));
  const H = Math.max(1, Math.round(h * k));
  const work = document.createElement("canvas");
  work.width = W;
  work.height = H;
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    // Light pixels are paper; mid tones fade so edges stay smooth.
    const ink = a < 24 ? 0 : Math.max(0, Math.min(1, (215 - lum) / 110)) * (a / 255);
    px[i + 3] = Math.round(ink * 255);
    if (ink > 0.12) {
      const p = i / 4;
      const x = p % W;
      const y = (p - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("No signature was found. Use dark ink on light paper.");
  ctx.putImageData(data, 0, 0);
  const pad = Math.round(Math.max(W, H) * 0.01) + 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const s = Math.min(PAD_W / cw, PAD_H / ch, 2);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * s));
  out.height = Math.max(1, Math.round(ch * s));
  const o = out.getContext("2d")!;
  o.imageSmoothingQuality = "high";
  o.drawImage(work, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
