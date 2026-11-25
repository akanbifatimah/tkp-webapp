import { IMPORT_FIELDS, type ImportJob, type ImportKind } from "./import-types";

/**
 * Files the import screens hand out: the templates, and the error file of the
 * rows that did not go in. Cells that start with = + - @ are prefixed with '
 * so a spreadsheet never runs them as formulas (PRD EV-31).
 */

const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const csvCell = (v: string) => {
  const s = safe(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: string[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The TKP Hub standard layout (adopted by TKP, 2026-11-25, as the format for
 * the old follow-up tracker's export and any past guest list): these column
 * names, one fictional example row under them. Every column matches on upload.
 */
const EXAMPLE: Record<ImportKind, Record<string, string>> = {
  guests: {
    serviceDate: "3/2/2025",
    serviceType: "Sunday 1st Service",
    firstName: "Jane",
    lastName: "Example",
    phone: "(281) 555-0100",
    email: "jane.example@example.com",
    gender: "Female",
    ageBracket: "26-30",
    city: "Katy",
    state: "TX",
    zip: "77494",
    country: "United States",
    howHeard: "Invited By Someone",
    willComeAgain: "Yes",
    likeToBecomeMember: "Undecided",
    "rating.Music": "9",
  },
  followups: {
    date: "3/4/2025 6:30 PM",
    phone: "(281) 555-0100",
    guestName: "Jane Example",
    team: "Church office",
    caller: "Lydia Fashola",
    method: "Phone Call",
    callOutcome: "Reached",
    wantsMembership: "Yes",
    note: "Thanked us for the welcome.",
  },
};

export function templateCsv(kind: ImportKind) {
  const fields = IMPORT_FIELDS[kind];
  return toCsv([fields.map((f) => f.header ?? f.label), fields.map((f) => EXAMPLE[kind][f.key] ?? "")]);
}

/** The rows that failed, as they were in the file, with what to fix in an extra column. */
export function errorCsv(job: ImportJob) {
  const bad = job.rows.filter((r) => r.status === "error");
  const width = Math.max(job.fileHeaders.length, ...bad.map((r) => r.cells.length));
  const head = [...Array.from({ length: width }, (_, i) => job.fileHeaders[i] || `Column ${i + 1}`), "Row in the file", "What to fix"];
  return toCsv([head, ...bad.map((r) => [...Array.from({ length: width }, (_, i) => r.cells[i] ?? ""), String(r.rowNo), r.errors.map((e) => e.message).join("; ")])]);
}

export const errorFileName = (job: Pick<ImportJob, "fileName">) => `${job.fileName.replace(/\.[^.]+$/, "")} - rows to fix.csv`;

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
