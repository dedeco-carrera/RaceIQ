/**
 * Full local build: client + server binary + PE patches + Inno Setup installer.
 * Mirrors the CI release workflow for local testing.
 *
 * Usage: bun scripts/build-installer.ts [version]
 *   version defaults to package.json version
 */
import { execSync } from "child_process";
import { readFileSync, rmSync, mkdirSync, cpSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = process.argv[2] ?? pkg.version;

function run(cmd: string, label: string, env?: Record<string, string>) {
  console.log(`\n→ ${label}`);
  execSync(cmd, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
}

// 1. Clean dist
console.log(`\nBuilding RaceIQ v${version} installer...\n`);
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// 2. Build client
run("cd client && bun run build", "Building client");

// 3. Copy client assets to dist/public
cpSync("client/dist", "dist/public", { recursive: true });
console.log("→ Copied client assets to dist/public");

// 4. Copy shared data
run("bun scripts/copy-shared-data.ts", "Copying shared data");

// 5. Compile server binary
run(
  'bun build --compile --target=bun-windows-x64 --windows-icon=assets/raceiq.ico server/bootstrap.ts --outfile dist/raceiq.exe',
  "Compiling server binary",
  { NODE_ENV: "production" },
);

// 6. Build installer
run(`iscc /DMyAppVersion=${version} installer\\raceiq.iss`, "Building installer");

console.log(`\n✅ Done! Installer: RaceIQ-Setup-v${version}.exe\n`);
