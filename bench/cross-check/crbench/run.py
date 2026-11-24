"""The run: task blocks in frozen random order, author then both checkers per patch, stability
repeats, resumable under the unchanged manifest (DESIGN.md §2, §5, §7, §9)."""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

from . import agents as ag
from .common import HERE, Refused, Study, now, read_json, sha256_bytes, write_json
from .ledger import Ledger
from .manifest import load_manifest
from .patches import capture, reapply_ok
from .preflight import denied_paths, versions_unchanged
from .workspace import base_rev, checker_tree, commit_count, export_base, new_dir, remove, tree_hash, workspace_root

TERMINAL = ("ok", "author_timeout", "inconclusive")
MAX_RETRIES_DEFAULT = 2


class Stop(Exception):
    """The run stops here; resume later under the same manifest."""


def render(template: str, **kw) -> str:
    for k, v in kw.items():
        template = template.replace("{{" + k + "}}", v)
    return template


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
        self.root = workspace_root(self.cfg)
        self.cache = study.dir / "cache"
        self.call = run_call
        self.authors = self.cfg["authors"]
        self.max_retries = self.cfg["caps"].get("max_retries", MAX_RETRIES_DEFAULT)

    # ------------------------------------------------------------ gates before any call

    def gates(self) -> None:
        cal = self.study.phase_dir("calibration")
        for src, what in ((self.pdir / "preflight.json", "preflight"), (cal / "probes.json", "isolation probes"),
                          (self.pdir / "controls.json", "grading controls")):
            if not src.exists() or not read_json(src).get("passed"):
                raise Refused("§4 §6 §9", f"{what} for {self.phase} have not passed ({src.name})")
        versions_unchanged(self.study, self.phase)
        if self.phase == "main" and not (self.study.dir / "sizing.json").exists():
            raise Refused("§2 sizing", "phase 1 needs a frozen sizing.json")

    def plan(self) -> dict:
        n = len(self.manifest["tasks"])
        k = min(2 * n, max(12, math.ceil(0.10 * 2 * n)))
        return {"tasks": n, "author_calls": 2 * n, "checker_calls_at_most": 4 * n, "stability_calls_at_most": 2 * k,
                "max_calls_left": self.cfg["caps"]["max_calls"] - len(self.ledger.state()["launches"])}

    # ------------------------------------------------------------ records

    def result(self, base: str) -> tuple[dict | None, int, int]:
        """(terminal result or None, next attempt number, infra errors so far). Quota pauses never
        count as retries. An attempt directory without a result is an interrupted call: it is
        reconciled in the ledger and recorded as infra_error."""
        n, infra = 0, 0
        while (d := self.pdir / "calls" / f"{base}-a{n}").exists():
            if not (d / "result.json").exists():
                self.ledger.reconcile(f"{self.phase}/{base}-a{n}")
                write_json(d / "result.json", {"status": "infra_error", "why": "interrupted call", "at": now()})
            r = read_json(d / "result.json")
            if r["status"] in TERMINAL:
                return r, n + 1, infra
            infra += r["status"] == "infra_error"
            n += 1
        return None, n, infra

    def other(self, author: str) -> str:
        return next(a for a in self.authors if a != author)

    def models(self, name: str, rec: dict) -> None:
        """A resolved model that changes mid-study stops the run (§9)."""
        if not rec.get("model_resolved"):
            return
        p = self.study.dir / "models.json"
        seen = read_json(p) if p.exists() else {}
        if name not in seen:
            seen[name] = rec["model_resolved"]
            write_json(p, seen)
        elif seen[name] != rec["model_resolved"]:
            self.ledger.halt(f"{name} resolved model changed from {seen[name]} to {rec['model_resolved']}")
            raise Refused("§9 model change", f"{name} now resolves to {rec['model_resolved']}, not {seen[name]}")

    def one(self, base: str, name: str, role: str, prompt: str, workspace: Path, scratch: Path | None,
            stub: dict, attempt: int) -> dict:
        vendor = self.agents[name]["vendor"]
        call = f"{self.phase}/{base}-a{attempt}"
        cdir = self.pdir / "calls" / f"{base}-a{attempt}"
        self.ledger.launch(call, self.phase, vendor, role, attempt)
        agent = ag.effective({**self.agents[name], "local_name": name})
        timeout = self.cfg["caps"]["author_timeout_s" if role == "author" else "checker_timeout_s"]
        priv = new_dir(self.root)
        try:
            rec = self.call(agent, role, prompt, workspace, scratch, cdir, denied_paths(self.study, self.root),
                            timeout, stub=stub, private=priv)
        finally:
            remove(priv)
        rec.update({"agent": name, "vendor": vendor, "base": base, "attempt": attempt, "at": now()})
        self.ledger.done(call, self.phase, vendor, role, rec)
        self.models(name, rec)
        return rec

    # ------------------------------------------------------------ author

    def author(self, tid: str, name: str) -> dict:
        base = f"{tid}--{name}--author"
        sub_p = self.pdir / "calls" / base / "submission.json"
        while True:
            if sub_p.exists():
                return read_json(sub_p)
            res, tries, infra = self.result(base)
            if res is not None:  # the call ended but the run stopped before its patch was kept
                sub = {"status": "infra_error", "why": "interrupted after the call; the patch was lost"}
            elif infra > self.max_retries:
                sub = {"status": "infra_error", "why": f"{infra} attempts failed"}
            else:
                sub = self._author_attempt(tid, name, base, tries)
                if sub is None:
                    continue  # infra_error: next attempt, under the frozen retry limit
            sub["at"] = now()
            write_json(sub_p, sub)

    def _author_attempt(self, tid: str, name: str, base: str, attempt: int) -> dict | None:
        task = self.manifest["rows"][tid]
        repo = export_base(task, self.root, self.cache)
        try:
            if commit_count(repo) != 1:
                raise Refused("§4", "exported tree has history")
            rev = base_rev(repo)
            prompt = render(self.prompts["author.md"], issue=task["problem_statement"].strip(),
                            test_rule="\n".join(f"- `{g}`" for g in self.cfg["test_path_rule"]))
            stub = {"patch_file": str(HERE / task["fixture_dir"] / "stub-fix.patch")} if task.get("fixture_dir") else {}
            rec = self.one(base, name, "author", prompt, repo, None, stub, attempt)
            if rec["status"] == "quota_paused":
                write_json(self.pdir / "calls" / f"{base}-a{attempt}" / "result.json", _slim(rec))
                raise Stop(f"{name} hit its usage limit")
            if rec["status"] == "infra_error":
                write_json(self.pdir / "calls" / f"{base}-a{attempt}" / "result.json", _slim(rec))
                return None
            if rec["status"] == "author_timeout":
                sub = {"status": "author_timeout", "why": rec.get("why")}  # partial tree discarded
            else:
                cap = capture(repo, rev, self.cfg["test_path_rule"])
                (self.pdir / "calls" / base).mkdir(parents=True, exist_ok=True)
                (self.pdir / "calls" / base / "patch.diff").write_text(cap["patch"])
                sub = {k: cap[k] for k in ("status", "sha256", "changes", "test_paths", "lines")}
                if sub["status"] == "ok":
                    ok, why = reapply_ok(task, cap["patch"], self.root, self.cache)
                    if not ok:
                        sub.update({"status": "patch_invalid", "why": f"does not re-apply: {why[:300]}"})
            write_json(self.pdir / "calls" / f"{base}-a{attempt}" / "result.json", _slim(rec))
            return sub
        finally:
            remove(repo.parent)

    # ------------------------------------------------------------ checker

    def checker(self, tid: str, author: str, role: str, rep: int) -> dict:
        """role 'same' runs the author's own agent; 'cross' runs the other vendor's."""
        base = f"{tid}--{author}--{role}--r{rep}"
        while True:
            res, tries, infra = self.result(base)
            if res is not None:
                return res
            if infra > self.max_retries:
                return {"status": "infra_error", "why": f"{infra} attempts failed"}
            self._checker_attempt(tid, author, role, base, tries)

    def _checker_attempt(self, tid: str, author: str, role: str, base: str, tries: int) -> None:
        name = author if role == "same" else self.other(author)
        task = self.manifest["rows"][tid]
        patch = (self.pdir / "calls" / f"{tid}--{author}--author" / "patch.diff").read_text()
        sub = read_json(self.pdir / "calls" / f"{tid}--{author}--author" / "submission.json")
        if sha256_bytes(patch.encode()) != sub["sha256"]:
            raise Refused("§6 digest", f"{tid}/{author} patch changed after capture")
        repo, scratch = checker_tree(task, patch, self.root, self.cache)
        try:
            before = tree_hash(repo)
            prompt = render(self.prompts["checker.md"], issue=task["problem_statement"].strip(),
                            diff=truncate_diff(patch, self.cfg["caps"].get("max_diff_chars", 60000)))
            rec = self.one(base, name, "checker", prompt, repo, scratch, {}, tries)
            rec["patch_sha256"] = sub["sha256"]
            if tree_hash(repo) != before:
                rec.update({"status": "infra_error", "why": "checker changed the source tree (policy error)"})
                self.ledger.halt(f"checker {name} changed source on {tid}")
            write_json(self.pdir / "calls" / f"{base}-a{tries}" / "result.json", _slim(rec))
            if rec["status"] == "quota_paused":
                raise Stop(f"{name} hit its usage limit")
        finally:
            remove(repo.parent)

    # ------------------------------------------------------------ the phase

    def block(self, tid: str, rep: int = 0, only: list[str] | None = None) -> None:
        """Both authors, then all four checks, for one task, before the next block starts (§9)."""
        subs = {}
        for a in self.authors:
            subs[a] = (self.author(tid, a) if rep == 0
                       else read_json(self.pdir / "calls" / f"{tid}--{a}--author" / "submission.json"))
        for a in self.authors:
            if subs[a]["status"] != "ok" or (only is not None and a not in only):
                continue  # a skipped check of an empty or invalid patch is never launched or counted
            for role in ("same", "cross"):
                self.checker(tid, a, role, rep)

    def run(self, yes: bool = False) -> dict:
        self.gates()
        plan = self.plan()
        if not yes:
            return {"status": "planned", "plan": plan}
        status = "complete"
        try:
            for t in self.manifest["block_order"]:
                self.block(t)
            for tid, a in self.stability():
                self.block(tid, rep=1, only=[a])
        except Stop as e:
            status = f"paused: {e}"
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
                if s.exists() and read_json(s)["status"] == "ok":
                    checked.append((tid, a))
        sample = stability_sample(self.manifest["seed"], checked)
        write_json(p, {"rule": "min(n, max(12, ceil(0.10 n))) by seeded hash", "n_checked": len(checked),
                       "sample": [list(x) for x in sample]})
        return sample


def _slim(rec: dict) -> dict:
    """The stored call record: no raw stdout (that stays in the call directory)."""
    return {k: v for k, v in rec.items() if k not in ("usage_raw",)} | {"usage_raw": rec.get("usage_raw")}
