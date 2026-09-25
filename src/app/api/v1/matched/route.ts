import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { matchedForUser } from "../../../../server/matching-service.ts";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const result = await matchedForUser(user.id);
  if (result.status === "no_profile") {
    return NextResponse.json({ error: "NO_PROFILE" }, { status: 409 });
  }
  if (result.status === "fixture_backend") {
    return NextResponse.json({
      status: "fixture_backend", rulesetVersion: result.rulesetVersion,
      eligible: [], needsReview: [], notEvaluatedCount: 0,
    });
  }
  return NextResponse.json({
    status: "ok", rulesetVersion: result.rulesetVersion,
    eligible: result.eligible.map(item => ({ id: item.card.id, title: item.card.title,
      company: item.card.company, status: item.evaluation.status, rules: item.evaluation.rules })),
    needsReview: result.needsReview.map(item => ({ id: item.card.id, title: item.card.title,
      company: item.card.company, status: item.evaluation.status, rules: item.evaluation.rules })),
    notEvaluatedCount: result.notEvaluatedCount,
  });
}
