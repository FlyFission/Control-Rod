"""Release gate (DESIGN.md §10).

Records are released byte for byte, so every digest inside them still verifies; a record that
carries a host identifier or a key stops the release instead of being edited. The transcript asset
(prompts, transcripts, raw patches and verdicts of phase 1) is a separate, redacted derivative with
its own digests: host paths are replaced by placeholders, then it is scanned the same way. Nothing
is published until everything is staged; the staging directory becomes `release/` by one rename.
share.md is written last, only from the released manifest, after every file is verified."""

from __future__ import annotations

import getpass
import io
import os
import re
import secrets
import shutil
import socket
import subprocess
import tarfile
from pathlib import Path

from .adjudicate import verify_lock
from .score import disclosures
from .common import ROOT, Refused, Study, now, read_json, sha256_bytes, sha256_file, write_json
from .workspace import trusted_git, workspace_root_path

REQUIRED = ["study.json", "sizing.json", "ledger.jsonl", "calibration/preflight.json", "calibration/probes.json",
            "main/preflight.json", "main/controls.json", "main/manifest.json", "main/run.json", "main/stability.json",
            "main/verdicts.lock.json", "main/adjudication/queue.json", "main/adjudication/key.json",
            "main/evaluation.json", "main/results.json", "main/report.md"]
OPTIONAL = ["exclusions.json", "models.json", "calibration/controls.json", "main/adjudication/judgments.json"]
KEYS = {"API key or token": re.compile(rb"\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|"
                                       rb"github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|"
                                       rb"AKIA[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,})"),
        "bearer token": re.compile(rb"Bearer\s+[A-Za-z0-9._~+/=-]{20,}"),
        "private key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        "credential field": re.compile(rb"\"(access_token|refresh_token|id_token|api_key|session_token)\"\s*:\s*\"[^\"]{8,}")}


