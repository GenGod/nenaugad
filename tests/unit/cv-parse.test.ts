import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  parsePlainText, parseDocx, parseUploadedFile, CvParseError,
  MAX_FILE_BYTES, MAX_EXTRACTED_CHARS,
} from "../../src/server/cv/parse.ts";

// Minimal ZIP writer for fixtures: stored (method 0) or deflated (method 8)
// entries; the reader ignores CRC, so tests can build archives cheaply.
type ZipFixture = {
  name: string; data: Buffer; method?: 0 | 8;
  flagEncrypted?: boolean; lieUncompressed?: number; honestUncompressed?: number;
};

function buildZip(files: ZipFixture[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "latin1");
    const method = file.method ?? 0;
    const claimed = file.lieUncompressed ?? file.honestUncompressed ?? file.data.length;
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(file.flagEncrypted ? 1 : 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(claimed, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, file.data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.flagEncrypted ? 1 : 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(claimed, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const DOCUMENT_XML = Buffer.from(
  "<w:document xmlns:w=\"urn:x\"><w:body>" +
  "<w:p><w:r><w:t>Инженер-платформ с опытом распределённых систем</w:t></w:r></w:p>" +
  "<w:p><w:r><w:t>React &amp; Node.js, 5 лет; PostgreSQL, очереди, наблюдаемость</w:t></w:r></w:p>" +
  "<w:p><w:r><w:t>Участвовал в он-кал ротации, менторил двух джунов</w:t></w:r></w:p>" +
  "<w:p><w:r><w:t>Полностью удалённо, часовой пояс Europe/Berlin</w:t></w:r></w:p>" +
  "</w:body></w:document>",
  "utf8",
);
const DOCUMENT_TEXT = "Инженер-платформ с опытом распределённых систем\n" +
  "React & Node.js, 5 лет; PostgreSQL, очереди, наблюдаемость\n" +
  "Участвовал в он-кал ротации, менторил двух джунов\n" +
  "Полностью удалённо, часовой пояс Europe/Berlin";

function docx(files: ZipFixture[]): Buffer {
  return buildZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "word/document.xml", data: deflateRawSync(DOCUMENT_XML), method: 8,
      honestUncompressed: DOCUMENT_XML.length },
    ...files,
  ]);
}

test("plain text: normalization, kind, limits", () => {
  const result = parsePlainText("  Инженер\r\nReact  \n\n", "txt");
  assert.equal(result.kind, "txt");
  assert.equal(result.text, "Инженер\nReact");
  assert.equal(parsePlainText("заголовок", "md").kind, "md");
  assert.throws(() => parsePlainText("   ", "txt"), (error: unknown) =>
    error instanceof CvParseError && error.message === "EMPTY_TEXT");
  assert.throws(() => parsePlainText("а".repeat(MAX_EXTRACTED_CHARS + 1), "txt"), (error: unknown) =>
    error instanceof CvParseError && error.message === "EXCEEDS_CHARACTER_LIMIT");
});

test("docx: paragraphs and entities extracted from a deflated document.xml", () => {
  const result = parseDocx(docx([]));
  assert.equal(result.kind, "docx");
  assert.equal(result.text, DOCUMENT_TEXT);
  assert.deepEqual(result.warnings, []);
});

test("docx: signature, structure and encryption guards", () => {
  assert.throws(() => parseDocx(Buffer.from("not a zip")), (error: unknown) =>
    error instanceof CvParseError && error.message === "INVALID_DOCX");
  assert.throws(() => parseDocx(buildZip([{ name: "other.xml", data: Buffer.from("<x/>") }])),
    (error: unknown) => error instanceof CvParseError && error.message === "INVALID_DOCX");
  assert.throws(() => parseDocx(docx([
    { name: "word/secret.bin", data: Buffer.from("x"), flagEncrypted: true },
  ])), (error: unknown) => error instanceof CvParseError && error.message === "DOCX_ENCRYPTED");
  const tooMany: ZipFixture[] = Array.from({ length: 201 }, (_, index) => ({
    name: `f${index}`, data: Buffer.from("x"),
  }));
  assert.throws(() => parseDocx(buildZip(tooMany)), (error: unknown) =>
    error instanceof CvParseError && error.message === "DOCX_TOO_MANY_ENTRIES");
});

test("docx: decompression bombs die at the output cap, not in memory", () => {
  // Honest 25 MB claim of zeros: capped by the 20 MB budget.
  const bomb = deflateRawSync(Buffer.alloc(25 * 1024 * 1024));
  assert.throws(() => parseDocx(buildZip([
    { name: "word/document.xml", data: bomb, method: 8, honestUncompressed: 25 * 1024 * 1024 },
  ])), (error: unknown) => error instanceof CvParseError && error.message === "DOCX_UNCOMPRESSED_LIMIT");
  // Lying small claim: inflate itself exceeds maxOutputLength.
  const bomb2 = deflateRawSync(Buffer.alloc(1024 * 1024));
  assert.throws(() => parseDocx(buildZip([
    { name: "word/document.xml", data: bomb2, method: 8, lieUncompressed: 1024 },
  ])), (error: unknown) => error instanceof CvParseError && error.message === "DOCX_UNCOMPRESSED_LIMIT");
});

test("upload routing: signatures over extensions; PDF rejected with the text path", () => {
  assert.throws(() => parseUploadedFile("cv.pdf", Buffer.from("%PDF-1.7 fake")), (error: unknown) =>
    error instanceof CvParseError && error.message === "PDF_NOT_SUPPORTED");
  // A .docx-named file that is not a zip fails the signature check.
  assert.throws(() => parseUploadedFile("cv.docx", Buffer.from("просто текст")), (error: unknown) =>
    error instanceof CvParseError && error.message === "INVALID_DOCX");
  // A real docx keeps its kind regardless of the file name (signature wins).
  const parsed = parseUploadedFile("cv.txt", docx([]));
  assert.equal(parsed.kind, "docx");
  // Plain UTF-8 text passes; non-UTF-8 binaries fail closed.
  assert.equal(parseUploadedFile("cv.txt", Buffer.from("резюме текст", "utf8")).kind, "txt");
  assert.equal(parseUploadedFile("notes.md", Buffer.from("# заголовок", "utf8")).kind, "md");
  assert.throws(() => parseUploadedFile("cv.jpg",
    Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0xff, 0xdb, 0x00, 0x00])), (error: unknown) =>
    error instanceof CvParseError && error.message === "NOT_UTF8_TEXT");
  // Oversize is rejected before any parsing work.
  assert.throws(() => parseUploadedFile("big.txt", Buffer.alloc(MAX_FILE_BYTES + 1)), (error: unknown) =>
    error instanceof CvParseError && error.message === "EXCEEDS_FILE_SIZE");
});
