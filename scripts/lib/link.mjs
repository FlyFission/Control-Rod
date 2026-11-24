// Puts the `controlrod` command on PATH: a small shell script in ~/.local/bin that runs this
// checkout's scripts/cr.mjs. `pnpm cr link` writes it once; later builds keep it current.
//
// Pattern taken, no code copied: uv's installer (MIT/Apache-2.0) and Claude Code's native installer
// put their command in ~/.local/bin and, when that folder is not on PATH, add one line for it to the
// shell's startup file, once.
import { appendFileSync, chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, platform } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";

export const MARK = "# controlrod command, written by `pnpm cr link`";

export function binDir(env = process.env) {
  return resolve(env.CONTROLROD_BIN_DIR ?? join(env.HOME ?? homedir(), ".local", "bin"));
}

export const commandPath = (env = process.env) => join(binDir(env), "controlrod");

const sq = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

const SEAL = "# controlrod-shim-sha256 ";
const digest = (text) => createHash("sha256").update(text).digest("hex");

/** The command script. Its last line seals the rest, so an edited copy is recognisably the person's. */
export function shim(root, nodePath = process.execPath) {
  const body = shimBody(root, nodePath);
  return `${body}${SEAL}${digest(body)}\n`;
}

function shimBody(root, nodePath) {
  return `#!/bin/sh
${MARK} from the checkout below.
# Run \`pnpm cr link\` in a checkout to point it there instead; \`pnpm cr unlink\` removes it.
root=${sq(root)}
if [ ! -f "$root/scripts/cr.mjs" ]; then
  echo "controlrod: Control Rod is no longer at $root. In your copy of Control Rod, run: pnpm cr link" >&2
  exit 1
fi
export CONTROLROD_CLI=1
# Node 22.12 or later: the one on PATH first (what version managers select), then the one that ran \`pnpm cr link\`.
ok='const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)'
if command -v node >/dev/null 2>&1 && node -e "$ok" 2>/dev/null; then
  exec node "$root/scripts/cr.mjs" "$@"
fi
node=${sq(nodePath)}
if [ -x "$node" ] && "$node" -e "$ok" 2>/dev/null; then
  PATH="$(dirname "$node"):$PATH" exec "$node" "$root/scripts/cr.mjs" "$@"
fi
echo "controlrod: Control Rod needs Node.js 22.12 or later (found: $(node --version 2>/dev/null || echo none)). https://nodejs.org" >&2
exit 1
`;
}

/** Who wrote the file at path: "ours" (a controlrod shim), "foreign", or "none". */
export function ownerOf(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch (e) {
    return e?.code === "ENOENT" ? "none" : "foreign";
  }
  // A symlink (even a dangling one) or anything but a plain file is someone else's.
  if (!st.isFile()) return "foreign";
  try {
    // Ours only if written by this (any version) and unchanged since: the seal still matches.
    const text = readFileSync(path, "utf8");
    const at = text.lastIndexOf(SEAL);
    if (at < 0 || !text.includes(MARK)) return "foreign";
    const body = text.slice(0, at);
    return text.slice(at) === `${SEAL}${digest(body)}\n` ? "ours" : "foreign";
  } catch {
    return "foreign";
  }
}

export const onPath = (dir, env = process.env) =>
  (env.PATH ?? "").split(delimiter).some((p) => p && resolve(p) === resolve(dir));

/** The startup file a new terminal reads for this user's shell, and the line that adds dir to PATH. */
export function shellProfile(dir, env = process.env, os = platform()) {
  const home = env.HOME ?? homedir();
  const shell = basename(env.SHELL ?? "");
  if (shell === "fish") {
    return { file: join(home, ".config", "fish", "conf.d", "controlrod.fish"), line: `fish_add_path ${sq(dir)}` };
  }
  // The folder is written as literal text: a name with $ or backquotes is never run by the shell.
  const rest = dir.startsWith(`${home}/`) ? dir.slice(home.length + 1) : null;
  const line = rest !== null && /^[A-Za-z0-9._/-]+$/.test(rest) ? `export PATH="$HOME/${rest}:$PATH"` : `export PATH=${sq(dir)}":$PATH"`;
  if (shell === "zsh") return { file: join(env.ZDOTDIR ?? home, ".zshrc"), line };
  if (shell === "bash") {
    if (os !== "darwin") return { file: join(home, ".bashrc"), line };
    // A login bash reads the first of these that exists; never create one that hides the others.
    const first = [".bash_profile", ".bash_login", ".profile"].find((f) => existsSync(join(home, f)));
    return { file: join(home, first ?? ".bash_profile"), line };
  }
  return { file: join(home, ".profile"), line };
}

/**
 * Writes or refreshes the command. Never replaces a `controlrod` this did not write. With
 * editProfile, adds the folder to PATH in the shell's startup file when it is missing there.
 * Returns { path, status: "written" | "unchanged" | "foreign" | "unsupported", profile? }.
 */
export function link(root, { env = process.env, editProfile = true, os = platform() } = {}) {
  if (os === "win32") return { status: "unsupported" };
  const path = commandPath(env);
  const owner = ownerOf(path);
  if (owner === "foreign") return { path, status: "foreign" };
  const text = shim(root);
  let status = "unchanged";
  if (owner === "none" || readFileSync(path, "utf8") !== text) {
    mkdirSync(dirname(path), { recursive: true });
    // Created exclusively, so a planted file or symlink at the temporary name is never written through.
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    const fd = openSync(tmp, "wx", 0o755);
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
    chmodSync(tmp, 0o755);
    if (ownerOf(path) === "foreign") {
      rmSync(tmp, { force: true });
      return { path, status: "foreign" };
    }
    renameSync(tmp, path);
    status = "written";
  }
  const dir = binDir(env);
  if (onPath(dir, env)) return { path, status, profile: null };
  const profile = shellProfile(dir, env, os);
  const current = existsSync(profile.file) ? readFileSync(profile.file, "utf8") : "";
  profile.added = false;
  if (editProfile && !current.includes(profile.line)) {
    mkdirSync(dirname(profile.file), { recursive: true });
    appendFileSync(profile.file, `${current && !current.endsWith("\n") ? "\n" : ""}\n# Added by Control Rod (pnpm cr link): the controlrod command\n${profile.line}\n`);
    profile.added = true;
  }
  return { path, status, profile };
}

/** Refreshes an installed command that points at this checkout; leaves anything else alone. */
export function refresh(root, env = process.env) {
  const path = commandPath(env);
  if (ownerOf(path) !== "ours") return false;
  const text = readFileSync(path, "utf8");
  if (!text.includes(`\nroot=${sq(root)}\n`)) return false;
  return link(root, { env, editProfile: false }).status === "written";
}

export function unlink(env = process.env) {
  const path = commandPath(env);
  const owner = ownerOf(path);
  if (owner === "ours") rmSync(path, { force: true });
  return { path, status: owner === "ours" ? "removed" : owner };
}