def host_identifiers() -> dict[str, re.Pattern]:
    """What would identify the machine or its owner. Open-source maintainers' emails in task
    repositories are not on this list; only this host's user, home, host name and git email are."""
    ids = {}
    homes = _forms(Path.home())
    if homes:
        ids["home directory"] = re.compile(b"|".join(re.escape(h.encode()) for h in homes))
    user = getpass.getuser()
    if user:
        u = re.escape(user.encode())
        ids["user name in a path or address"] = re.compile(rb"(/Users/|/home/)" + u + rb"\b|\b" + u + rb"@")
    host = socket.gethostname().split(".")[0]
    if len(host) >= 4 and host.lower() != "localhost":
        ids["host name"] = re.compile(rb"\b" + re.escape(host.encode()) + rb"\b", re.I)
    try:
        email = subprocess.run([trusted_git(), "config", "user.email"], capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        email = ""
    if email:
        ids["git email"] = re.compile(re.escape(email.encode()), re.I)
    return ids


def scan(data: bytes, ids: dict) -> list[str]:
    return [k for k, pat in {**KEYS, **ids}.items() if pat.search(data)]


def _forms(p: str | Path) -> list[str]:
    """A path as written and as resolved (macOS: /var is /private/var), longest first."""
    s = {str(p), os.path.realpath(p)}
    for x in list(s):  # and the /var form of a /private/var path, which resolution hides
        if x.startswith(("/private/var/", "/private/tmp/", "/private/etc/")):
            s.add(x[len("/private"):])
    return sorted((x for x in s if len(x) > 1), key=len, reverse=True)


def redactions(cfg: dict, study: Study) -> list[tuple[re.Pattern, bytes]]:
    """Placeholders for host paths. Computing them has no side effect (no directory is made)."""
    subs = []
    for f in _forms(workspace_root_path(cfg)):
        subs.append((re.compile(re.escape(f.encode())), b"<workspaces>"))
    subs.append((re.compile(rb"/(private/)?var/tmp/cr-bench-\d+"), b"<workspaces>"))
    for f in _forms(study.dir):
        subs.append((re.compile(re.escape(f.encode())), b"<study>"))
    for var in ("CODEX_HOME", "CLAUDE_CONFIG_DIR"):
        if os.environ.get(var):
            for f in _forms(os.environ[var]):
                subs.append((re.compile(re.escape(f.encode())), f"<{var}>".encode()))
    for f in _forms(ROOT):  # the repository checkout
        subs.append((re.compile(re.escape(f.encode())), b"<repo>"))
    for f in _forms(Path.home()):
        subs.append((re.compile(re.escape(f.encode())), b"~"))
    subs += [(re.compile(rb"/Users/[^/\s\"']+"), b"/Users/<user>"), (re.compile(rb"/home/[^/\s\"']+"), b"/home/<user>")]
    return subs


def scrub(data: bytes, subs) -> tuple[bytes, int]:
    n = 0
    for pat, rep in subs:
        data, k = pat.subn(rep, data)
        n += k
    return data, n


SAFE_NAME = re.compile(r"[A-Za-z0-9._@+-]+(/[A-Za-z0-9._@+-]+)*")


def _regular(p: Path, rel: str, base: Path) -> None:
    """A regular file reached through no link: neither it nor any directory between base and it."""
    if p.is_symlink() or not p.is_file():
        raise Refused("§10", f"{rel} is not a regular file; links are never released")
    for a in p.relative_to(base).parents:
        if a != Path(".") and (base / a).is_symlink():
            raise Refused("§10", f"{rel} is reached through the link {a}; links are never released")
    if base.is_symlink():
        raise Refused("§10", f"{base} is a link; links are never released")


def _member(rel: str, ids: dict) -> None:
    """Tar member names: relative, plain characters, no dot segments, no host identifiers."""
    if not SAFE_NAME.fullmatch(rel) or any(part in (".", "..") for part in rel.split("/")):
        raise Refused("§10", f"unsafe name in the transcript asset: {rel!r}")
    if scan(rel.encode(), ids):
        raise Refused("§10 privacy", f"a transcript file name identifies the host: {rel!r}")


def _walk(top: Path):
    """Every regular file under top, never following a link; a link anywhere is refused."""
    for dp, dns, fns in os.walk(top, followlinks=False):
        for n in sorted(dns + fns):
            q = Path(dp) / n
            if q.is_symlink():
                raise Refused("§10", f"{q.relative_to(top)} is a link; links are never released")
        dns.sort()
        for n in sorted(fns):
            yield Path(dp) / n


def release(study: Study, confirm_redistribution: bool = False) -> dict:
    if not confirm_redistribution:
        raise Refused("§10 licences", "the transcript asset contains task repositories' code; confirm their licences "
                      "allow redistribution with --confirm-redistribution")
    proto = study.protocol()
    cfg = proto["frozen"]["config"]
    res_p = study.phase_dir("main") / "results.json"
    if not res_p.exists() or read_json(res_p).get("status") != "complete":
        raise Refused("§10", "release needs a complete phase-1 score; calibration is never published as findings")
    lock_rec = verify_lock(study, "main")
    out = study.dir / "release"
    if out.exists():
        raise Refused("§10", f"{out} exists; a release is made once")
    ids = host_identifiers()
    missing = [r for r in REQUIRED if not (study.dir / r).exists()]
    if missing:
        raise Refused("§10", f"required records missing: {', '.join(missing)}")
    stage = study.dir / f".release-{secrets.token_hex(4)}"
    try:
        files, hits = {}, []
        for rel in REQUIRED + [r for r in OPTIONAL if (study.dir / r).exists()]:
            src = study.dir / rel
            _regular(src, rel, study.dir)
            data = src.read_bytes()
            hits += [f"{rel}: {h}" for h in scan(data, ids)]
            dst = stage / "records" / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
            files[rel] = sha256_bytes(data)
        subs = redactions(cfg, study)
        asset_files, redacted = {}, {}
        asset = stage / "transcripts.tar.gz"
        calls = study.phase_dir("main") / "calls"
        if calls.is_symlink() or study.phase_dir("main").is_symlink():
            raise Refused("§10", "main/calls is reached through a link; links are never released")
        locked = {f"{k.replace('|', '--')}--author": v["sha256"] for k, v in lock_rec["submissions"].items()}
        with tarfile.open(asset, mode="w:gz") as tar:
            for p in sorted(_walk(calls)):
                rel = p.relative_to(study.dir).as_posix()
                _member(rel, ids)
                if not p.is_file():
                    continue
                raw = p.read_bytes()
                if p.name == "patch.diff" and p.parent.name in locked and sha256_bytes(raw) != locked[p.parent.name]:
                    raise Refused("§10", f"{rel} differs from the patch locked with the verdicts")
                data, n = scrub(raw, subs)
                hits += [f"{rel}: {h}" for h in scan(data, ids)]
                asset_files[rel] = {"source_sha256": sha256_bytes(raw), "released_sha256": sha256_bytes(data)}
                if n:
                    redacted[rel] = n
                info = tarfile.TarInfo(rel)
                info.size, info.mtime, info.mode = len(data), 946684800, 0o644
                tar.addfile(info, io.BytesIO(data))
        if hits:
            raise Refused("§10 privacy", f"{len(hits)} findings, nothing released; first: {hits[0]}")
        manifest = {"at": now(), "study_sha256": proto["frozen_sha256"], "harness_sha256": proto["frozen"].get("harness_sha256"),
                    "records": {"note": "released byte for byte; digests inside them verify", "files": files},
                    "asset": {"path": asset.name, "sha256": sha256_file(asset), "files": asset_files,
                              "note": "a redacted derivative: host paths replaced with placeholders",
                              "redactions": redacted},
                    "redistribution_confirmed": True,
                    "restricted": ["calibration transcripts (calibration results are never published as findings)"]}
        write_json(stage / "manifest.json", manifest)
        (stage / "share.md").write_text(share(stage))  # staged, so the one rename publishes everything
        os.rename(stage, out)
    finally:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
    return manifest


def share(out: Path) -> str:
    """share.md, from the released manifest only, after every referenced file is verified."""
    m = read_json(out / "manifest.json")
    for rel, h in m["records"]["files"].items():
        p = out / "records" / rel
        if not p.exists() or sha256_file(p) != h:
            raise Refused("§10", f"released file {rel} is missing or changed")
    if sha256_file(out / m["asset"]["path"]) != m["asset"]["sha256"]:
        raise Refused("§10", "the transcript asset is missing or changed")
    res = read_json(out / "records" / "main/results.json")
    cfg = read_json(out / "records" / "study.json")["frozen"]["config"]
    ew = res["equal_author_weight"]

    def pp(x):
        return "not estimable" if x is None else f"{x * 100:+.1f} points"

    def ci(c):
        return "not estimable" if not c else f"{pp(c[0])} to {pp(c[1])}"
    pilot = res["designation"] != "publication run"
    L = []
    if pilot:
        L += [f"FEASIBILITY PILOT. No effectiveness claim. ({res['designation']})", ""]
    cn = res["counts"]
    L += [f"We ran Control Rod's cross-vendor checking benchmark: {', '.join(res['authors'])} each solved the same "
          f"tasks once, and every patch was checked by the author's own model and by the other vendor's.", "",
          f"On patches that fail the hidden tests, the other-vendor checker's explicit rejection rate minus the "
          f"same-model checker's was {pp(ew['bad']['point'])} (95% CI {ci(ew['bad']['ci95'])}, equal weight across both authors).",
          f"On patches that pass them (false rejections): {pp(ew['good']['point'])} (95% CI {ci(ew['good']['ci95'])}).", "",
          f"{cn['pairs']} task-author pairs; {cn['eligible']} eligible for the contrast; {cn['a1_failed']} failed the "
          f"existing tests; not graded or not checked: {cn['ineligible']}.", ""]
    for a, gs in res["directional"].items():
        for g in ("bad", "good"):
            c = gs[g]
            if c.get("n"):
                L.append(f"- Author {a}, {g} patches: same-model {c['same_fail']['k']}/{c['n']}, cross-vendor "
                         f"{c['cross_fail']['k']}/{c['n']}, difference {pp(c['diff'])} (95% CI "
                         f"{ci((c.get('boot') or {}).get('ci95'))}); inconclusive {c['inconclusive']['same']} and "
                         f"{c['inconclusive']['cross']}.")
            else:
                L.append(f"- Author {a}, {g} patches: none, not estimable.")
    adj = res["adjudication"]
    L += ["", "Limits:",
          "- The benchmark calls the Claude Code and Codex CLIs directly, not through Control Rod's daemon.",
          "- \"Rejection\" is an explicit fail verdict, not a confirmed defect. Hidden tests are the reference.",
          "- Human sign-off (A4) was omitted from this run, so it says nothing about human time saved.",
          *[f"- {line}" for line in disclosures(res.get("environment", {}).get("container"))]]
    if adj.get("status") == "complete":
        L.append(f"- Discordant rejections were adjudicated by one person, the owner, who {adj['disclosure'].split('the owner, who ')[-1]}.")
    else:
        L.append("- Rejections were not adjudicated, so this post does not claim defects caught.")
    if cfg["cohort"].get("historical"):
        L.append("- Historical cohort: the issues may predate the models' training cutoffs.")
    sp = res["spend"]
    api = "not computed" if sp["api_equivalent_usd"] is None else f"${sp['api_equivalent_usd']:.2f}"
    L += ["- \"Not significant\" is not equivalence.", "",
          f"Spend: $0 beyond existing subscriptions (API-equivalent, for disclosure: {api}"
          f"{'; partial, ' + str(sp['calls_with_unknown_usage']) + ' calls reported no usage' if sp['calls_with_unknown_usage'] else ''}"
          f"{'; no price for ' + ', '.join(sp['unpriced_vendors']) if sp.get('unpriced_vendors') else ''}).", "",
          f"Release manifest digest: `{sha256_file(out / 'manifest.json')[:12]}`. Transcript asset digest: "
          f"`{m['asset']['sha256'][:12]}`. Study digest: `{m['study_sha256'][:12]}`.", "", "Open source, free. Try it today."]
    return "\n".join(L) + "\n"
