import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { parsePdf, PDF_MAX_PAGES } from "../../src/server/cv/pdf.ts";
import { parseUploadedFile, CvParseError } from "../../src/server/cv/parse.ts";

// Minimal PDF fixture builder: the extractor scans raw objects, so a valid
// xref table is unnecessary — object soup with real stream syntax suffices.
function contentStream(ops: string): string {
  return `<< /Length ${deflateSync(Buffer.from(ops, "latin1")).length} /Filter /FlateDecode >>\nstream\n` +
    deflateSync(Buffer.from(ops, "latin1")).toString("latin1") + "\nendstream\n";
}
function pageMarker(): string {
  return "<< /Type /Page /Parent 2 0 R >>";
}
function buildPdf(parts: string[]): Buffer {
  return Buffer.from(`%PDF-1.7\n${parts.join("\n")}\n%%EOF`, "latin1");
}

test("pdf: ASCII text layer from Tj/TJ with escapes", () => {
  const pdf = buildPdf([
    pageMarker(),
    contentStream("BT /F1 12 Tf 72 720 Td (Platform Engineer with React) Tj T* (Node.js \\& PostgreSQL, 5 years) Tj T* [(Kerned)-250(text)] TJ ET"),
  ]);
  const result = parsePdf(pdf);
  assert.equal(result.text.includes("Platform Engineer with React"), true);
  assert.equal(result.text.includes("Node.js & PostgreSQL, 5 years"), true);
  assert.equal(result.text.includes("Kernedtext"), true);
  assert.equal(result.warnings.includes("THIN_TEXT_LAYER"), true);
});

test("pdf: Cyrillic via a 2-byte ToUnicode CMap", () => {
  // Codes 0x0001.. map to Cyrillic letters; the content stream uses raw
  // 2-byte codes inside Tj strings (as subset fonts do).
  const letters = "Инженер-платформ с опытом распределённых систем и командой";
  const cmapEntries: string[] = [];
  const encoding = new Map<number, number>();
  for (let i = 0; i < letters.length; i += 1) {
    const code = 0x0100 + i;
    cmapEntries.push(`<${code.toString(16).padStart(4, "0")}> <${letters.charCodeAt(i).toString(16).padStart(4, "0")}>`);
    encoding.set(i, code);
  }
  const cmapStream = `/CIDInit /ProcSet findresource begin\nbeginbfchar\n${cmapEntries.join("\n")}\nendbfchar\nend\n`;
  let ops = "BT ";
  for (let i = 0; i < letters.length; i += 1) {
    const code = encoding.get(i) ?? 0x0100;
    ops += `(${String.fromCharCode(Math.floor(code / 256), code % 256)}) Tj `;
  }
  ops += "ET";
  const pdf = buildPdf([
    pageMarker(),
    contentStream(cmapStream),
    contentStream(ops),
  ]);
  const result = parsePdf(pdf);
  // Newlines between chunks are expected; every mapped letter must appear.
  for (const letter of new Set(letters.split(""))) {
    if (letter !== " ") assert.equal(result.text.includes(letter), true, letter);
  }
});

test("pdf: guards — encrypted, too many pages, no text layer", () => {
  const encrypted = buildPdf(["<< /Encrypt 5 0 R >>", contentStream("BT (x) Tj ET")]);
  assert.throws(() => parsePdf(encrypted), (error: unknown) =>
    error instanceof CvParseError && error.message === "PDF_ENCRYPTED");

  const pages = Array.from({ length: PDF_MAX_PAGES + 1 }, pageMarker);
  const tooMany = buildPdf([...pages, contentStream("BT (x) Tj ET")]);
  assert.throws(() => parsePdf(tooMany), (error: unknown) =>
    error instanceof CvParseError && error.message === "PDF_TOO_MANY_PAGES");

  const scanOnly = buildPdf([pageMarker(), "<< /Subtype /Image /Filter /DCTDecode >>\nstream\nbinaryimagedata\nendstream"]);
  assert.throws(() => parsePdf(scanOnly), (error: unknown) =>
    error instanceof CvParseError && error.message === "PDF_NO_TEXT_LAYER");
});

test("pdf: routing and an inflate bomb die at the caps", () => {
  const pdf = buildPdf([pageMarker(), contentStream("BT (Platform Engineer React Node PostgreSQL Docker Kubernetes — long enough text) Tj ET")]);
  const viaUpload = parseUploadedFile("cv.pdf", pdf);
  assert.equal(viaUpload.kind, "txt");

  const bomb = deflateSync(Buffer.alloc(30 * 1024 * 1024)); // 30 MB of zeros
  const bombPdf = buildPdf([pageMarker(), contentStream("BT (short real text) Tj ET"),
    `<< /Length ${bomb.length} /Filter /FlateDecode >>\nstream\n${bomb.toString("latin1")}\nendstream`]);
  const streamSkipped = parsePdf(bombPdf);
  assert.equal(streamSkipped.text.includes("short real text"), true);
  assert.equal(streamSkipped.warnings.includes("THIN_TEXT_LAYER"), true); // bomb stream skipped harmlessly

  const richPdf = parsePdf(buildPdf([pageMarker(),
    contentStream(`BT (${("long text ".repeat(4000))}) Tj ET`)]));
  assert.equal(richPdf.text.length > 200, true);
  assert.deepEqual(richPdf.warnings, []);
});
