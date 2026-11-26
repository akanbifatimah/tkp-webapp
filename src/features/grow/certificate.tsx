import { forwardRef, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { QrImage } from "@/features/welcome/QrImage";
import { cn } from "@/lib/cn";
import { stepLabel, type Certificate } from "./grow-types";

/**
 * The certificate (member view, Figma 131:12926: class, teacher, parish pastor,
 * ID). It is drawn once, as an A4 landscape page at 96 dpi, so the preview on
 * screen and the downloaded PDF are the same picture: the screen only scales it.
 */

/** A4 landscape at 96 dpi. */
export const CERT_W = 1123;
export const CERT_H = 794;

const longFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric" });

/** What a certificate shows. Before it's issued there is no serial, date or verify link. */
export type CertificateDraft = Pick<Certificate, "name" | "courseTitle" | "step" | "teacher" | "pastor" | "teacherSignature" | "pastorSignature"> & {
  serial: string | null;
  issuedAt: string | null;
  status?: Certificate["status"];
  verifyUrl?: string;
};

export const CertificatePage = forwardRef<HTMLDivElement, { c: CertificateDraft }>(function CertificatePage({ c }, ref) {
  const issued = !!c.serial;
  return (
    <div ref={ref} style={{ width: CERT_W, height: CERT_H }} className="relative overflow-hidden bg-cream-50 p-7 text-ink">
      {/* Frame: a maroon band, then a fine double gold rule. */}
      <div className="relative flex h-full flex-col border-10 border-maroon-800 p-2">
        <div className="relative flex h-full flex-col items-center border-4 border-double border-gold-500 px-16 pt-10 pb-8 text-center">
          <Corner className="top-2 left-2" />
          <Corner className="top-2 right-2 rotate-90" />
          <Corner className="right-2 bottom-2 rotate-180" />
          <Corner className="bottom-2 left-2 -rotate-90" />

          <img src="/tkp-logo.png" alt="" width={52} height={56} className="h-14 w-auto" />
          <p className="mt-2 font-display text-[22px] font-semibold text-maroon-900">The King's Palace</p>
          <p className="text-[11px] font-bold tracking-[0.24em] text-gold-800 uppercase">RCCG · TKP Hub</p>

          <p className="mt-7 text-sm font-extrabold tracking-[0.42em] text-gold-800 uppercase">Certificate of completion</p>
          <p className="mt-6 text-[15px] text-muted italic">This certifies that</p>
          <p className="mt-2 max-w-full truncate px-4 font-display text-[54px] leading-tight font-semibold text-maroon-950">{c.name || " "}</p>
          <span className="mt-2 h-px w-105 bg-linear-to-r from-transparent via-gold-500 to-transparent" aria-hidden />
          <p className="mt-4 text-[15px] text-muted italic">has faithfully completed</p>
          <p className="mt-1 font-display text-[28px] font-semibold text-ink">{c.courseTitle}</p>
          {c.step ? (
            <p className="mt-1 text-[13px] text-muted">
              Step {c.step} on the discipleship pathway: {stepLabel(c.step)}
            </p>
          ) : null}

          <div className="mt-auto grid w-full grid-cols-[1fr_auto_1fr] items-end gap-10">
            <Signature name={c.teacher} image={c.teacherSignature} role="Class teacher" />
            <div className="flex flex-col items-center gap-1.5">
              {issued && c.verifyUrl ? (
                <QrImage value={c.verifyUrl} className="size-22" title={`Verify ${c.serial}`} />
              ) : (
                <span className="grid size-22 place-items-center rounded-md border border-dashed border-gold-500 px-2 text-[10px] leading-tight text-muted">
                  QR code added when issued
                </span>
              )}
              <span className="font-mono text-[11px] text-ink">{c.serial ?? "TKP-····-···"}</span>
            </div>
            <Signature name={c.pastor} image={c.pastorSignature} role="Parish pastor" />
          </div>

          <p className="mt-4 text-[11px] text-muted">
            {issued ? (
              <>Issued {c.issuedAt ? longFmt.format(new Date(c.issuedAt)) : ""}</>
            ) : (
              "The ID, issue date and verify code are added when it's issued."
            )}
          </p>
        </div>
      </div>

      {c.status && c.status !== "valid" ? (
        <span className="absolute top-12 -right-18 rotate-45 bg-crit px-24 py-2 text-sm font-extrabold tracking-[0.3em] text-white uppercase">
          {c.status === "revoked" ? "Revoked" : "Replaced"}
        </span>
      ) : null}
    </div>
  );
});

function Signature({ name, image, role }: { name: string | null; image: string | null; role: string }) {
  return (
    <div>
      {/* The space is kept with or without a signature, so the layout never shifts. */}
      <div className="flex h-16 items-end justify-center">{image ? <img src={image} alt="" className="max-h-16 max-w-60 object-contain" /> : null}</div>
      <div className="border-t border-maroon-900/40 pt-2 text-[12px] text-muted">
      <span className="block font-display text-[17px] font-semibold text-ink">{name || " "}</span>
      {role}
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("absolute size-10 text-gold-500", className)} aria-hidden>
      <path d="M2 38V2h36" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 38V8h30" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
    </svg>
  );
}

/** Shows the page shrunk to the width it's given. `pageRef` points at the full-size page, for the PDF. */
export function ScaledCertificate({ c, pageRef, className, children }: { c: CertificateDraft; pageRef?: Ref<HTMLDivElement>; className?: string; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / CERT_W || 0.5);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const inner: CSSProperties = { width: CERT_W, height: CERT_H, transform: `scale(${scale})`, transformOrigin: "top left" };
  return (
    <div ref={box} className={cn("relative w-full overflow-hidden rounded-xl shadow-card ring-1 ring-line", className)} style={{ height: CERT_H * scale }}>
      <div style={inner}>
        <CertificatePage ref={pageRef} c={c} />
      </div>
      {children}
    </div>
  );
}

/**
 * Downloads the page as an A4 landscape PDF. The libraries load only when
 * someone downloads. A server-made PDF (PRD 4.4) can replace this later.
 */
export async function downloadCertificatePdf(page: HTMLElement, fileName: string) {
  const [{ toJpeg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const image = await toJpeg(page, { quality: 0.95, pixelRatio: 2.5, width: CERT_W, height: CERT_H, cacheBust: true });
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: fileName, creator: "TKP Hub" });
  pdf.addImage(image, "JPEG", 0, 0, 297, 210);
  pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "certificate"}.pdf`);
}
