"""The one concurrency-locked ledger for every call in a study: the hard call cap, the phase-1 token
launch gate, quota pauses, consecutive-error halts and the calendar deadline (DESIGN.md §9)."""

from __future__ import annotations

import fcntl
import math
from contextlib import contextmanager
from datetime import timedelta

from .common import Refused, Study, append_jsonl, now, parse_time, read_jsonl

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
        self.caps = study.protocol()["frozen"]["config"]["caps"]
        self.frozen_at = parse_time(study.protocol()["frozen_at"])

    @contextmanager
    def locked(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

    def events(self) -> list[dict]:
        return read_jsonl(self.path)

    # ------------------------------------------------------------ state

    def state(self) -> dict:
        ev = self.events()
        launches = {e["call"]: e for e in ev if e["event"] == "launch"}
        dones = {e["call"]: e for e in ev if e["event"] == "done"}
        halted = [e for e in ev if e["event"] == "halt"]
        launch_ev = [e for e in ev if e["event"] == "launch"]
        open_ = {}
        for e in ev:  # a call ID can be launched again only after its interrupted launch is reconciled
            if e["event"] == "launch":
                open_[e["call"]] = e
            elif e["event"] == "done":
                open_.pop(e["call"], None)
        return {"events": ev, "launches": launches, "dones": dones, "halted": halted[-1] if halted else None,
                "in_flight": list(open_), "n_launch": len(launch_ev),
                "n_cal": sum(1 for e in launch_ev if e["phase"] == "calibration")}

    def deadline(self):
        return self.frozen_at + timedelta(days=self.caps["calendar_days"])

    def token_reserve(self, st: dict, vendor: str, role: str) -> int | None:
        """Twice the phase-0 95th-percentile tokens for this vendor and role, when known (§9)."""
        known = [d["usage"]["total"] for c, d in st["dones"].items()
                 if d.get("phase") == "calibration" and d.get("vendor") == vendor and d.get("role") == role
                 and d.get("usage", {}).get("known")]
        q = p95(known)
        return None if q is None else 2 * q

    def usage_totals(self, st: dict) -> dict:
        known = sum(d["usage"]["total"] for d in st["dones"].values() if d.get("usage", {}).get("known"))
        unknown = sum(1 for d in st["dones"].values() if not d.get("usage", {}).get("known"))
        return {"known_tokens": known, "calls_with_unknown_usage": unknown}

    # ------------------------------------------------------------ gates

    def check_launch(self, st: dict, phase: str, vendor: str, role: str) -> int | None:
        """Raise Refused if the next call may not start. Returns the token reservation, if any."""
        if st["halted"]:
            raise Refused("§9 halt", f"the study halted: {st['halted']['why']}")
        t = parse_time(now())
        if t > self.deadline():
            raise Refused("§9 deadline", f"the frozen calendar horizon ended at {self.deadline():%Y-%m-%d %H:%M}Z")
        calls = st["n_launch"]
        if calls + 1 > self.caps["max_calls"]:
            raise Refused("§9 call cap", f"{calls} of max_calls {self.caps['max_calls']} used")
        if phase == "calibration":
            cal = st["n_cal"]
            if cal + 1 > self.caps["calibration_max_calls"]:
                raise Refused("§2 calibration allocation",
                              f"{cal} of calibration_max_calls {self.caps['calibration_max_calls']} used")
        pause = self.paused(st, vendor)
        if pause:
            raise Refused("§9 quota pause", f"{vendor} is paused until about {pause}Z; start `run` again after that")
        if phase != "main":
            return None  # phase 0 launches on calls, timeouts, billing and the deadline only
        res = self.token_reserve(st, vendor, role)
        if res is None:
            return None  # unknown usage: gated on calls and time
        used = self.usage_totals(st)["known_tokens"]
        outstanding = sum(st["launches"][c].get("reserve") or 0 for c in st["in_flight"])
        if used + outstanding + res > self.caps["max_tokens"]:
            raise Refused("§9 token launch gate", f"used {used} + reserved {outstanding} + next {res} "
                          f"> max_tokens {self.caps['max_tokens']}")
        return res

    def paused(self, st: dict, vendor: str) -> str | None:
        """The expected reset time if this vendor's latest quota pause has not passed."""
        ps = [e for e in st["events"] if e["event"] == "quota_paused" and e["vendor"] == vendor]
        resumed = [e for e in st["events"] if e["event"] == "done" and e.get("vendor") == vendor
                   and e["status"] != "quota_paused"]
        if not ps or (resumed and resumed[-1]["at"] > ps[-1]["at"]):
            return None
        reset = ps[-1]["expected_reset"]
        return reset if parse_time(now()) < parse_time(reset) else None

    # ------------------------------------------------------------ writes

    def reconcile(self, call: str) -> bool:
        """Close an interrupted launch as infra_error with unknown usage. It still counts against the cap."""
        with self.locked():
            st = self.state()
            if call not in st["in_flight"]:
                return False
            e = st["launches"][call]
            append_jsonl(self.path, {"event": "done", "call": call, "phase": e["phase"], "vendor": e["vendor"],
                                     "role": e["role"], "status": "infra_error", "why": "interrupted launch",
                                     "usage": {"known": False}, "at": now()})
            return True

    def launch(self, call: str, phase: str, vendor: str, role: str, attempt: int) -> None:
        self.reconcile(call)
        with self.locked():
            st = self.state()
            res = self.check_launch(st, phase, vendor, role)
            append_jsonl(self.path, {"event": "launch", "call": call, "phase": phase, "vendor": vendor, "role": role,
                                     "attempt": attempt, "reserve": res, "at": now()})

    def done(self, call: str, phase: str, vendor: str, role: str, rec: dict) -> None:
        with self.locked():
            append_jsonl(self.path, {"event": "done", "call": call, "phase": phase, "vendor": vendor, "role": role,
                                     "status": rec["status"], "usage": rec.get("usage", {"known": False}),
                                     "seconds": rec.get("seconds"), "model_resolved": rec.get("model_resolved"),
                                     "at": now()})
            st = self.state()
            if rec["status"] == "quota_paused":
                self.quota(st, vendor, rec)
            elif rec["status"] == "infra_error":
                why = (rec.get("why") or "").lower()
                if any(k in why for k in ("not logged in", "not signed in", "unauthorized", "401", "login")):
                    self.halt(f"sign-in error from {vendor}: {rec.get('why', '')[:200]}")
                recent = [e for e in st["events"] if e["event"] == "done" and e["status"] != "quota_paused"]
                if len(recent) >= INFRA_HALT and all(e["status"] == "infra_error" for e in recent[-INFRA_HALT:]):
                    self.halt(f"{INFRA_HALT} consecutive infra errors")

    def quota(self, st: dict, vendor: str, rec: dict) -> None:
        hours = rec.get("reset_hours") or self.caps.get("quota_reset_hours", 5)
        t = parse_time(now())
        first = None
        for e in st["events"]:
            if e["event"] == "quota_paused" and e["vendor"] == vendor:
                first = first or e
            elif e["event"] == "done" and e.get("vendor") == vendor and e["status"] != "quota_paused":
                first = None
        if first and t > parse_time(first["expected_reset"]) + timedelta(hours=QUOTA_GRACE_H):
            self.halt(f"{vendor} still blocked {QUOTA_GRACE_H} h past its expected reset")
        append_jsonl(self.path, {"event": "quota_paused", "vendor": vendor, "at": now(),
                                 "expected_reset": (t + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")})

    def halt(self, why: str) -> None:
        append_jsonl(self.path, {"event": "halt", "why": why, "at": now()})

    def summary(self) -> dict:
        st = self.state()
        by = {}
        for d in st["dones"].values():
            k = f"{d.get('phase')}/{d.get('vendor')}/{d.get('role')}"
            b = by.setdefault(k, {"calls": 0, "known_tokens": 0, "unknown_usage": 0, "statuses": {}})
            b["calls"] += 1
            b["statuses"][d["status"]] = b["statuses"].get(d["status"], 0) + 1
            if d.get("usage", {}).get("known"):
                b["known_tokens"] += d["usage"]["total"]
            else:
                b["unknown_usage"] += 1
        return {"launched": st["n_launch"], "in_flight": st["in_flight"], "halted": st["halted"],
                "max_calls": self.caps["max_calls"], "by": by, **self.usage_totals(st)}
