"""The run (DESIGN.md §2, §5, §7, §9): task blocks in frozen random order, both authors then all
four checks, stability repeats, resumable under the unchanged manifest.

Each attempt has its own directory and a unique launch ID claimed before launch. An author
attempt commits its patch and submission before its result, and the ledger closes the launch
last, so a crash at any point is reconciled from what is on disk. Retries that run out stop the
run as incomplete; they are never cached as done."""

from __future__ import annotations

import hashlib
import math
import re
import secrets
from pathlib import Path

from . import agents as ag
from . import container as ctr
from .common import HERE, Refused, Study, load_sizing, now, read_json, sha256_bytes, stamp, write_bytes, write_json
from .ledger import Ledger
from .manifest import load_manifest
from .patches import capture, identity, reapply_ok
from .preflight import denied_paths, live_billing_check, versions_unchanged
from .workspace import base_rev, checker_tree, commit_count, export_base, new_dir, remove, tree_hash, workspace_root

TERMINAL = ("ok", "author_timeout", "inconclusive")
MAX_RETRIES_DEFAULT = 2


class Stop(Exception):
    """The run stops here; resume later under the same manifest."""


def render(template: str, **kw) -> str:
    """One pass, so a `{{...}}` inside an issue or a diff is never substituted again."""
    pat = re.compile(r"\{\{(" + "|".join(map(re.escape, kw)) + r")\}\}")
    return pat.sub(lambda m: kw[m.group(1)], template)


def truncate_diff(diff: str, limit: int) -> str:
    """One truncation rule for both checkers (§5)."""
    if len(diff) <= limit:
        return diff
    return diff[:limit] + f"\n[diff truncated at {limit} characters; read the changed files for the rest]\n"


