import { readConfig } from "../../../server/config.ts";
export const dynamic = "force-dynamic";
export async function GET() {
  const config = readConfig(process.env);
  return Response.json({
    status: "alive", environment: config.environment,
    data: config.backend, realAi: config.liveAi, uploads: config.uploads, auth: "not_implemented",
    note: "Liveness only; not a database or production readiness check."
  }, { headers: { "Cache-Control": "no-store" } });
}
