import { readFile, writeFile, open, rm, rename } from "node:fs/promises";

const location = "tasks/current.json";
const [command = "show", ...rest] = process.argv.slice(2);
if (!["show","repair"].includes(command)) {
  console.error("Usage: npm run task -- show | repair <new testable hypothesis>");
  process.exitCode = 1;
} else if (command === "show") {
  console.log(await readFile(location,"utf8"));
} else {
  let lock;
  try {
    lock = await open("tasks/.task.lock","wx");
    const state = JSON.parse(await readFile(location,"utf8"));
    const hypothesis = rest.join(" ").trim();
    if (hypothesis.length < 15) throw new Error("Describe a new, testable hypothesis (at least 15 characters).");
    if (state.repair_cycles_used >= state.max_repair_cycles) {
      throw new Error("REPAIR_LIMIT: preserve the diff and report the blocker; do not reset this task.");
    }
    if (state.hypotheses.some(item => item.text === hypothesis)) throw new Error("Repeated hypothesis.");
    state.repair_cycles_used += 1;
    state.hypotheses.push({ text:hypothesis, recorded_at:new Date().toISOString() });
    await writeFile(`${location}.tmp`, JSON.stringify(state,null,2)+"\n", { mode:0o600 });
    await rename(`${location}.tmp`,location);
    console.log(`Recorded cycle ${state.repair_cycles_used}/${state.max_repair_cycles}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "TASK_UPDATE_FAILED");
    process.exitCode = 1;
  } finally {
    if (lock) { await lock.close(); await rm("tasks/.task.lock",{force:true}); }
  }
}
