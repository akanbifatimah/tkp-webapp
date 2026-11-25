import readExcelFile from "read-excel-file/universal";

/**
 * Reading an uploaded file for the mock import engine. The real backend does
 * this in a sandboxed background job (PRD 4.4 "Spreadsheet parsing"); the
 * rules are the same: cached cell values only, never a formula, UTF-8 CSV with
 * or without a byte order mark, the delimiter detected, quoted cells allowed.
 */

export type Cell = string | number | boolean | Date | null;
export type RawSheet = { name: string; data: Cell[][] };

/** RFC 4180 CSV: quotes, doubled quotes, line breaks inside quotes; the delimiter is , ; or tab. */
export function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => firstLine.replace(/"[^"]*"/g, "").split(d).length - 1;
  const delim = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0]!;
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (typeof c === "string" ? c.trim() : c))).filter((r) => r.some((c) => c !== "" && c !== null));
}

export const extensionOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

/** Every sheet of a .xlsx, or the one table of a .csv. */
export async function readUpload(name: string, bytes: ArrayBuffer): Promise<RawSheet[]> {
  if (extensionOf(name) === "csv") return [{ name: "CSV", data: parseCsv(new TextDecoder("utf-8").decode(bytes)) }];
  const sheets = await readExcelFile(bytes);
  return sheets.map((s) => ({ name: s.sheet, data: s.data as Cell[][] }));
}
