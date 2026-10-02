// One gate for the whole CV surface. S3-001 acceptance 5 defines UPLOADS_ENABLED
// as a local kill switch: "default false = routes disabled, 503". Read and
// delete used to check nothing, so a disabled feature kept serving and removing
// stored documents (docs/OPEN_GAPS.md B22).
import { readConfig } from "../config.ts";

/** Null when uploads are enabled; a 503 response otherwise. */
export function uploadsDisabledResponse(
  env: Record<string, string | undefined> = process.env,
): Response | null {
  if (readConfig(env).uploads) return null;
  return Response.json({ error: "UPLOADS_DISABLED" }, { status: 503 });
}
