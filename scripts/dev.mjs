import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const executable = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    executable,
    "dev",
    "--webpack",
    "--hostname",
    "0.0.0.0",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: { ...process.env, WATCHPACK_POLLING: "true" } },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
