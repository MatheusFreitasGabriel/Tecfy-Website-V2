/**
 * Leitura da planilha NO NAVEGADOR (nada é enviado ao servidor nesta etapa).
 * .xlsx = zip de XMLs: lê o diretório central do zip e descompacta com `DecompressionStream`
 * (nativo do navegador), sem biblioteca. Também aceita .csv (";" ou ",", com ou sem BOM).
 */

export class SheetError extends Error {}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Arquivos do zip pedidos por nome → conteúdo em texto. */
async function unzipText(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new SheetError("O arquivo não é uma planilha .xlsx válida.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new SheetError("Planilha corrompida.");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (wanted(name)) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      out.set(name, decoder.decode(method === 8 ? await inflateRaw(raw) : raw));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xmlText = (s: string) =>
  s
    .replace(/<rPh[\s\S]*?<\/rPh>/g, "") // guia fonético (planilhas em japonês) não é texto
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Primeira aba do .xlsx → matriz de textos. */
async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzipText(buffer, (n) => n === "xl/sharedStrings.xml" || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n.startsWith("xl/worksheets/sheet"));
  // Primeira aba pela ordem do workbook (não necessariamente sheet1.xml).
  const firstRid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(files.get("xl/workbook.xml") ?? "")?.[1];
  const target = firstRid ? new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`).exec(files.get("xl/_rels/workbook.xml.rels") ?? "")?.[1] : null;
  const sheetPath = target ? `xl/${target.replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml";
  const sheet = files.get(sheetPath) ?? files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new SheetError("Não encontrei nenhuma aba na planilha.");

  const shared = (files.get("xl/sharedStrings.xml")?.match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    (si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? []).map(xmlText).join(""),
  );

  const rows: string[][] = [];
  for (const row of sheet.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    const rowNumber = Number(/\br="(\d+)"/.exec(row)?.[1] ?? rows.length + 1);
    const cells: string[] = [];
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1];
      const index = ref ? colIndex(ref) : cells.length;
      const type = /\bt="(\w+)"/.exec(c)?.[1];
      let value = "";
      if (type === "inlineStr") value = (c.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? []).map(xmlText).join("");
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : xmlText(v);
      }
      cells[index] = value.trim();
    }
    rows[rowNumber - 1] = Array.from(cells, (v) => v ?? "");
  }
  return Array.from(rows, (r) => r ?? []);
}

/** CSV com aspas, quebras dentro de aspas, separador ";" ou "," (detectado no cabeçalho). */
function readCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  // Apóstrofo que o export põe para não virar fórmula.
  return rows.map((r) => r.map((c) => (/^'[=+\-@]/.test(c) ? c.slice(1) : c)));
}

/** Lê .xlsx ou .csv → matriz de textos (linha 0 = cabeçalho). */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return readCsv(await file.text());
  if (name.endsWith(".xlsx")) return readXlsx(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new SheetError("Formato .xls antigo não é suportado. Salve como .xlsx ou .csv.");
  throw new SheetError("Envie uma planilha .xlsx ou .csv.");
}
