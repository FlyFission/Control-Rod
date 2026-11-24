"""The one concurrency-locked ledger for every call in a study (DESIGN.md §9): every launch has a
unique attempt ID, the hard call cap counts every launch across resumes, phase 0 runs on its
pre-frozen allocation, phase 1 launches pass a token gate built on the frozen phase-0 95th
percentile, quota pauses are per vendor, and halts and the deadline stop everything."""

from __future__ import annotations

import fcntl
import math
import secrets
from contextlib import contextmanager
from datetime import timedelta

from .common import Refused, Study, append_jsonl, now, parse_time, read_json, read_jsonl

QUOTA_GRACE_H = 24
INFRA_HALT = 3


def p95(xs: list[int]) -> int | None:
    if not xs:
        return None
    xs = sorted(xs)
    return xs[max(0, math.ceil(0.95 * len(xs)) - 1)]


class Ledger:
    def __init__(self, study: Study):
        self.study = study
        self.path = study.ledger_path
        self.lock_path = study.dir / ".ledger.lock"
        proto = study.protocol()
        self.caps = proto["frozen"]["config"]["caps"]
        self.frozen_at = parse_time(proto["frozen_at"])

    # ------------------------------------------------------------ locks

    @contextmanager
    def locked(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    @contextmanager
    def run_lock(self):
        """One runner per study. Held for a whole run, probe, controls or evaluation; while it is
        held, any launch without a result belongs to a dead process and can be reconciled."""
        p = self.study.dir / ".run.lock"
        p.parent.mkdir(parents=True, exist_ok=True)
        f = p.open("w")
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            f.close()
            raise Refused("§9 concurrency", "another bench command is running on this study")
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
            f.close()

    # ------------------------------------------------------------ state

    def events(self) -> list[dict]:
        return read_jsonl(self.path)

    def state(self) -> dict:
        ev = self.events()
        launches = [e for e in ev if e["event"] == "launch"]
        dones = {e["launch_id"]: e for e in ev if e["event"] == "done"}
        halted = [e for e in ev if e["event"] == "halt"]
        return {"events": ev, "launches": launches, "dones": dones, "halted": halted[-1] if halted else None,
                "in_flight": [e for e in launches if e["launch_id"] not in dones]}

    def deadline(self):
        return self.frozen_at + timedelta(days=self.caps["calendar_days"])

    def frozen_p95(self) -> dict:
        p = self.study.dir / "sizing.json"
        return read_json(p).get("token_p95", {}) if p.exists() else {}

    @staticmethod
    def known_tokens(st: dict) -> int:
        return sum(d["usage"]["total"] for d in st["dones"].values() if d.get("usage", {}).get("known"))

    # ------------------------------------------------------------ gates

    def check_launch(self, st: dict, phase: str, vendor: str, role: str) -> int | None:
        if st["halted"]:
            raise Refused("§9 halt", f"the study halted: {st['halted']['why']}")
        if parse_time(now()) > self.deadline():
            raise Refused("§9 deadline", f"the frozen calendar horizon ended at {self.deadline():%Y-%m-%d %H:%M}Z")
        n = len(st["launches"])
        if n + 1 > self.caps["max_calls"]:
            raise Refused("§9 call cap", f"{n} of max_calls {self.caps['max_calls']} used")
        if phase == "calibration":
            cal = sum(1 for e in st["launches"] if e["phase"] == "calibration")
            if cal + 1 > self.caps["calibration_max_calls"]:
                raise Refused("§2 calibration allocation",
                              f"{cal} of calibration_max_calls {self.caps['calibration_max_calls']} used")
        pause = self.paused(st, vendor)
        if pause:
            raise Refused("§9 quota pause", f"{vendor} is paused until about {pause}Z; start `run` again after that")
        if phase != "main":
            return None  # phase 0: calls, timeouts, verified billing and the deadline only
        res = self.frozen_p95().get(f"{vendor}/{role}")
        if res is None:
            return None  # usage unknown in phase 0: gated on calls and time
        res = 2 * res
        outstanding = sum(e.get("reserve") or 0 for e in st["in_flight"])
        used = self.known_tokens(st)
        if used + outstanding + res > self.caps["max_tokens"]:
            raise Refused("§9 token launch gate", f"used {used} + reserved {outstanding} + next {res} "
                          f"> max_tokens {self.caps['max_tokens']}")
        return res

    def paused(self, st: dict, vendor: str) -> str | None:
        """The expected reset of this vendor's latest pause, unless a later call by the same vendor
        succeeded (ledger order, not timestamps) or the reset has passed."""
        last_pause, last_ok = None, -1
        for i, e in enumerate(st["events"]):
            if e["event"] == "quota_paused" and e["vendor"] == vendor:
                last_pause = (i, e)
            elif e["event"] == "done" and e.get("vendor") == vendor and e["status"] in ("ok", "inconclusive",
                                                                                          "author_timeout"):
                last_ok = i
        if not last_pause or last_ok > last_pause[0]:
            return None
        reset = last_pause[1]["expected_reset"]
        return reset if parse_time(now()) < parse_time(reset) else None

    # ------------------------------------------------------------ writes

    def launch(self, call: str, phase: str, vendor: str, role: str, attempt: int, launch_id: str | None = None) -> str:
        with self.locked():
            st = self.state()
            res = self.check_launch(st, phase, vendor, role)
            lid = launch_id or secrets.token_hex(8)
            append_jsonl(self.path, {"event": "launch", "launch_id": lid, "call": call, "phase": phase, "vendor": vendor,
                                     "role": role, "attempt": attempt, "reserve": res, "at": now()})
            return lid

    def is_in_flight(self, launch_id: str) -> bool:
        return any(e["launch_id"] == launch_id for e in self.state()["in_flight"])

    def launched(self, launch_id: str) -> bool:
        return any(e["launch_id"] == launch_id for e in self.state()["launches"])

    def reconcile(self, launch_id: str, rec: dict | None = None) -> bool:
        """Close a launch whose process is gone: with its saved result if there is one, otherwise
        as an interrupted infra_error with unknown usage. It still counts against the cap. Call it
        only while holding run_lock."""
        with self.locked():
            st = self.state()
            e = next((x for x in st["in_flight"] if x["launch_id"] == launch_id), None)
            if e is None:
                return False
            rec = rec or {"status": "infra_error", "why": "interrupted launch", "usage": {"known": False}}
            self._done(st, e, rec)
            return True

    def done(self, launch_id: str, rec: dict) -> None:
        with self.locked():
            st = self.state()
            e = next(x for x in st["launches"] if x["launch_id"] == launch_id)
            if launch_id in st["dones"]:
                return
            self._done(st, e, rec)

    def _done(self, st: dict, e: dict, rec: dict) -> None:
        append_jsonl(self.path, {"event": "done", "launch_id": e["launch_id"], "call": e["call"], "phase": e["phase"],
                                 "vendor": e["vendor"], "role": e["role"], "probe": e["call"].startswith("probe"),
                                 "status": rec["status"], "usage": rec.get("usage") or {"known": False},
                                 "seconds": rec.get("seconds"), "model_resolved": rec.get("model_resolved"), "at": now()})
        st = self.state()
        if rec["status"] == "quota_paused":
            self._quota(st, e["vendor"], rec)
        elif rec["status"] == "infra_error":
            if rec.get("auth"):
                self.halt(f"sign-in error from {e['vendor']}: {(rec.get('why') or '')[:200]}")
            recent = [x for x in st["events"] if x["event"] == "done" and x["status"] != "quota_paused"]
            if len(recent) >= INFRA_HALT and all(x["status"] == "infra_error" for x in recent[-INFRA_HALT:]):
                self.halt(f"{INFRA_HALT} consecutive infra errors")

    def _quota(self, st: dict, vendor: str, rec: dict) -> None:
        hours = rec.get("reset_hours") or self.caps.get("quota_reset_hours", 5)
        t = parse_time(now())
        first = None
        for e in st["events"]:
            if e["event"] == "quota_paused" and e["vendor"] == vendor:
                first = first or e
            elif e["event"] == "done" and e.get("vendor") == vendor and e["status"] in ("ok", "inconclusive",
                                                                                        "author_timeout"):
                first = None
        if first and t > parse_time(first["expected_reset"]) + timedelta(hours=QUOTA_GRACE_H):
            self.halt(f"{vendor} still blocked {QUOTA_GRACE_H} h past its expected reset")
        append_jsonl(self.path, {"event": "quota_paused", "vendor": vendor, "at": now(), "reset_hours": hours,
                                 "reset_source": "cli message" if rec.get("reset_hours") else "config default",
                                 "expected_reset": (t + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")})

    def halt(self, why: str) -> None:
        append_jsonl(self.path, {"event": "halt", "why": why, "at": now()})

    # ------------------------------------------------------------ summaries

    def summary(self) -> dict:
        st = self.state()
        by = {}
        for e in st["launches"]:
            k = f"{e['phase']}/{e['vendor']}/{e['role']}"
            b = by.setdefault(k, {"launched": 0, "statuses": {}, "known_tokens": 0, "unknown_usage": 0,
                                  "tokens": {"input": 0, "cached_input": 0, "output": 0}})
            b["launched"] += 1
            d = st["dones"].get(e["launch_id"])
            s = d["status"] if d else "in_flight"
            b["statuses"][s] = b["statuses"].get(s, 0) + 1
            u = (d or {}).get("usage") or {}
            if u.get("known"):
                b["known_tokens"] += u["total"]
                for t in b["tokens"]:
                    b["tokens"][t] += u.get(t) or 0
            else:
                b["unknown_usage"] += 1
        return {"launched": len(st["launches"]), "in_flight": len(st["in_flight"]), "halted": st["halted"],
                "max_calls": self.caps["max_calls"], "by": by, "known_tokens": self.known_tokens(st),
                "calls_with_unknown_usage": sum(b["unknown_usage"] for b in by.values())}

    def calibration_p95(self) -> dict:
        """Phase-0 95th-percentile tokens per vendor and role, from completed task calls only
        (probes and failed calls left out). Frozen into sizing.json."""
        st = self.state()
        out = {}
        for d in st["dones"].values():
            if d["phase"] != "calibration" or d.get("probe") or d["status"] not in ("ok", "inconclusive"):
                continue
            if d.get("usage", {}).get("known"):
                out.setdefault(f"{d['vendor']}/{d['role']}", []).append(d["usage"]["total"])
        return {k: p95(v) for k, v in out.items()}
