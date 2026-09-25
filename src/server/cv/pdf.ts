// Offline PDF text-layer extractor (spec 9.1): no dependencies, nothing is
// executed, pure buffer scanning + zlib inflation. Honest degradation: an
// encrypted file, a scan with no text layer or a font map we cannot resolve
// produces a clear error with the manual text path — never silent garbage.
import { inflateSync } from "node:zlib";
import { CvParseError, MAX_EXTRACTED_CHARS, type CvParseResult } from "./parse.ts";

export const PDF_MAX_PAGES = 30;
const PDF_MAX_STREAM_UNCOMPRESSED = 20 * 1024 * 1024;
const PDF_GARBAGE_FRACTION = 0.3;

type StreamBlock = { dictionary: string; data: Buffer };

function collectStreamBlocks(buffer: Buffer): StreamBlock[] {
  const text = buffer.toString("latin1");
  const blocks: StreamBlock[] = [];
  for (const match of text.matchAll(/stream\r?\n/gu)) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end === -1) break;
    const dictionaryStart = Math.max(0, match.index - 2048);
    blocks.push({
      dictionary: text.slice(dictionaryStart, match.index),
      data: buffer.subarray(start, end),
    });
  }
  return blocks;
}

function inflateIfRequested(block: StreamBlock): Buffer | null {
  if (!/\/FlateDecode\b/u.test(block.dictionary)) return null; // images, other filters
  try {
    return inflateSync(block.data, { maxOutputLength: PDF_MAX_STREAM_UNCOMPRESSED });
  } catch {
    return null; // corrupt or truncated stream: skip, quality gates decide later
  }
}

// --- Text-showing operators (Tj, ', ") with PDF string escapes ----------
function decodePdfString(raw: string): string {
  let result = "";
  for (let i = 0; i < raw.length; i += 1) {
    const character = raw[i];
    if (character !== "\\") { result += character; continue; }
    const next = raw[i + 1] ?? "";
    if (next >= "0" && next <= "7") {
      let octal = "";
      let j = i + 1;
      while (j < raw.length && octal.length < 3) {
        const digit = raw[j] ?? "";
        if (digit < "0" || digit > "7") break;
        octal += digit; j += 1;
      }
      result += String.fromCharCode(Number.parseInt(octal, 8));
      i = j - 1;
      continue;
    }
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f",
      "(": "(", ")": ")", "\\": "\\" };
    result += escapes[next] ?? next;
    i += 1;  }
  return result;
}

function textFromContentStream(content: string, cmap: Map<number, string> | null): string {
  const chunks: string[] = [];
  for (const match of content.matchAll(/\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/gu)) {
    chunks.push(mapString(decodePdfString(match[1] ?? ""), cmap));
  }
  for (const match of content.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ/gu)) {
    let line = "";
    for (const part of (match[1] ?? "").matchAll(/\(((?:\\.|[^\\()])*)\)/gu)) {
      line += mapString(decodePdfString(part[1] ?? ""), cmap);
    }
    chunks.push(line);
  }
  return chunks.join("\n");
}

function mapString(text: string, cmap: Map<number, string> | null): string {
  if (cmap === null) return text;
  if (/^[\x20-\x7E\u00A0-\u024F\n\t]*$/u.test(text)) return text; // printable as-is
  // Subset fonts address glyphs with 2-byte codes: map pairwise.
  let out = "";
  let garbage = 0;
  const pairs = Math.ceil(text.length / 2);
  for (let i = 0; i < pairs * 2; i += 2) {
    const hi = text.charCodeAt(i);
    const lo = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    const mapped = cmap.get(hi * 256 + lo);
    if (mapped !== undefined) out += mapped;
    else { out += "\uFFFD"; garbage += 1; }
  }
  if (out.length > 0 && garbage / out.length > PDF_GARBAGE_FRACTION) return "";
  return out;
}

// --- ToUnicode CMaps (merged 2-byte view across the file) ----------------
function hexToCode(hex: string): number {
  return Number.parseInt(hex.replace(/\s+/gu, ""), 16);
}

function unicodeFromHex(hex: string): string {
  const clean = hex.replace(/\s+/gu, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 4) {
    out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 4).padStart(4, "0"), 16));
  }
  return out;
}

function cmapFromStream(content: string): Map<number, string> | null {
  const map = new Map<number, string>();
  for (const block of content.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const pair of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/gu)) {
      map.set(hexToCode(pair[1]!), unicodeFromHex(pair[2]!));
    }
  }
  for (const block of content.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    for (const range of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/gu)) {
      const from = hexToCode(range[1]!);
      const to = hexToCode(range[2]!);
      let base = Number.parseInt(range[3]!.replace(/\s+/gu, "").padStart(4, "0"), 16);
      if (to > from && to - from < 65536) {
        for (let code = from; code <= to; code += 1) {
          map.set(code, String.fromCharCode(base));
          base += 1;
        }
      }
    }
  }
  return map.size > 0 ? map : null;
}

export function parsePdf(buffer: Buffer): CvParseResult {
  const raw = buffer.toString("latin1");
  if (/\/Encrypt\b/u.test(raw)) throw new CvParseError("PDF_ENCRYPTED");
  const pageCount = (raw.match(/\/Type\s*\/Page(?![sA-Za-z])/gu) ?? []).length;
  if (pageCount > PDF_MAX_PAGES) throw new CvParseError("PDF_TOO_MANY_PAGES");

  const blocks = collectStreamBlocks(buffer);
  let cmap: Map<number, string> | null = null;
  const decoded: string[] = [];
  for (const block of blocks) {
    const inflated = inflateIfRequested(block);
    if (inflated === null) continue;
    const content = inflated.toString("latin1");
    // ToUnicode CMaps are streams too; detect by content, not by position.
    const asCmap = cmapFromStream(content);
    if (asCmap !== null) {
      cmap = cmap === null ? asCmap : new Map([...cmap, ...asCmap]);
      continue;
    }
    if (/\b(?:Tj|TJ)\b/u.test(content)) decoded.push(content);
  }

  let text = "";
  for (const content of decoded) {
    text += `${textFromContentStream(content, cmap)}\n`;
    if (text.length > MAX_EXTRACTED_CHARS) throw new CvParseError("EXCEEDS_CHARACTER_LIMIT");
  }
  if (text.trim().length === 0) {
    // No text operators at all: a scan or an image-only document.
    throw new CvParseError("PDF_NO_TEXT_LAYER");
  }
  const warnings: string[] = [];
  if (text.trim().length < 200) warnings.push("THIN_TEXT_LAYER");
  return {
    kind: "txt",
    text: text.replace(/\r\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim(),
    warnings,
  };
}
