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
// The server programs start a test cluster. The client programs are needed only by the backup
// and restore rehearsal (test/preparation-recovery.test.ts); the bundled embedded PostgreSQL
// ships the server programs alone, so it must not be refused for lacking them.
const server = ["initdb", "postgres", "pg_ctl"];
const client = ["pg_dump", "pg_restore"];
const programs = [...server, ...client];
// What the source fallback needs before anything is downloaded. Since PostgreSQL 17 the source
// archive no longer carries generated parser files, so Flex, Bison and Perl are required.
const buildTools = ["curl", "tar", "bzip2", "cc", "make", "perl", "flex", "bison", "m4"];
/** The major version a PostgreSQL program in `bin` reports, or null when it does not run. */
function majorOf(bin, program) {
  try {
    const text = execFileSync(join(bin, program), ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    const major = Number(/PostgreSQL\)?\s+(\d+)/.exec(text)?.[1]);
    return Number.isInteger(major) ? major : null;
  } catch {
    return null;
  }
}
function usable(bin, needed = programs) {
  if (!bin) return false;
  return needed.every((p) => (majorOf(bin, p) ?? 0) >= 17);
}
function hostDirs() {
  const base = "/usr/lib/postgresql";
  const dirs = existsSync(base)
    ? readdirSync(base)
        .sort((a, b) => Number(b) - Number(a))
        .map((v) => join(base, v, "bin"))
    : [];
  dirs.push(...(process.env.PATH ?? "").split(":").filter(Boolean));
  return dirs;
}
const findHost = (needed) => hostDirs().find((d) => usable(d, needed));
function onPath(command) {
  return (process.env.PATH ?? "")
    .split(":")
    .filter(Boolean)
    .some((d) => existsSync(join(d, command)));
}
/** The bundled embedded PostgreSQL's program folder when its server programs run, else null. */
function embeddedBin() {
  // The npm binary is optional by platform. Inspect the installed package,
  // without assuming the package manager exposes transitive packages at root.
  const base = join(repo, "node_modules/.pnpm");
  if (!existsSync(base)) return null;
  return (
    readdirSync(base)
      .filter((n) =>
        n.startsWith(
          `@embedded-postgres+${process.platform}-${process.arch}@${version}`,
        ),
      )
      .map((n) =>
        join(
          base,
          n,
          "node_modules/@embedded-postgres",
          `${process.platform}-${process.arch}`,
          "native/bin",
        ),
      )
      .find((d) => usable(d, server)) ?? null
  );
}
function buildPostgres() {
  if (process.platform !== "linux" || process.getuid?.() === 0)
    throw new Error(
      "Provide TEST_DATABASE_URL or working PG17 binaries; the source fallback requires non-root Linux.",
    );
  const missing = buildTools.filter((c) => !onPath(c));
  if (missing.length)
    throw new Error(
      `No usable PostgreSQL 17 was found, and building one from source needs ${missing.join(", ")}, which ${missing.length === 1 ? "is" : "are"} not installed. ` +
        `Install ${missing.length === 1 ? "it" : "them"}, install PostgreSQL 17, or set TEST_DATABASE_URL to a PostgreSQL 17 test server. See docs/test-database.md.`,
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
    // CONTROLROD_TEST_PG_SERVER=bundled insists on the embedded PostgreSQL that
    // `controlrod start` runs, even where the host has a newer server (CI does).
    const choice = env.CONTROLROD_TEST_PG_SERVER;
    if (choice !== undefined && choice !== "bundled")
      throw new Error(
        `CONTROLROD_TEST_PG_SERVER can only be "bundled", not "${choice}".`,
      );
    let bin = env.CONTROLROD_TEST_PG_DIR;
    if (choice && bin)
      throw new Error(
        "Set CONTROLROD_TEST_PG_SERVER=bundled or CONTROLROD_TEST_PG_DIR, not both.",
      );
    if (bin && !usable(bin, server))
      throw new Error(
        "CONTROLROD_TEST_PG_DIR must contain usable PostgreSQL17+ server programs (initdb, postgres, pg_ctl).",
      );
    // As root the harness always runs the bundled server (a host server will not start as root).
    const root = process.getuid?.() === 0;
    if (root && bin)
      throw new Error(
        "CONTROLROD_TEST_PG_DIR is not used as root: the test harness runs the bundled PostgreSQL then. Run as an ordinary user, or unset it.",
      );
    let embedded = null;
    if (choice || root) {
      embedded = embeddedBin();
      if (!embedded)
        throw new Error(
          "The bundled PostgreSQL cannot run here, and it is the one the tests need (CONTROLROD_TEST_PG_SERVER=bundled, or running as root). `pnpm cr doctor` says why.",
        );
    } else {
      bin ??= findHost(server);
      if (!bin) embedded = embeddedBin();
      if (!bin && !embedded) bin = buildPostgres();
    }
    if (bin) {
      env.CONTROLROD_TEST_PG_DIR = bin;
      console.error(`[test-api] PostgreSQL fixture binaries: ${bin}`);
    } else {
      // Tell the harness, so it does not pick a host server of its own.
      env.CONTROLROD_TEST_PG_SERVER = "bundled";
      console.error(
        "[test-api] PostgreSQL fixture binaries: the bundled embedded PostgreSQL",
      );
    }
    // pg_dump refuses a server of another major version, so the rehearsal's
    // tools must match the server just chosen.
    const major = majorOf(bin ?? embedded, "postgres");
    const given = env.CONTROLROD_TEST_PG_BIN;
    if (given) {
      const found = majorOf(given, "pg_dump");
      if (!usable(given, client) || found !== major)
        throw new Error(
          `CONTROLROD_TEST_PG_BIN (${given}) holds pg_dump ${found ?? "that does not run"}, but the test server is PostgreSQL ${major}. ` +
            `Point it at PostgreSQL ${major} client tools` +
            (found !== null && found >= 17
              ? `, or run the tests on a PostgreSQL ${found} server (CONTROLROD_TEST_PG_DIR).`
              : "."),
        );
    } else {
      const tools = [bin, ...hostDirs()].find(
        (d) => d && usable(d, client) && majorOf(d, "pg_dump") === major,
      );
      if (tools) env.CONTROLROD_TEST_PG_BIN = tools;
    }
    if (env.CONTROLROD_TEST_PG_BIN) {
      console.error(
        `[test-api] Backup and restore rehearsal tools (PostgreSQL ${major}): ${env.CONTROLROD_TEST_PG_BIN}`,
      );
    } else if (env.CONTROLROD_TEST_REQUIRE_PG_CLIENT === "1") {
      throw new Error(
        `CONTROLROD_TEST_REQUIRE_PG_CLIENT is set, but no PostgreSQL ${major} pg_dump and pg_restore were found. Set CONTROLROD_TEST_PG_BIN to their folder.`,
      );
    } else {
      console.error(
        `[test-api] No PostgreSQL ${major} pg_dump and pg_restore found, so the backup and restore rehearsal (test/preparation-recovery.test.ts) is skipped. Every other test runs. To run it, install the PostgreSQL ${major} client tools or set CONTROLROD_TEST_PG_BIN to their folder.`,
      );
    }
  } else if (env.CONTROLROD_TEST_PG_BIN && !usable(env.CONTROLROD_TEST_PG_BIN, client)) {
    throw new Error(
      "CONTROLROD_TEST_PG_BIN must contain PostgreSQL17+ pg_dump and pg_restore.",
    );
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
