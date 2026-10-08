import { isValidCuit, normalizeCuit } from "@/lib/cuit";

// Importación del padrón de empresas (docs/01: "CSV: CUIT, razón social,
// nombre de fantasía, socio sí/no, dominios de email opcionales"). Puro y sin
// base de datos: se usa para la vista previa y de nuevo, del lado del
// servidor, al confirmar (el cliente nunca decide qué filas entran).

export const MAX_ROSTER_ROWS = 5000;
export const MAX_ROSTER_BYTES = 1_000_000;

export interface RosterRow {
  line: number;
  cuit: string;
  legalName: string;
  tradeName: string | null;
  isMember: boolean;
  emailDomains: string[];
}

export interface RosterError {
  line: number;
  message: string;
}

export interface RosterParse {
  rows: RosterRow[];
  errors: RosterError[];
  /** Filas de datos leídas (válidas + con error). */
  total: number;
  /** Error que impide importar todo el archivo (columnas, tamaño). */
  fatal: string | null;
}

const normalizeHeader = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADERS: Record<"cuit" | "legalName" | "tradeName" | "member" | "domains", string[]> = {
  cuit: ["cuit", "cuil", "cuit cuil"],
  legalName: ["razon social", "razon", "empresa", "nombre", "denominacion"],
  tradeName: ["nombre de fantasia", "fantasia", "nombre fantasia", "nombre comercial"],
  member: ["socio", "es socio", "socia", "es socia", "socio si no"],
  domains: ["dominios", "dominios de email", "dominios email", "dominio", "email domains", "dominios de correo"],
};

/** Parte el texto en filas de celdas, respetando comillas y detectando `;`, `,` o tab. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 };
  for (const char of firstLine) if (char in counts) counts[char as keyof typeof counts]++;
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseBoolean(value: string): boolean | null {
  const v = normalizeHeader(value);
  if (["si", "s", "1", "true", "x", "socio", "socia", "yes", "y"].includes(v)) return true;
  if (["no", "n", "0", "false", "", "no socio", "no socia"].includes(v)) return false;
  return null;
}

function parseDomains(value: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  for (const part of value.split(/[\s,;|]+/)) {
    const domain = part.trim().toLowerCase().replace(/^@/, "");
    if (!domain) continue;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) invalid.push(part.trim());
    else if (!domains.includes(domain)) domains.push(domain);
  }
  return { domains, invalid };
}

export function parseRosterCsv(text: string): RosterParse {
  const empty = (fatal: string): RosterParse => ({ rows: [], errors: [], total: 0, fatal });
  if (new TextEncoder().encode(text).length > MAX_ROSTER_BYTES) return empty("El archivo supera 1 MB.");

  const table = parseCsv(text);
  if (table.length === 0) return empty("El archivo está vacío.");

  const header = table[0].map(normalizeHeader);
  const index = (key: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[key].includes(h));
  const col = {
    cuit: index("cuit"),
    legalName: index("legalName"),
    tradeName: index("tradeName"),
    member: index("member"),
    domains: index("domains"),
  };
  if (col.cuit === -1 || col.legalName === -1) {
    return empty("La primera fila tiene que tener, al menos, las columnas «CUIT» y «Razón social».");
  }
  const dataRows = table.slice(1);
  if (dataRows.length === 0) return empty("El archivo no tiene filas de datos.");
  if (dataRows.length > MAX_ROSTER_ROWS) return empty(`El archivo tiene más de ${MAX_ROSTER_ROWS} filas: dividilo en partes.`);

  const rows: RosterRow[] = [];
  const errors: RosterError[] = [];
  const seen = new Map<string, number>();

  dataRows.forEach((cells, i) => {
    const line = i + 2; // 1 = encabezado
    const cell = (c: number) => (c === -1 ? "" : (cells[c] ?? "").trim());
    const problems: string[] = [];

    const cuit = normalizeCuit(cell(col.cuit));
    if (!isValidCuit(cuit)) problems.push("CUIT inválido");
    else if (seen.has(cuit)) problems.push(`CUIT repetido (ya figura en la línea ${seen.get(cuit)})`);

    const legalName = cell(col.legalName);
    if (!legalName) problems.push("falta la razón social");
    else if (legalName.length > 200) problems.push("razón social demasiado larga");

    const tradeName = cell(col.tradeName);
    if (tradeName.length > 200) problems.push("nombre de fantasía demasiado largo");

    const member = parseBoolean(cell(col.member));
    if (member === null) problems.push("«socio» tiene que ser sí o no");

    const { domains, invalid } = parseDomains(cell(col.domains));
    if (invalid.length > 0) problems.push(`dominio inválido: ${invalid.join(", ")}`);

    if (problems.length > 0) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }
    seen.set(cuit, line);
    rows.push({ line, cuit, legalName, tradeName: tradeName || null, isMember: member === true, emailDomains: domains });
  });

  return { rows, errors, total: dataRows.length, fatal: null };
}
