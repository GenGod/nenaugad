// Ownership-scoped profile and saved-job storage (migration 0003).
// Every read/write takes an explicit userId resolved from the server session;
// there is no API surface that accepts a client-supplied owner. All SQL is
// fixed literals with $n parameters — no user input is ever concatenated.
import type { Pool } from "pg";
import {
  buildProfileDocuments, parseManualProfileInput, profileFromDocuments,
  type CandidateProfileDocument, type ManualProfileInput, type ProfileSnapshot,
  type SearchProfileDocument,
} from "../domain/profile.ts";

export class ProfileServiceError extends Error {
  constructor(code: "INVALID_PROFILE" | "SNAPSHOT_NOT_FOUND") { super(code); }
}

export async function saveProfileVersion(
  pool: Pool, userId: string, rawInput: unknown,
): Promise<ProfileSnapshot> {
  const input: ManualProfileInput = parseManualProfileInput(rawInput);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT COALESCE(MAX(version), 0) AS version FROM candidate_profiles WHERE user_id = $1",
      [userId],
    );
    const version = Number((current.rows[0] as { version: string | number }).version) + 1;
    const documents = buildProfileDocuments({ userId, version, input });
    await client.query(
      "INSERT INTO candidate_profiles (id, user_id, version, payload) VALUES ($1, $2, $3, $4::jsonb)",
      [documents.candidate.id, userId, version, JSON.stringify(documents.candidate)],
    );
    await client.query(
      "INSERT INTO search_profiles (id, user_id, candidate_profile_id, candidate_profile_version, version, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [documents.search.id, userId, documents.search.candidate_profile_id,
        documents.search.candidate_profile_version, version, JSON.stringify(documents.search)],
    );
    await client.query("COMMIT");
    return { version, input };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function latestProfile(pool: Pool, userId: string): Promise<ProfileSnapshot | null> {
  const result = await pool.query(
    "SELECT c.payload AS candidate, s.payload AS search FROM candidate_profiles c JOIN search_profiles s ON s.user_id = c.user_id AND s.candidate_profile_version = c.version WHERE c.user_id = $1 ORDER BY c.version DESC LIMIT 1",
    [userId],
  );
  const row = result.rows[0] as
    | { candidate: CandidateProfileDocument; search: SearchProfileDocument }
    | undefined;
  if (!row) return null;
  return profileFromDocuments(row.candidate, row.search);
}

export async function countProfileVersions(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM candidate_profiles WHERE user_id = $1",
    [userId],
  );
  return Number((result.rows[0] as { total: string }).total);
}

// Deletion of entered data: all profile versions of this user are removed, and
// so is the interaction journal (item A8) — a deleted profile must leave no
// behavioural trace. The account row and saved jobs are governed by their own
// lifecycles.
export async function deleteAllProfiles(pool: Pool, userId: string): Promise<number> {
  await pool.query("DELETE FROM job_events WHERE user_id = $1", [userId]);
  const search = await pool.query("DELETE FROM search_profiles WHERE user_id = $1", [userId]);
  const candidate = await pool.query("DELETE FROM candidate_profiles WHERE user_id = $1", [userId]);
  return (search.rowCount ?? 0) + (candidate.rowCount ?? 0);
}

export async function saveJobForUser(pool: Pool, userId: string, snapshotId: string): Promise<void> {
  if (!/^(himalayas|jobicy):[a-z0-9-]{1,150}$/u.test(snapshotId)) {
    throw new ProfileServiceError("SNAPSHOT_NOT_FOUND");
  }
  try {
    await pool.query(
      "INSERT INTO saved_jobs (user_id, snapshot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, snapshotId],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
      throw new ProfileServiceError("SNAPSHOT_NOT_FOUND");
    }
    throw error;
  }
}

export async function unsaveJobForUser(pool: Pool, userId: string, snapshotId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM saved_jobs WHERE user_id = $1 AND snapshot_id = $2",
    [userId, snapshotId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type SavedSnapshotRow = Readonly<{
  snapshotId: string;
  savedAt: string;
  excerpt: string;
  snapshot: unknown;
}>;

export async function listSavedJobs(pool: Pool, userId: string): Promise<readonly SavedSnapshotRow[]> {
  const result = await pool.query(
    "SELECT s.snapshot_id, s.created_at, j.excerpt, j.snapshot FROM saved_jobs s JOIN job_snapshots j ON j.id = s.snapshot_id WHERE s.user_id = $1 ORDER BY s.created_at DESC",
    [userId],
  );
  return result.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      snapshotId: String(record.snapshot_id),
      savedAt: new Date(record.created_at as Date).toISOString(),
      excerpt: String(record.excerpt ?? ""),
      snapshot: record.snapshot,
    };
  });
}
