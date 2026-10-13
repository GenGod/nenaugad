import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { accountExists, checkLogin, registerUser } from "../../src/server/users.ts";
import { loginAttemptKey } from "../../src/server/auth-attempts.ts";
import { AccountDeletionError, deleteAccount } from "../../src/server/account-deletion.ts";
import { saveJobForUser, saveProfileVersion } from "../../src/server/profile-service.ts";
import { hideJobForUser } from "../../src/server/feedback-service.ts";
import { HIDE_REASON_CODES } from "../../src/domain/feedback.ts";
import { saveCvUpload } from "../../src/server/cv/service.ts";
import { parsePlainText } from "../../src/server/cv/parse.ts";
import { createLetter, saveGeneratedRevision } from "../../src/server/letters/service.ts";
import { storeScore } from "../../src/server/relevance-service.ts";
import { ownerBudgetId } from "../../src/server/ai/provider.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";

// B11 (owner decisions 2026-10-13): deleting an account removes everything personal in
// one transaction; the AI spending ledger stays, pseudonymous; a ledger row records the
// deletion for a future restore; the foreign keys refuse any late write.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

const NOW = "2026-10-13T12:00:00.000Z";
const PASSWORD = "long-enough-password";
const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], skills: [], employmentTypes: ["contractor"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};

/** Every table that holds an account's personal data, by its user column. */
const PERSONAL_TABLES = [
  "candidate_profiles", "search_profiles", "cv_uploads", "cover_letters", "saved_jobs",
  "hidden_jobs", "job_events", "job_relevance_scores", "profile_embeddings", "ai_batch_queue",
] as const;

function email(): string {
  return `b11-${randomBytes(5).toString("hex")}@example.invalid`;
}

async function seedSnapshot(): Promise<string> {
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const id = `himalayas:b11-${randomBytes(5).toString("hex")}`;
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'himalayas', $2, $3, $4::jsonb)",
    [id, `hash-${id}`, NOW, JSON.stringify({ ...template, id, source_record_id: id })]);
  return id;
}

/** One row in every personal table, and an AI operation in the ledger. */
async function seedEverything(userId: string, snapshotId: string): Promise<string> {
  const profile = await saveProfileVersion(pool, userId, PROFILE_INPUT);
  await saveJobForUser(pool, userId, snapshotId);
  await hideJobForUser({ pool, userId, snapshotId, reasonCode: HIDE_REASON_CODES[0]! });
  await saveCvUpload({ pool, userId, filename: "cv.txt", sizeBytes: 100,
    result: parsePlainText("Инженер, React и Node.js, 5 лет опыта.", "txt") });
  const letter = await createLetter({ pool, userId, jobSnapshotId: snapshotId });
  await saveGeneratedRevision({ pool, letterId: letter.id, userId, body: "Synthetic letter.", modelId: "test" });
  await pool.query("INSERT INTO job_events (user_id, snapshot_id, event_type) VALUES ($1, $2, 'impression')",
    [userId, snapshotId]);
  await storeScore({ pool, userId, profileVersion: profile.version, modelId: "test",
    score: { snapshotId, score: 50, matchedSkills: [], missingSkills: [], explanation: "synthetic" } });
  await pool.query(
    "INSERT INTO profile_embeddings (user_id, profile_version, model_version, instruction_version, profile_text_version, embedding) VALUES ($1, $2, 'test', 'test', 'test', $3::vector)",
    [userId, profile.version, `[${new Array(1024).fill(0).join(",")}]`]);
  await pool.query("INSERT INTO ai_batch_queue (id, user_id, openai_batch_id, profile_version) VALUES ($1, $2, 'batch_test', $3)",
    [`bq_${randomBytes(6).toString("hex")}`, userId, profile.version]);
  await pool.query(
    "INSERT INTO ai_operations (id, owner_id, task_type, idempotency_key, status, input_hash, deadline_at, reserved_minor) VALUES ($1, $2, 'cover_letter', $3, 'uncertain', 'h', $4, 100)",
    [`op_${randomBytes(12).toString("hex")}`, userId, `b11-${userId}`, NOW]);
  return letter.id;
}

