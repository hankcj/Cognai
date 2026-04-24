import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("npm pack smoke test", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cognai-pack-"));
  const repo = resolve(process.cwd());

  const { stdout } = await execFileAsync("npm", ["pack", repo, "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout) as Array<{ filename: string }>;
  const archivePath = join(cwd, parsed[0].filename);

  await access(archivePath);
  await execFileAsync("npm", ["init", "-y"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  await execFileAsync("npm", ["install", archivePath], {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });

  const help = await execFileAsync("npm", ["exec", "--", "cognai", "--help"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  assert.match(help.stdout, /Usage: cognai/i);

  const demoConfig = join(cwd, ".demo-check", "config.json");
  await execFileAsync(
    "npm",
    ["exec", "--", "cognai", "demo", "--config", demoConfig],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    }
  );

  await access(demoConfig);
});
