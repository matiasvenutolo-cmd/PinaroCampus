/**
 * CSV para Excel en español (separador `;`, UTF-8 con BOM). Los valores que
 * empiezan con `=`, `+`, `-`, `@` o tab se prefijan con `'` para que una hoja
 * de cálculo no los ejecute como fórmula (el nombre de un alumno lo escribe
 * cualquiera).
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
