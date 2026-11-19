import { churchDate } from "@/lib/time";
import { STEPS, type JourneyStatus, type Phase, type StepKey } from "./model";

/**
 * Connect's journey rules (TKP Connect doc 01 §5). The backend owns them; the
 * front end uses the same functions for display and the mock API for answers.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Whole days between two church-time calendar dates ("YYYY-MM-DD"). */
function daysBetween(fromIso: string, toIso: string) {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / DAY);
}

/** BR-15: whole weeks since the service date + 1 (week 1 = days 0–6), in church time. */
export function weekNo(serviceDate: string, now: Date = new Date()) {
  return Math.max(1, Math.floor(daysBetween(serviceDate, churchDate(now)) / 7) + 1);
}

/** BR-13: Active, in Phase 1, without the 48 Hr Welcome tick, more than 48 hours after the form was submitted. */
export function isOverdue48(
  j: { status: JourneyStatus; phase: Phase; clockStartAt: string; checklist: Partial<Record<StepKey, unknown>> },
  now: Date = new Date(),
) {
  return (
    j.status === "Active" &&
    j.phase === 1 &&
    !j.checklist.P1Welcome48h &&
    now.getTime() - new Date(j.clockStartAt).getTime() > 48 * 60 * 60 * 1000
  );
}

/** BR-12: the phase follows the Complete ticks. */
export function phaseFromChecklist(checklist: Partial<Record<StepKey, unknown>>): Phase {
  if (checklist.P2Complete) return 3;
  if (checklist.P1Complete) return 2;
  return 1;
}

/** Ticked items per phase (the queue's progress dots). */
export function doneCounts(checklist: Partial<Record<StepKey, unknown>>) {
  const count = (p: Phase) => STEPS[p].filter((s) => checklist[s.key]).length;
  return { p1: count(1), p2: count(2), p3: count(3) };
}

/**
 * The next checklist item in the guest's phase, as the live app shows it:
 * the first item after the number already done.
 */
export function nextStepLabel(phase: Phase, done: number) {
  const list = STEPS[phase];
  return done < list.length ? list[done]!.label : `Phase ${phase} complete`;
}

/* ----------------------------------------------------------------- scripts */

export type ScriptTokens = { Name: string; "Your Name": string; Day: string };

/** "[Name]" → value where the app knows it; other placeholders stay as typed (Appendix A). */
export function fillScript(body: string, tokens: Partial<ScriptTokens>) {
  return body.replace(/\[([^\]\n]{1,60})\]/g, (m, k: string) => (tokens as Record<string, string | undefined>)[k] || m);
}

export type ScriptPiece = { text: string; token?: "filled" | "open" };
export type ScriptLine = { pieces: ScriptPiece[]; direction: boolean };

/** Lines that are instructions to the caller, not words to say (shown in orange italics). */
const DIRECTION = /^(Action:|Then:|If yes, continue:|If they agree|Goal:|Who:)/;
const TOKEN = /\[([^\]\n]{1,60})\]|\(Replace with your phone number\)/g;

/** Split a script into lines and pieces so placeholders can be styled. */
export function scriptLines(body: string, tokens: Partial<ScriptTokens> = {}): ScriptLine[] {
  const values = tokens as Record<string, string | undefined>;
  return body.split("\n").map((line) => {
    const pieces: ScriptPiece[] = [];
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
      if (m.index > last) pieces.push({ text: line.slice(last, m.index) });
      const key = m[1];
      const value = key ? values[key] : undefined;
      pieces.push(value ? { text: value, token: "filled" } : { text: key ?? m[0], token: "open" });
      last = m.index + m[0].length;
    }
    if (last < line.length) pieces.push({ text: line.slice(last) });
    return { pieces, direction: DIRECTION.test(line.trim()) };
  });
}

/* ----------------------------------------------------------------- phones */

export const phoneDigits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");

/** International number for wa.me: US numbers get the 1 prefix. */
export function waNumber(p: string | null | undefined) {
  const d = phoneDigits(p);
  return d.length === 10 ? `1${d}` : d;
}