async function personalRows(userId: string, letterId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of PERSONAL_TABLES) {
    const result = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId]);
    counts[table] = (result.rows[0] as { n: number }).n;
  }
  const revisions = await pool.query("SELECT COUNT(*)::int AS n FROM cover_letter_revisions WHERE letter_id = $1", [letterId]);
  counts.cover_letter_revisions = (revisions.rows[0] as { n: number }).n;
  const account = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE id = $1", [userId]);
  counts.users = (account.rows[0] as { n: number }).n;
  return counts;
}

async function ledgerRows(userId: string): Promise<Record<string, number>> {
  const operations = await pool.query("SELECT COUNT(*)::int AS n FROM ai_operations WHERE owner_id = $1", [userId]);
  const budget = await pool.query("SELECT COUNT(*)::int AS n FROM ai_budgets WHERE id = $1", [ownerBudgetId(userId)]);
  const deletion = await pool.query("SELECT COUNT(*)::int AS n FROM account_deletions WHERE user_id = $1", [userId]);
  return {
    ai_operations: (operations.rows[0] as { n: number }).n,
    ai_budgets: (budget.rows[0] as { n: number }).n,
    account_deletions: (deletion.rows[0] as { n: number }).n,
  };
}

/**
 * Every column, in every table, that still holds one of `needles` as text: the catalog by
 * value, so a table that keeps an account under a column name the pattern below cannot
 * see (B53: `auth_attempts.key`) is found too.
 */
async function columnsHolding(needles: readonly string[]): Promise<string[]> {
  const columns = await pool.query(
    "SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name) WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.data_type IN ('text', 'character varying', 'json', 'jsonb') ORDER BY 1, 2");
  const found: string[] = [];
  for (const { table_name, column_name } of columns.rows as { table_name: string; column_name: string }[]) {
    const hit = await pool.query(
      `SELECT 1 FROM "${table_name}" WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS n WHERE strpos("${column_name}"::text, n) > 0) LIMIT 1`,
      [[...needles]]);
    if ((hit.rowCount ?? 0) > 0) found.push(`${table_name}.${column_name}`);
  }
  return found;
}

const refusedWith = (code: string) => (error: unknown) => error instanceof AccountDeletionError && error.message === code;

test("deleting an account removes everything personal at once, for that account only, and keeps the AI ledger (B11)", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot();
  const a = await registerUser(pool, email(), PASSWORD);
  const b = await registerUser(pool, email(), PASSWORD);
  const letterA = await seedEverything(a.id, snapshotId);
  // A login attempt leaves a counter keyed by the email's hash (B53).
  await checkLogin(pool, a.email, "not-the-password");
  const letterB = await seedEverything(b.id, snapshotId);
  const beforeA = await personalRows(a.id, letterA);
  const beforeB = await personalRows(b.id, letterB);
  for (const [table, n] of Object.entries(beforeA)) assert.ok(n >= 1, `seeded ${table}`);

  // A wrong password changes nothing.
  await assert.rejects(deleteAccount(pool, a.id, "not-the-password"), refusedWith("PASSWORD_MISMATCH"));
  assert.deepEqual(await personalRows(a.id, letterA), beforeA);
  assert.equal(await accountExists(pool, a.id), true);

  const traces = [a.id, a.email, loginAttemptKey(a.email)];
  const before = await columnsHolding(traces);
  for (const column of ["users.id", "users.email", "auth_attempts.key"]) {
    assert.ok(before.includes(column), `the sweep finds ${column}`);
  }

  await deleteAccount(pool, a.id, PASSWORD);
  const afterA = await personalRows(a.id, letterA);
  for (const [table, n] of Object.entries(afterA)) assert.equal(n, 0, `${table} still holds the deleted account's rows`);
  // Nothing in the database holds the account's id, email or login key any more, but the
  // ledger kept on purpose (owner decision 2026-10-13).
  assert.deepEqual(await columnsHolding(traces), [
    "account_deletions.user_id", "ai_budgets.id", "ai_budgets.owner_id", "ai_operations.idempotency_key", "ai_operations.owner_id",
  ]);
  assert.equal(await accountExists(pool, a.id), false);
  // The other account is untouched.
  assert.deepEqual(await personalRows(b.id, letterB), beforeB);
  // The AI ledger stays, pseudonymous; the deletion is recorded for a future restore.
  assert.deepEqual(await ledgerRows(a.id), { ai_operations: 1, ai_budgets: 1, account_deletions: 1 });
  assert.deepEqual(await ledgerRows(b.id), { ai_operations: 1, ai_budgets: 1, account_deletions: 0 });

  // An account that no longer exists cannot be deleted again.
  await assert.rejects(deleteAccount(pool, a.id, PASSWORD), refusedWith("ACCOUNT_NOT_FOUND"));
  assert.deepEqual(await ledgerRows(a.id), { ai_operations: 1, ai_budgets: 1, account_deletions: 1 });
  await pool.query("DELETE FROM job_snapshots WHERE id = $1", [snapshotId]);
});

