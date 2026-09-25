import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { parsePlainText } from "../../src/server/cv/parse.ts";
import {
  saveCvUpload, listCvUploads, getCvText, deleteCvUpload, deleteAllCvUploads,
} from "../../src/server/cv/service.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

function uniqueEmail(): string {
  return `cv-${randomBytes(6).toString("hex")}@example.invalid`;
}

test("CV uploads are strictly ownership-scoped; profile deletion purges them", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM cv_uploads");
  const userA = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const userB = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const result = parsePlainText("Инженер, React и Node.js, 5 лет опыта.", "txt");

  const id = await saveCvUpload({
    pool: pool, userId: userA.id, filename: "resume.txt",
    sizeBytes: 100, result,
  });
  assert.match(id, /^cv_[a-f0-9]{24}$/u);
  const list = await listCvUploads(pool, userA.id);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.originalFilename, "resume.txt");
  assert.equal(list[0]?.characterCount, result.text.length);
  assert.equal((await listCvUploads(pool, userB.id)).length, 0);

  // Ownership: B cannot read or delete A's upload; A can.
  assert.equal(await getCvText(pool, userB.id, id), null);
  assert.equal(await deleteCvUpload(pool, userB.id, id), false);
  assert.equal(await getCvText(pool, userA.id, id), result.text);
  // Malformed ids never reach the database.
  assert.equal(await getCvText(pool, userA.id, "cv_garbage"), null);

  // Profile deletion removes all CV uploads of the user only.
  const second = await saveCvUpload({
    pool: pool, userId: userA.id, filename: "second.md",
    sizeBytes: 50, result: parsePlainText("# ещё одно", "md"),
  });
  await saveCvUpload({
    pool: pool, userId: userB.id, filename: "b.txt",
    sizeBytes: 10, result,
  });
  assert.equal(await deleteAllCvUploads(pool, userA.id), 2);
  assert.equal(await getCvText(pool, userA.id, id), null);
  assert.equal(await getCvText(pool, userA.id, second), null);
  assert.equal((await listCvUploads(pool, userB.id)).length, 1);
});

test("table constraints reject out-of-bounds intake data", async () => {
  await migrate(pool);
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await assert.rejects(pool.query(
    "INSERT INTO cv_uploads (id, user_id, original_filename, detected_kind, size_bytes, character_count, extracted_text) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    ["cv_x", user.id, "f.txt", "exe", 10, 10, "text"],
  ));
  await assert.rejects(pool.query(
    "INSERT INTO cv_uploads (id, user_id, original_filename, detected_kind, size_bytes, character_count, extracted_text) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    ["cv_y", user.id, "f.txt", "txt", 999999999, 10, "text"],
  ));
});
