// Offline CV intake parsers (spec 9.1): no network, no execution, no third
// party dependencies — node:zlib only. Formats: plain text (.txt/.md/paste)
// and .docx (ZIP + word/document.xml). PDF is deliberately rejected for now
// with a text-form suggestion; encrypted/oversized inputs fail closed.
import { inflateRawSync } from "node:zlib";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 150_000;
export const DOCX_MAX_ENTRIES = 200;
export const DOCX_MAX_TOTAL_UNCOMPRESSED = 20 * 1024 * 1024;

export type CvKind = "txt" | "md" | "docx";

export class CvParseError extends Error {
  constructor(code: string) { super(code); }
}

export type CvParseResult = Readonly<{
  kind: CvKind;
  text: string;
  warnings: readonly string[];
}>;

const WARNING_CODES: ReadonlySet<string> = new Set([
  "THIN_TEXT_LAYER", "MANY_PAGES", "UNUSUAL_CHARACTERS",
]);

function finalize(kind: CvKind, rawText: string, warnings: string[] = []): CvParseResult {
  const text = rawText.replace(/\r\n/gu, "\n").trim();
  if (text.length === 0) throw new CvParseError("EMPTY_TEXT");
  if (text.length > MAX_EXTRACTED_CHARS) throw new CvParseError("EXCEEDS_CHARACTER_LIMIT");
  // A scan-like or glyph-less document usually yields very short output.
  if (kind === "docx" && text.length < 200) warnings.push("THIN_TEXT_LAYER");
  const nonAscii = text.replace(/[\x20-\x7E\n\tа-яА-ЯёЁ]+/gu, "");
  if (nonAscii.length / text.length > 0.1) warnings.push("UNUSUAL_CHARACTERS");
  return { kind, text, warnings: warnings.filter(code => WARNING_CODES.has(code)) };
}

export function parsePlainText(input: string, kind: CvKind): CvParseResult {
  if (typeof input !== "string" || input.length === 0) throw new CvParseError("EMPTY_TEXT");
  return finalize(kind, input);
}

// --- Minimal ZIP reader (central-directory based) -------------------------
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const FLAG_ENCRYPTED = 0x0001;

type ZipEntry = Readonly<{
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}>;

function readZipEntries(buffer: Buffer): ZipEntry[] {
  // Locate the End Of Central Directory record from the tail.
  const minimumEocd = 22;
  if (buffer.length < minimumEocd) throw new CvParseError("INVALID_DOCX");
  let eocd = -1;
  const scanStart = Math.max(0, buffer.length - minimumEocd - 65_536);
  for (let i = buffer.length - minimumEocd; i >= scanStart; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd === -1) throw new CvParseError("INVALID_DOCX");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  if (entryCount > DOCX_MAX_ENTRIES) throw new CvParseError("DOCX_TOO_MANY_ENTRIES");
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_ENTRY_SIGNATURE) {
      throw new CvParseError("INVALID_DOCX");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    if ((flags & FLAG_ENCRYPTED) !== 0) throw new CvParseError("DOCX_ENCRYPTED");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("latin1");
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateEntry(buffer: Buffer, entry: ZipEntry, budget: { remaining: number }): Buffer {
  const localNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed; // stored
  if (entry.method !== 8) throw new CvParseError("DOCX_UNSUPPORTED_COMPRESSION");
  // maxOutputLength caps decompression: a zip bomb dies here, not in memory.
  const limit = Math.min(entry.uncompressedSize, budget.remaining);
  if (limit <= 0) throw new CvParseError("DOCX_UNCOMPRESSED_LIMIT");
  try {
    return inflateRawSync(compressed, { maxOutputLength: limit });
  } catch {
    throw new CvParseError("DOCX_UNCOMPRESSED_LIMIT");
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, "&");
}

function textFromDocumentXml(xml: string): string {
  // Text runs are <w:t>…</w:t>; paragraphs <w:p> become newlines. Nothing is
  // executed or resolved — pure string scanning of the XML body.
  const paragraphs = xml.split(/<w:p[ >]/u);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const runs = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
      .map(match => decodeXmlEntities(match[1] ?? ""));
    lines.push(runs.join(""));
  }
  return lines.join("\n");
}

export function parseDocx(buffer: Buffer): CvParseResult {
  if (buffer.length < 4 || buffer.readUInt32BE(0) !== 0x504b0304) {
    throw new CvParseError("INVALID_DOCX"); // signature check, not the extension
  }
  const entries = readZipEntries(buffer);
  const budget = { remaining: DOCX_MAX_TOTAL_UNCOMPRESSED };
  const documentEntry = entries.find(entry => entry.name === "word/document.xml");
  if (!documentEntry) throw new CvParseError("INVALID_DOCX");
  const used = Math.min(documentEntry.uncompressedSize, budget.remaining);
  budget.remaining -= used;
  const documentXml = inflateEntry(buffer, documentEntry, { remaining: used }).toString("utf8");
  return finalize("docx", textFromDocumentXml(documentXml));
}

// Route an uploaded file by signature (PK for docx/zip) — the extension is
// only a hint. PDF and everything else fail closed with the text-form path.
export function parseUploadedFile(filename: string, buffer: Buffer): CvParseResult {
  if (buffer.length === 0) throw new CvParseError("EMPTY_FILE");
  if (buffer.length > MAX_FILE_BYTES) throw new CvParseError("EXCEEDS_FILE_SIZE");
  const isZip = buffer.length >= 4 && buffer.readUInt32BE(0) === 0x504b0304;
  const isPdf = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) throw new CvParseError("PDF_NOT_SUPPORTED");
  // Signature wins over the file name: any ZIP container is routed to the
  // docx parser, which rejects archives without word/document.xml.
  if (isZip) return parseDocx(buffer);
  // A .docx name without a ZIP signature is not a docx.
  if (filename.toLowerCase().endsWith(".docx")) throw new CvParseError("INVALID_DOCX");
  // Treat everything decodable as UTF-8 as plain text; .md keeps its kind.
  const kind: CvKind = filename.toLowerCase().endsWith(".md") ? "md" : "txt";
  const decoded = buffer.toString("utf8");
  if (buffer.equals(Buffer.from(decoded, "utf8")) !== true) {
    throw new CvParseError("NOT_UTF8_TEXT");
  }
  return finalize(kind, decoded);
}
