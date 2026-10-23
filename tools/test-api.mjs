// Portable test-only PostgreSQL bootstrap. Never installs system packages or
// changes the production database. Existing servers and working binaries win.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const version = "17.10";
const sourceHash =
  "078a03516dcdbdb705fecaf415ea3d13a956c589e46f09fed68a06fb00598c90";
const sourceUrl = `https://ftp.postgresql.org/pub/source/v${version}/postgresql-${version}.tar.bz2`;
const programs = ["initdb", "postgres", "pg_ctl", "pg_dump", "pg_restore"];
function usable(bin) {
  try {
    return programs.every((p) => {
      const text = execFileSync(join(bin, p), ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });
      const major = /PostgreSQL\)?\s+(\d+)/.exec(text)?.[1];
      return Number(major) >= 17;
    });
  } catch {
    return false;
  }
}
function findHost() {
  const base = "/usr/lib/postgresql";
  const dirs = existsSync(base)
    ? readdirSync(base)
        .sort((a, b) => Number(b) - Number(a))
        .map((v) => join(base, v, "bin"))
    : [];
  dirs.push(...(process.env.PATH ?? "").split(":"));
  return dirs.find(usable);
}
function embeddedWorks() {
  // The npm binary is optional by platform. Inspect the installed package,
  // without assuming the package manager exposes transitive packages at root.
  const base = join(repo, "node_modules/.pnpm");
  if (!existsSync(base)) return false;
  return readdirSync(base)
    .filter((n) =>
      n.startsWith(
        `@embedded-postgres+${process.platform}-${process.arch}@${version}`,
      ),
    )
    .some((n) =>
      usable(
        join(
          base,
          n,
          "node_modules/@embedded-postgres",
          `${process.platform}-${process.arch}`,
          "native/bin",
        ),
      ),
    );
}
function buildPostgres() {
  if (process.platform !== "linux" || process.getuid?.() === 0)
    throw new Error(
      "Provide TEST_DATABASE_URL or working PG17 binaries; the source fallback requires non-root Linux.",
    );
  const cache = join(homedir(), ".cache/controlrod-test-postgres", sourceHash);
  const bin = join(cache, "install/bin"),
    manifest = join(cache, "build.json");
  const flags = [
    "--without-icu",
    "--without-readline",
    "--without-zlib",
    "--without-openssl",
    "--without-ldap",
    "--without-libxml",
    "--without-libxslt",
    "--without-lz4",
    "--without-zstd",
  ];
  if (existsSync(manifest)) {
    const saved = JSON.parse(readFileSync(manifest, "utf8"));
    if (
      saved.source_sha256 === sourceHash &&
      JSON.stringify(saved.flags) === JSON.stringify(flags) &&
      programs.every(
        (p) => saved.binaries[p] === sha(readFileSync(join(bin, p))),
      ) &&
      usable(bin)
    )
      return bin;
    throw new Error(
      `Test PostgreSQL cache changed; inspect and remove ${cache} before rebuilding.`,
    );
  }
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const lock = join(cache, "building.lock");
  const fd = openSync(lock, "wx", 0o600);
  try {
    console.error(
      `[test-api] Building checksum-pinned PostgreSQL ${version} for local fixtures: ${cache}`,
    );
    const archive = join(cache, `postgresql-${version}.tar.bz2`);
    if (!existsSync(archive))
      execFileSync(
        "curl",
        [
          "--fail",
          "--location",
          "--max-time",
          "120",
          "--max-filesize",
          "67108864",
          "--output",
          archive,
          sourceUrl,
        ],
        { stdio: "inherit", timeout: 125000 },
      );
    if (sha(readFileSync(archive)) !== sourceHash)
      throw new Error(
        "PostgreSQL source checksum mismatch; refusing extraction/build.",
      );
    execFileSync("tar", ["-xjf", archive, "-C", cache], {
      stdio: "inherit",
      timeout: 30000,
    });
    const cwd = join(cache, `postgresql-${version}`);
    const log = openSync(join(cache, "build.log"), "w", 0o600);
    try {
      for (const [command, args] of [
        ["./configure", [`--prefix=${join(cache, "install")}`, ...flags]],
        ["make", ["-j2"]],
        ["make", ["install"]],
      ])
        execFileSync(command, args, {
          cwd,
          stdio: ["ignore", log, log],
          timeout: 300000,
        });
    } catch (error) {
      throw new Error(
        `Test PostgreSQL build failed; inspect ${join(cache, "build.log")}: ${error.message}`,
      );
    } finally {
      closeSync(log);
    }
    if (!usable(bin))
      throw new Error(
        `Built PostgreSQL is unusable; inspect ${join(cache, "build.log")}`,
      );
    writeFileSync(
      manifest,
      JSON.stringify(
        {
          source_url: sourceUrl,
          source_sha256: sourceHash,
          flags,
          binaries: Object.fromEntries(
            programs.map((p) => [p, sha(readFileSync(join(bin, p)))]),
          ),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    return bin;
  } finally {
    closeSync(fd);
    rmSync(lock);
  }
}

try {
  const env = { ...process.env };
  if (!env.TEST_DATABASE_URL) {
    let bin = env.CONTROLROD_TEST_PG_DIR;
    if (bin && !usable(bin))
      throw new Error(
        "CONTROLROD_TEST_PG_DIR must contain usable PostgreSQL17+ server and client tools.",
      );
    bin ??= findHost();
    if (!bin && !embeddedWorks()) bin = buildPostgres();
    if (bin) {
      env.CONTROLROD_TEST_PG_DIR = bin;
      env.CONTROLROD_TEST_PG_BIN ??= bin;
      console.error(`[test-api] PostgreSQL fixture binaries: ${bin}`);
    }
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", ...process.argv.slice(2)],
    { cwd: join(repo, "services/api"), env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`[test-api] ${error.message}`);
  process.exitCode = 1;
}
