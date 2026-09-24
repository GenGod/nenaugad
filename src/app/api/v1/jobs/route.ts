import { parseCatalogQuery, InvalidQueryError } from "../../../../domain/job.ts";
import { readCatalog } from "../../../../server/catalog-service.ts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = parseCatalogQuery(new URL(request.url).searchParams);
    const result = await readCatalog(query);
    return Response.json({ ...result, synthetic: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const badInput = error instanceof InvalidQueryError;
    return Response.json({ code: badInput ? "INVALID_QUERY" : "CATALOG_UNAVAILABLE" },
      { status: badInput ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
