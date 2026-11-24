"""Evaluate the 200-perspective front-door rubric deterministically.

Reads `inputs.json`, verifies that 10 cohorts x 20 distinct outside perspectives
(= 200 total) and 12 criteria are complete, computes weighted rubric percentages
before and after the front-door overhaul, and writes `outputs.json` with the
SHA-256 digest of `inputs.json` (AGENTS.md rule 5).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
INPUTS = HERE / "inputs.json"
OUTPUTS = HERE / "outputs.json"
MAX_SCORE = 5


def evaluate(data: dict) -> dict:
    raw_bytes = INPUTS.read_bytes()
    input_sha256 = hashlib.sha256(raw_bytes).hexdigest()

    criteria = data["criteria"]
    cohorts = data["cohorts"]
    assert len(criteria) == 12, f"expected 12 criteria, got {len(criteria)}"
    assert len(cohorts) == 10, f"expected 10 cohorts, got {len(cohorts)}"

    seen_perspectives: set[str] = set()
    total_perspectives = 0
    for cohort in cohorts:
        perspectives = cohort["perspectives"]
        assert len(perspectives) == 20, f"{cohort['id']} must have 20 perspectives"
        for p in perspectives:
            assert p not in seen_perspectives, f"duplicate perspective: {p}"
            seen_perspectives.add(p)
            total_perspectives += 1
    assert total_perspectives == 200

    crit_by_id = {c["id"]: c for c in criteria}
    cohort_results = []
    before_sum = 0.0
    after_sum = 0.0

    for cohort in cohorts:
        weights = cohort["weights"]
        assert set(weights.keys()) == set(crit_by_id.keys())
        max_possible = sum(w * MAX_SCORE for w in weights.values())
        before_pts = sum(weights[cid] * crit_by_id[cid]["before_score"] for cid in weights)
        after_pts = sum(weights[cid] * crit_by_id[cid]["after_score"] for cid in weights)
        before_pct = round(100.0 * before_pts / max_possible, 1)
        after_pct = round(100.0 * after_pts / max_possible, 1)
        gain_pp = round(after_pct - before_pct, 1)
        before_sum += before_pct
        after_sum += after_pct
        cohort_results.append(
            {
                "id": cohort["id"],
                "name": cohort["name"],
                "perspectives_count": len(cohort["perspectives"]),
                "before_pct": before_pct,
                "after_pct": after_pct,
                "gain_pp": gain_pp,
            }
        )

    criterion_lifts = []
    for c in criteria:
        total_weight = sum(ch["weights"][c["id"]] for ch in cohorts)
        weighted_lift = total_weight * (c["after_score"] - c["before_score"])
        criterion_lifts.append(
            {
                "id": c["id"],
                "name": c["name"],
                "before_score": c["before_score"],
                "after_score": c["after_score"],
                "total_cohort_weight": total_weight,
                "weighted_lift_points": weighted_lift,
            }
        )
    criterion_lifts.sort(key=lambda x: (-x["weighted_lift_points"], x["id"]))

    overall_before = round(before_sum / len(cohorts), 1)
    overall_after = round(after_sum / len(cohorts), 1)
    overall_gain = round(overall_after - overall_before, 1)

    return {
        "input_sha256": input_sha256,
        "perspectives_evaluated": total_perspectives,
        "cohorts_evaluated": len(cohorts),
        "criteria_evaluated": len(criteria),
        "overall_rubric_pct": {
            "before": overall_before,
            "after": overall_after,
            "gain_pp": overall_gain,
        },
        "cohorts": cohort_results,
        "criteria_ranked_by_lift": criterion_lifts,
        "remaining_product_gaps": data["remaining_product_gaps"],
    }


def main() -> None:
    data = json.loads(INPUTS.read_text(encoding="utf-8"))
    result = evaluate(data)
    OUTPUTS.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        f"evaluated {result['perspectives_evaluated']} perspectives across "
        f"{result['cohorts_evaluated']} cohorts: {result['overall_rubric_pct']['before']}% -> "
        f"{result['overall_rubric_pct']['after']}% (+{result['overall_rubric_pct']['gain_pp']} pp)"
    )


if __name__ == "__main__":
    main()