test("after a deletion, a late write for the account is refused, and the email can register again (B11, SP-T16)", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot();
  const address = email();
  const a = await registerUser(pool, address, PASSWORD);
  const profile = await saveProfileVersion(pool, a.id, PROFILE_INPUT);
  const letter = await createLetter({ pool, userId: a.id, jobSnapshotId: snapshotId });
  await deleteAccount(pool, a.id, PASSWORD);

  // A worker or an AI result that arrives late writes nothing: the foreign keys refuse
  // it (23503), or the service finds no row of the account and refuses first.
  const foreignKey = (error: unknown) => (error as { code?: string } | null)?.code === "23503";
  await assert.rejects(saveProfileVersion(pool, a.id, PROFILE_INPUT), foreignKey);
  await assert.rejects(pool.query(
    "INSERT INTO profile_embeddings (user_id, profile_version, model_version, instruction_version, profile_text_version, embedding) VALUES ($1, $2, 'test', 'test', 'test', $3::vector)",
    [a.id, profile.version, `[${new Array(1024).fill(0).join(",")}]`]), foreignKey);
  await assert.rejects(pool.query(
    "INSERT INTO cover_letter_revisions (id, letter_id, version, body, origin, model_id, content_hash) VALUES ($1, $2, 1, 'late', 'generated', 'test', 'h')",
    [`rev_${randomBytes(6).toString("hex")}`, letter.id]), foreignKey);
  await assert.rejects(saveGeneratedRevision({ pool, letterId: letter.id, userId: a.id, body: "late", modelId: "test" }),
    (error: unknown) => error instanceof Error && error.message === "LETTER_NOT_FOUND");
  await assert.rejects(saveJobForUser(pool, a.id, snapshotId),
    (error: unknown) => error instanceof Error && error.message === "SNAPSHOT_NOT_FOUND", "the service's name for 23503");
  const left = await personalRows(a.id, letter.id);
  for (const [table, n] of Object.entries(left)) assert.equal(n, 0, `a late write left a row in ${table}`);

  // The address is free again: a new account, a new id.
  const again = await registerUser(pool, address, PASSWORD);
  assert.notEqual(again.id, a.id);
  assert.equal(await accountExists(pool, again.id), true);
  await pool.query("DELETE FROM job_snapshots WHERE id = $1", [snapshotId]);
});

test("every table that names an account is deleted with it or kept on purpose (B11)", async () => {
  await migrate(pool);
  // The database's own catalog, so a table added later cannot be missed: any column that
  // names a user, owner, email or account puts its table in one of the two lists.
  const named = await pool.query(
    "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name ~ '(user|owner|email|account)' ORDER BY 1");
  const KEPT = ["account_deletions", "ai_budgets", "ai_operations"];
  assert.deepEqual((named.rows as { table_name: string }[]).map(row => row.table_name),
    [...PERSONAL_TABLES, ...KEPT, "users"].sort());
  // Each personal table is deleted with the account: a chain of ON DELETE CASCADE keys
  // leads from it to users (profile_embeddings through candidate_profiles).
  const keys = await pool.query(
    "SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype = 'f' AND confdeltype = 'c'");
  const parents = new Map<string, string[]>();
  for (const { child, parent } of keys.rows as { child: string; parent: string }[]) {
    parents.set(child, [...(parents.get(child) ?? []), parent]);
  }
  const cascadesFromUsers = (table: string, seen: Set<string> = new Set()): boolean => {
    for (const parent of parents.get(table) ?? []) {
      if (parent === "users") return true;
      if (seen.has(parent)) continue;
      seen.add(parent);
      if (cascadesFromUsers(parent, seen)) return true;
    }
    return false;
  };
  for (const table of [...PERSONAL_TABLES, "cover_letter_revisions"]) {
    assert.ok(cascadesFromUsers(table), `${table} is deleted with the account`);
  }
});
