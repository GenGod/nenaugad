import { NextResponse } from "next/server";
import { currentUser } from "../../../../../../server/auth.ts";
import {
  getLetterDetail, saveGeneratedRevision,
} from "../../../../../../server/letters/service.ts";
import {
  executeGuardedOperation,
} from "../../../../../../server/ai/gateway.ts";
import { letterGenerationFailure } from "../../../../../../server/letters/generation-failure.ts";
import { openAiTransport } from "../../../../../../server/ai/openai-transport.ts";
import { GPT6_LUNA, reservationFor, worstCaseCostMicroUsd } from "../../../../../../server/ai/provider.ts";
import { snapshotPool, readSnapshotCardsData } from "../../../../../../server/storage/snapshots.ts";
import { isJobSnapshot } from "../../../../../../domain/source-contracts.ts";
import { latestProfile } from "../../../../../../server/profile-service.ts";
import { maySendTextToProvider } from "../../../../../../server/source-policies.ts";
import { assertNoCandidateFacts } from "../../../../../../server/ai/personal-data-boundary.ts";

type Params = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  // A token, not free text: it becomes part of an AI ledger key, which is kept,
  // pseudonymous, when the account is deleted (B11).
  if (!/^[A-Za-z0-9-]{8,64}$/u.test(idempotencyKey)) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }
  const pool = snapshotPool();
  const detail = await getLetterDetail({ pool, userId: user.id, letterId: id });
  if (!detail) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Build the prompt: targeted (with job) or general (profile only, CL §3).
  const profile = await latestProfile(pool, user.id);
  if (!profile) return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 409 });
  const isGeneral = detail.summary.jobSnapshotId === null;
  const roles = profile.input.targetRoles.join(", ");
  const country = profile.input.residenceCountry ?? "не указана";
  let prompt: string;
  let jobTitle = "";
  let jobCompany = "";
  if (!isGeneral) {
    const snapshotRows = await readSnapshotCardsData(pool, detail.summary.jobSnapshotId.split(":")[0] ?? "");
    const snapshot = snapshotRows.find(row => row.stored.snapshot.id === detail.summary.jobSnapshotId);
    if (!snapshot) return NextResponse.json({ error: "JOB_UNAVAILABLE" }, { status: 404 });
    if (!isJobSnapshot(snapshot.stored.snapshot)) {
      return NextResponse.json({ error: "JOB_UNAVAILABLE" }, { status: 404 });
    }
    const job = snapshot.stored.snapshot;
    // Rights before text: the posting's excerpt leaves the machine only if its
    // source policy allows provider transfer right now (docs/OPEN_GAPS.md A2).
    if (!maySendTextToProvider(job.id.split(":")[0] ?? "", new Date().toISOString())) {
      return NextResponse.json({ error: "SOURCE_RIGHTS_DENIED" }, { status: 403 });
    }
    jobTitle = job.title;
    jobCompany = job.company_name;
    const jobExcerpt = (snapshot.excerpt || job.description_text.slice(0, 500)).slice(0, 500);
    prompt = `Write a professional cover letter for the position "${jobTitle}" at "${jobCompany}". Candidate target roles: ${roles}. Country: ${country}. Job excerpt: ${jobExcerpt}. Write in a neutral professional tone, 150-250 words. Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}`;
  } else {
    prompt = `Write a general cover letter draft (no specific employer). Candidate target roles: ${roles}. Country: ${country}. Highlight transferable skills and professional interests. Do NOT mention any specific employer, company, product, mission, or position. Write in a neutral professional tone, 150-250 words. Add at the end: "Адаптируйте под конкретную вакансию." Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}`;
  }

  try {
    // Personal-data boundary (owner decision 2026-10-01): a letter is written about
    // the candidate, so the request cannot be expressed with job text alone.
    assertNoCandidateFacts("cover_letter");
    // Reserve the request's own envelope, not a guess at the answer: the input is
    // bounded by the prompt's character count and the output by the transport's
    // hard maximum (docs/OPEN_GAPS.md A4).
    const worstCase = worstCaseCostMicroUsd(reservationFor(prompt));
    const result = await executeGuardedOperation({
      pool,
      ownerId: user.id,
      purpose: "cover_letter",
      idempotencyKey: `letter-${id}-${idempotencyKey}`,
      worstCaseMinor: worstCase,
      transport: openAiTransport,
      prompt,
      now: new Date().toISOString(),
    });
    // Parse the JSON response to extract the letter text.
    let body = result.output;
    try {
      const parsed = JSON.parse(result.output) as { cover_letter?: string };
      if (typeof parsed.cover_letter === "string" && parsed.cover_letter.length > 0) {
        body = parsed.cover_letter;
      }
    } catch { /* raw output if not JSON */ }
    // Deterministic post-generation validation (CL §7–8, §12).
    const { validateLetter, issuesToQuestions } =
      await import("../../../../../../server/letters/validator.ts");
    const validation = validateLetter({
      body,
      profileTargetRoles: profile.input.targetRoles,
      profileCountry: profile.input.residenceCountry,
      jobTitle,
      jobCompany,
      generalMode: isGeneral,
    });
    if (!validation.passed) {
      // needs_input: return the questions, don't save a bad revision (CL §8).
      return NextResponse.json({
        error: "NEEDS_INPUT",
        questions: issuesToQuestions(validation.issues),
        issues: validation.issues,
        rawOutput: body.slice(0, 2000),
      }, { status: 422 });
    }
    const revision = await saveGeneratedRevision({
      pool, letterId: id, userId: user.id, body, modelId: GPT6_LUNA.modelId,
    });
    return NextResponse.json({
      revision, settledMinor: result.settledMinor.toString(),
      validation: { passed: true, issues: validation.issues },
      evidence: {
        profileRoles: profile.input.targetRoles,
        profileCountry: profile.input.residenceCountry,
        jobTitle,
        jobCompany,
      },
    }, { status: 201 });
  } catch (error) {
    const failure = letterGenerationFailure(error);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    console.error(JSON.stringify({ code: "GENERATION_DEBUG",
      name: error instanceof Error ? error.constructor.name : typeof error,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) }));
    return NextResponse.json({ error: "GENERATION_FAILED" }, { status: 502 });
  }
}
