import { readJob } from "../../../../../server/catalog-service.ts";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const job = await readJob((await params).id);
    return Response.json(job ? { job, synthetic: true } : { code: "NOT_FOUND" },
      { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ code: "CATALOG_UNAVAILABLE" }, { status: 503 });
  }
}
