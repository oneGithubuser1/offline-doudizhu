import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir(".ai-reference", { recursive: true });
await build({ entryPoints: ["scripts/ai-tools.ts"], outfile: ".ai-reference/ai-tools.cjs",
  bundle: true, platform: "node", format: "cjs", packages: "external" });
const child = spawn(process.execPath, [".ai-reference/ai-tools.cjs", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", code => process.exitCode = code ?? 1);