def stability_sample(seed, checked: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """min(n, max(12, ceil(0.10 n))) of the n checked patches, ranked by a seeded hash fixed
    before any verdict exists (§7)."""
    n = len(checked)
    k = min(n, max(12, math.ceil(0.10 * n)))
    rank = sorted(checked, key=lambda p: hashlib.sha256(f"{seed}:stability:{p[0]}:{p[1]}".encode()).hexdigest())
    return sorted(rank[:k])


def gate_ok(rec_path: Path, want: dict) -> tuple[bool, str]:
    if not rec_path.exists():
        return False, "missing"
    r = read_json(rec_path)
    if not r.get("passed"):
        return False, "did not pass"
    for k, v in want.items():
        if r.get("stamp", {}).get(k) != v:
            return False, f"was made for a different {k.replace('_sha256', '')}"
    return True, ""


class Runner:
    def __init__(self, study: Study, phase: str, run_call=ag.run_call):
        self.study, self.phase = study, phase
        self.proto = study.protocol()
        self.cfg = self.proto["frozen"]["config"]
        self.agents = self.proto["frozen"]["agents"]
        self.prompts = self.proto["frozen"]["prompts"]
        self.pdir = study.phase_dir(phase)
        self.manifest = load_manifest(study, phase)
        self.ledger = Ledger(study)
        self.root = workspace_root(self.cfg, study.dir)
        self.cache = study.dir / "cache"
        self.call = run_call
        self.authors = self.cfg["authors"]
        pf = study.phase_dir("calibration") / "preflight.json"  # the image phase 0 pinned
        pre = read_json(pf) if pf.exists() else {}
        self.image_pin = ((pre.get("container") or {}).get("image") or {}).get("id")
        self.label = ctr.study_label(study.dir)
        self.max_retries = self.cfg["caps"].get("max_retries", MAX_RETRIES_DEFAULT)

    # ------------------------------------------------------------ gates before any call

    def gates(self) -> None:
        if self.proto["frozen"].get("harness_sha256") != stamp(self.study)["harness_sha256"]:
            raise Refused("§9 manifest", "the harness code changed since the study was frozen; start a new study")
        cal = self.study.phase_dir("calibration")
        want = stamp(self.study, self.phase)
        for path, what, keys in ((self.pdir / "preflight.json", "preflight", ("study_sha256", "harness_sha256")),
                                 (cal / "probes.json", "isolation probes", ("study_sha256", "harness_sha256")),
                                 (self.pdir / "controls.json", "grading controls",
                                  ("study_sha256", "harness_sha256", "manifest_sha256"))):
            ok, why = gate_ok(path, {k: want[k] for k in keys})
            if not ok:
                raise Refused("§4 §6 §9", f"{what} for {self.phase}: {why}")
        versions_unchanged(self.study)
        live_billing_check(self.study)
        if self.phase == "main":
            sz = load_sizing(self.study)
            if sz is None:
                raise Refused("§2 sizing", "phase 1 needs a frozen sizing.json")
            if self.manifest.get("sizing_sha256") != sz["sha256"]:
                raise Refused("§2 sizing", "the phase-1 manifest was not drawn from this sizing.json")

    def plan(self) -> dict:
        n = len(self.manifest["tasks"])
        k = min(2 * n, max(12, math.ceil(0.10 * 2 * n)))
        return {"tasks": n, "author_calls": 2 * n, "checker_calls_at_most": 4 * n, "stability_calls_at_most": 2 * k,
                "max_calls_left": self.cfg["caps"]["max_calls"] - len(self.ledger.state()["launches"])}

    # ------------------------------------------------------------ attempts

    def attempts(self, base: str) -> tuple[dict | None, int, int]:
        """(terminal result or None, next attempt number, infra errors so far). An attempt that
        was claimed but never launched is skipped; one launched without a result is reconciled
        as interrupted. Quota pauses never count as retries."""
        n, infra = 0, 0
        while (d := self.pdir / "calls" / f"{base}-a{n}").exists():
            claim = read_json(d / "claim.json") if (d / "claim.json").exists() else None
            res = d / "result.json"
            if not res.exists():
                if (d / "pgid").exists():  # the harness died mid-call: make sure the CLI did too
                    try:
                        ag.kill_group(int((d / "pgid").read_text()))
                    except ValueError:
                        pass
                if claim and (d / "container.json").exists():  # and that its container is gone
                    ctr.remove(claim["launch_id"])
                if claim and self.ledger.launched(claim["launch_id"]):
                    self.ledger.reconcile(claim["launch_id"])
                    write_json(res, {"status": "infra_error", "why": "interrupted call", "at": now()})
                else:
                    write_json(res, {"status": "not_launched", "at": now()})
            r = read_json(res)
            if claim and self.ledger.is_in_flight(claim["launch_id"]):
                self.ledger.reconcile(claim["launch_id"], r)  # the result was saved, the ledger was not closed
            if r["status"] in TERMINAL:
                return r, n + 1, infra
            infra += r["status"] == "infra_error"
            n += 1
        return None, n, infra

    def other(self, author: str) -> str:
        return next(a for a in self.authors if a != author)

    def models(self, name: str, rec: dict) -> None:
        """A resolved model that changes mid-study stops the run (§9). A call whose model cannot
        be read is recorded as unverified, never described as pinned."""
        p = self.study.dir / "models.json"
        seen = read_json(p) if p.exists() else {}
        if rec.get("status") not in ("ok", "inconclusive"):
            return  # a failed call says nothing about the model
        m = rec.get("model_resolved")
        entry = seen.setdefault(name, {"resolved": None, "unverified_calls": 0, "requested": rec.get("model_requested")})
        if not m:
            entry["unverified_calls"] += 1
        elif entry["resolved"] is None:
            entry["resolved"] = m
        elif entry["resolved"] != m:
            write_json(p, seen)
            raise Refused("§9 model change", f"{name} now resolves to {m}, not {entry['resolved']}")
        write_json(p, seen)

    def ws(self, repo: Path, scratch: Path | None, private: Path, agent: dict) -> dict:
        return {"workspace": repo, "scratch": scratch, "private": private, "deny": denied_paths(self.study, self.root),
                "read_allow": [str(Path(p).expanduser()) for p in agent.get("read_allow", [])]}

    def launch(self, base: str, name: str, role: str, attempt: int) -> tuple[Path, str, dict]:
        d = self.pdir / "calls" / f"{base}-a{attempt}"
        d.mkdir(parents=True, exist_ok=False)
        lid = secrets.token_hex(8)
        write_json(d / "claim.json", {"launch_id": lid, "at": now()})
        self.ledger.launch(f"{self.phase}/{base}-a{attempt}", self.phase, self.agents[name]["vendor"],
                           "author" if role == "author" else "checker", attempt, lid)
        a = ag.effective(self.agents[name], name)
        if a["kind"] != "stub":  # every real call runs in the image preflight pinned (container.py)
            if not self.image_pin or not ctr.settings(self.cfg):
                raise Refused("§4 container", "real agents need the container settings and a pinned image")
            a["_container"] = {"cfg": self.cfg, "image": self.image_pin, "lid": lid, "label": self.label,
                              "root": str(self.root)}
        return d, lid, a

    def call_agent(self, agent: dict, role: str, prompt: str, repo: Path, scratch: Path | None, d: Path,
                   stub: dict) -> dict:
        timeout = self.cfg["caps"]["author_timeout_s" if role == "author" else "checker_timeout_s"]
        priv = new_dir(self.root)
        try:
            return self.call(agent, role, prompt, self.ws(repo, scratch, priv, agent), d, timeout, stub=stub)
        finally:
            remove(priv)

    def finish(self, d: Path, lid: str, name: str, rec: dict) -> None:
        """Result first, then the model check (whose halt rides on the same ledger line), then
        the ledger's done, so a crash between them can only leave a launch to reconcile."""
        rec.update({"agent": name, "vendor": self.agents[name]["vendor"], "at": now()})
        write_json(d / "result.json", rec)
        try:
            self.models(name, rec)
        except Refused as e:
            self.ledger.done(lid, {**rec, "halt": str(e)})
            raise
        self.ledger.done(lid, rec)
        if rec["status"] == "quota_paused":
            raise Stop(f"{name} hit its usage limit")

    # ------------------------------------------------------------ author

    def author(self, tid: str, name: str) -> dict:
        base = f"{tid}--{name}--author"
        ptr = self.pdir / "calls" / base / "submission.json"
        while True:
            if ptr.exists():
                return read_json(ptr)
            res, n, infra = self.attempts(base)
            if res is not None:
                d = self.pdir / "calls" / f"{base}-a{n - 1}"
                if not (d / "submission.json").exists():
                    raise Stop(f"{tid}/{name}: attempt a{n - 1} ended but its patch was not kept; the run is incomplete")
                self._promote(base, d)
                continue
            if infra > self.max_retries:
                raise Stop(f"incomplete: {tid}/{name} author failed {infra} times")
            self._author_attempt(tid, name, base, n)

    def _promote(self, base: str, d: Path) -> None:
        bdir = self.pdir / "calls" / base
        write_bytes(bdir / "patch.diff", (d / "patch.diff").read_bytes() if (d / "patch.diff").exists() else b"")
        sub = read_json(d / "submission.json")
        sub["attempt"] = d.name
        write_json(bdir / "submission.json", sub)

    def _author_attempt(self, tid: str, name: str, base: str, attempt: int) -> None:
        task = self.manifest["rows"][tid]
        repo = export_base(task, self.root, self.cache)
        ident = identity(repo)
        try:
            if commit_count(repo) != 1:
                raise Refused("§4", "exported tree has history")
            base_rev(repo)
            prompt = render(self.prompts["author.md"], issue=task["problem_statement"].strip(),
                            test_rule="\n".join(f"  - `{g}`" for g in self.cfg["test_path_rule"]))
            stub = {"patch_file": str(HERE / task["fixture_dir"] / "stub-fix.patch")} if task.get("fixture_dir") else {}
            d, lid, agent = self.launch(base, name, "author", attempt)
            rec = self.call_agent(agent, "author", prompt, repo, None, d, stub)
            if rec["status"] == "ok":
                cap = capture(repo, task, self.root, self.cache, self.cfg["test_path_rule"], ident)
                sub = {k: cap[k] for k in ("status", "sha256", "tree_oid", "changes", "test_paths", "lines",
                                           "skipped_special_files")}
                if sub["status"] == "ok":
                    ok, got = reapply_ok(task, cap["patch"], cap["tree_oid"], self.root, self.cache)
                    if not ok:
                        sub.update({"status": "patch_invalid", "why": f"re-applied tree {got[:12]} differs"})
                write_bytes(d / "patch.diff", cap["patch"])
                write_json(d / "submission.json", {**sub, "at": now()})
            elif rec["status"] == "author_timeout":
                write_json(d / "submission.json", {"status": "author_timeout", "why": rec.get("why"), "at": now()})
            self.finish(d, lid, name, rec)
        finally:
            remove(repo.parent)

    # ------------------------------------------------------------ checker

    def checker(self, tid: str, author: str, role: str, rep: int) -> dict:
        """role 'same' runs the author's own agent; 'cross' runs the other vendor's."""
        base = f"{tid}--{author}--{role}--r{rep}"
        while True:
            res, n, infra = self.attempts(base)
            if res is not None:
                return res
            if infra > self.max_retries:
                raise Stop(f"incomplete: {tid}/{author}/{role}/r{rep} check failed {infra} times")
            self._checker_attempt(tid, author, role, base, n)

    def _checker_attempt(self, tid: str, author: str, role: str, base: str, attempt: int) -> None:
        name = author if role == "same" else self.other(author)
        task = self.manifest["rows"][tid]
        bdir = self.pdir / "calls" / f"{tid}--{author}--author"
        patch = (bdir / "patch.diff").read_bytes()
        sub = read_json(bdir / "submission.json")
        if sha256_bytes(patch) != sub["sha256"]:
            raise Refused("§6 digest", f"{tid}/{author} patch changed after capture")
        repo, scratch = checker_tree(task, patch, self.root, self.cache)
        try:
            before = tree_hash(repo)
            changed = "\n".join(f"{c['status']}\t{' -> '.join(c['paths'])}" for c in sub["changes"])
            prompt = render(self.prompts["checker.md"], issue=task["problem_statement"].strip(),
                            diff=truncate_diff(patch.decode(errors="replace"), self.cfg["caps"].get("max_diff_chars", 60000)),
                            changed=changed,
                            scratch=ctr.SCRATCH if self.agents[name]["kind"] != "stub" else str(scratch))
            d, lid, agent = self.launch(base, name, "checker", attempt)
            rec = self.call_agent(agent, "checker", prompt, repo, scratch, d, {})
            rec["patch_sha256"] = sub["sha256"]
            rec["prompt_sha256"] = sha256_bytes(prompt.encode())
            if tree_hash(repo) != before:
                rec.update({"status": "infra_error", "why": "checker changed the source tree (policy error)"})
                write_json(d / "result.json", rec)
                self.ledger.done(lid, {**rec, "halt": f"checker {name} changed source on {tid}"})
                raise Refused("§5 policy", f"checker {name} changed the source tree on {tid}")
            self.finish(d, lid, name, rec)
        finally:
            remove(repo.parent)

    # ------------------------------------------------------------ the phase

    def block(self, tid: str, rep: int = 0, only: list[str] | None = None) -> None:
        """Both authors, then all four checks, for one task, before the next block starts (§9)."""
        subs = {a: (self.author(tid, a) if rep == 0 else
                    read_json(self.pdir / "calls" / f"{tid}--{a}--author" / "submission.json")) for a in self.authors}
        for a in self.authors:
            if subs[a]["status"] != "ok" or (only is not None and a not in only):
                continue  # an empty or invalid patch is never checked, and no call is counted for it
            for role in ("same", "cross"):
                self.checker(tid, a, role, rep)

    def run(self, yes: bool = False) -> dict:
        self.gates()
        plan = self.plan()
        if not yes:
            return {"status": "planned", "plan": plan}
        status = "complete"
        with self.ledger.run_lock():
            if ctr.settings(self.cfg):  # containers a crash or an interrupt left behind; only under the lock
                ctr.reconcile(self.label)
            try:
                for t in self.manifest["block_order"]:
                    self.block(t)
                for tid, a in self.stability():
                    self.block(tid, rep=1, only=[a])
            except Stop as e:
                status = str(e) if str(e).startswith("incomplete") else f"paused: {e}"
            except Refused as e:
                status = f"stopped: {e}"
        rec = {"at": now(), "status": status, "plan": plan, "ledger": self.ledger.summary()}
        write_json(self.pdir / "run.json", rec)
        return rec

    def stability(self) -> list[tuple[str, str]]:
        p = self.pdir / "stability.json"
        if p.exists():
            return [tuple(x) for x in read_json(p)["sample"]]
        checked = []
        for tid in self.manifest["tasks"]:
            for a in self.authors:
                s = self.pdir / "calls" / f"{tid}--{a}--author" / "submission.json"
                if read_json(s)["status"] == "ok":
                    checked.append((tid, a))
        sample = stability_sample(self.manifest["seed"], checked)
        write_json(p, {"rule": "min(n, max(12, ceil(0.10 n))) by seeded hash", "n_checked": len(checked),
                       "sample": [list(x) for x in sample]})
        return sample
