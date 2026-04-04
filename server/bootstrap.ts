/**
 * Bootstrap entry point — catches fatal errors that occur before the
 * logger is ready and writes them to a crash log next to the exe
 * (or in the current directory during development).
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

// Immediate marker — proves Bun's JS runtime started at all
const _bootDir = join(process.env.APPDATA ?? homedir(), "RaceIQ");
try {
  mkdirSync(_bootDir, { recursive: true });
  writeFileSync(join(_bootDir, "boot-marker.txt"), `started ${new Date().toISOString()} pid=${process.pid}\n`, { flag: "a" });
} catch {}

function crashLog(err: unknown): void {
  const msg = `[${new Date().toISOString()}] FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
  // Try %APPDATA%/RaceIQ first, fall back to exe directory, then cwd
  const candidates = [
    _bootDir,
    dirname(process.execPath),
    process.cwd(),
  ];
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "crash.log"), msg, { flag: "a" });
      break;
    } catch {}
  }
}

process.on("uncaughtException", (err) => {
  crashLog(err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  crashLog(err);
  process.exit(1);
});

try {
  await import("./index");
} catch (err) {
  crashLog(err);
  process.exit(1);
}
