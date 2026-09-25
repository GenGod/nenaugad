import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { readConfig } from "../../../../server/config.ts";
import {
  saveCvUpload, listCvUploads,
} from "../../../../server/cv/service.ts";
import {
  parsePlainText, parseUploadedFile, CvParseError, MAX_FILE_BYTES,
} from "../../../../server/cv/parse.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

const FRIENDLY_ERRORS: Readonly<Record<string, string>> = {
  EMPTY_TEXT: "Текст пустой.",
  EMPTY_FILE: "Файл пустой.",
  EXCEEDS_FILE_SIZE: `Файл больше ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} МБ.`,
  EXCEEDS_CHARACTER_LIMIT: "В извлечённом тексте больше 150 000 символов — сократите текст или вставьте его частями.",
  PDF_NOT_SUPPORTED: "PDF пока не поддерживается: вставьте текст резюме вручную (скан без текстового слоя всё равно потребовал бы ручной проверки).",
  UNSUPPORTED_ZIP: "ZIP-архивы не поддерживаются — нужен именно .docx.",
  INVALID_DOCX: "Файл не похож на корректный .docx.",
  DOCX_ENCRYPTED: "Зашифрованный документ нельзя обработать офлайн — вставьте текст вручную.",
  DOCX_TOO_MANY_ENTRIES: "Слишком сложная структура .docx (предел числа записей).",
  DOCX_UNSUPPORTED_COMPRESSION: "Неожиданное сжатие внутри .docx.",
  DOCX_UNCOMPRESSED_LIMIT: "Документ распаковывается слишком большой — предел защиты.",
  NOT_UTF8_TEXT: "Файл не является текстом в UTF-8.",
};

function parseFailure(error: unknown): NextResponse | null {
  if (error instanceof CvParseError) {
    return NextResponse.json(
      { error: error.message, message: FRIENDLY_ERRORS[error.message] ?? "Не удалось разобрать файл." },
      { status: error.message === "EXCEEDS_FILE_SIZE" ? 413 : 400 },
    );
  }
  return null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const uploads = await listCvUploads(snapshotPool(), user.id);
  return NextResponse.json({ items: uploads });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!readConfig(process.env).uploads) {
    return NextResponse.json({ error: "UPLOADS_DISABLED" }, { status: 503 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | { text?: unknown; filename?: unknown } | null;
      if (!body || typeof body.text !== "string") {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      const filename = typeof body.filename === "string" && body.filename.length <= 200
        ? body.filename : "вставленный текст";
      const kind = filename.toLowerCase().endsWith(".md") ? "md" : "txt";
      const result = parsePlainText(body.text, kind);
      const id = await saveCvUpload({
        pool: snapshotPool(), userId: user.id,
        filename, sizeBytes: Buffer.byteLength(body.text, "utf8"), result,
      });
      return NextResponse.json({
        id, kind: result.kind, characterCount: result.text.length, warnings: result.warnings,
      }, { status: 201 });
    }
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = parseUploadedFile(file.name || "upload", buffer);
      const id = await saveCvUpload({
        pool: snapshotPool(), userId: user.id,
        filename: file.name || "upload", sizeBytes: buffer.length, result,
      });
      return NextResponse.json({
        id, kind: result.kind, characterCount: result.text.length, warnings: result.warnings,
      }, { status: 201 });
    }
    return NextResponse.json({ error: "UNSUPPORTED_CONTENT_TYPE" }, { status: 400 });
  } catch (error) {
    const failure = parseFailure(error);
    if (failure) return failure;
    console.error(JSON.stringify({ code: "CV_INTAKE_FAILED" }));
    return NextResponse.json({ error: "CV_INTAKE_FAILED" }, { status: 500 });
  }
}
