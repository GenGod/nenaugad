// Syntax-only inspection; not a substitute for typecheck or Next build.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const files = [...walk("src"), ...walk("scripts"), ...walk("tests"),
  "next.config.ts", "playwright.config.ts"].filter(file => /\.tsx?$/.test(file));
const errors = [];
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX, isolatedModules: true }
  });
  errors.push(...(result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
    .map(d => ({ file, message: ts.flattenDiagnosticMessageText(d.messageText, "\n") })));
}
console.log(JSON.stringify({ compiler: ts.version, scope: "syntax only", files: files.length, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
