import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("task repair counter persists across processes and blocks a third cycle", async () => {
  const directory = await mkdtemp(join(tmpdir(),"atlas-task-"));
  try {
    await mkdir(join(directory,"tasks"));
    await copyFile(resolve("scripts/task.mjs"),join(directory,"task.mjs"));
    await writeFile(join(directory,"tasks/current.json"), JSON.stringify({
      repair_cycles_used:0, max_repair_cycles:2, hypotheses:[]
    }));
    const run = (reason: string) => spawnSync(process.execPath,["task.mjs","repair",reason],{
      cwd:directory, encoding:"utf8"
    });
    assert.equal(run("First distinct hypothesis with a reproducible case").status,0);
    assert.equal(run("Second distinct hypothesis from newly observed output").status,0);
    const third = run("Third hypothesis must not reset the original allowance");
    assert.equal(third.status,1);
    assert.match(third.stderr,/REPAIR_LIMIT/u);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
