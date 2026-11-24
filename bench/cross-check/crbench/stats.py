"""Statistics with no third-party dependencies (DESIGN.md §2, §7). Full precision throughout;
only the report rounds."""

from __future__ import annotations

import math
import random

Z95 = 1.959963984540054
Z80 = 1.2815515655446004  # two-sided 80% interval; its lower end is the frozen "lower 80% Wilson bound"


def wilson(k: int, n: int, z: float = Z95) -> list[float] | None:
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [max(0.0, c - h), min(1.0, c + h)]


def wilson80_lower(k: int, n: int) -> float | None:
    w = wilson(k, n, Z80)
    return None if w is None else w[0]


def mcnemar_exact(b: int, c: int) -> float | None:
    """Two-sided exact McNemar p-value from the discordant counts."""
    n = b + c
    if n == 0:
        return None
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return min(1.0, 2 * tail)


def kappa(pairs: list[tuple[str, str]], cats=("pass", "fail", "inconclusive")) -> float | None:
    """Cohen's kappa; None when it is undefined (chance agreement of 1)."""
    n = len(pairs)
    if n == 0:
        return None
    po = sum(a == b for a, b in pairs) / n
    pe = sum((sum(a == c for a, _ in pairs) / n) * (sum(b == c for _, b in pairs) / n) for c in cats)
    if pe >= 1:
        return None
    return (po - pe) / (1 - pe)


def percentile(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    i = q * (len(xs) - 1)
    lo, hi = math.floor(i), math.ceil(i)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def cluster_bootstrap(clusters: list, stat, B: int, seed) -> dict:
    """Resample whole clusters (tasks) with replacement. stat(list_of_clusters) -> float or None.
    Replicates where the statistic is not estimable are dropped and counted."""
    rng = random.Random(f"{seed}:bootstrap")
    vals, dropped = [], 0
    n = len(clusters)
    if n == 0:
        return {"ci95": None, "B": B, "dropped": B}
    for _ in range(B):
        s = [clusters[rng.randrange(n)] for _ in range(n)]
        v = stat(s)
        if v is None:
            dropped += 1
        else:
            vals.append(v)
    if len(vals) < 0.5 * B:
        return {"ci95": None, "B": B, "dropped": dropped}
    return {"ci95": [percentile(vals, 0.025), percentile(vals, 0.975)], "B": B, "dropped": dropped}
