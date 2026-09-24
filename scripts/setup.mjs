import { readFile, writeFile, lstat } from "node:fs/promises";
import { randomBytes } from "node:crypto";

try {
  const stat = await lstat(".env");
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe .env target.");
  console.log(".env already exists; nothing overwritten. No secrets printed.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const template = await readFile(".env.example", "utf8");
  const password = randomBytes(24).toString("hex");
  const value = template
    .replace("POSTGRES_PASSWORD=GENERATE_WITH_SETUP", `POSTGRES_PASSWORD=${password}`)
    .replace("DATABASE_URL=GENERATE_WITH_SETUP",
      `DATABASE_URL=postgresql://atlas:${password}@127.0.0.1:54329/atlas_starter`);
  await writeFile(".env", value, { flag: "wx", mode: 0o600 });
  console.log("Created local .env (fixture mode). No AI, uploads or live sources. No secrets printed.");
}
