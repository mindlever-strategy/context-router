#!/usr/bin/env node
/**
 * Pre-publish gate for the Python SDK: build wheel/sdist and run pytest.
 * Usage: node scripts/release-python-check.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkDir = path.join(root, "packages", "sdk-python");

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("→ Building MCP server (required for integration tests)...");
run("npm", ["run", "db:generate"]);
run("npm", ["run", "build", "--workspace=@context-router/mcp-server"]);

console.log("→ Installing Python SDK in editable mode...");
run("python", ["-m", "pip", "install", "-e", "./packages/sdk-python[dev]"]);

console.log("→ Running pytest...");
run("pytest", ["packages/sdk-python", "-q"]);

console.log("→ Building sdist/wheel...");
run("python", ["-m", "pip", "install", "build", "twine"]);
run("python", ["-m", "build", "packages/sdk-python"], { cwd: root });

const distDir = path.join(sdkDir, "dist");
if (!existsSync(distDir)) {
  console.error("Expected dist/ after build");
  process.exit(1);
}

console.log("→ Checking distribution with twine...");
run("twine", ["check", `${distDir}/*`]);

console.log("\n✓ Python SDK is ready to publish.");
console.log(`  Artifacts: ${distDir}`);
console.log("  CI: Actions → Release Python SDK");
console.log("  Manual: twine upload packages/sdk-python/dist/*");
