"""Per-job wall time and cap margins for the CI timeout proposal.

Reads job-times.input.csv (one row per job per run: started_at and completed_at of the
GitHub check run) and prints seconds per run, the max, and cap / max for each proposed cap.
The caps below are the proposal under review; they are policy choices, not measurements.
Usage: python3 job-times.py job-times.input.csv > job-times.txt
"""
import csv
import statistics
import sys
from datetime import datetime

CAPS_MINUTES = {"typescript": 20, "rust": 30, "go": 15, "python": 15,
                "licenses": 15, "change-records": 10, "sbom": 10}


def seconds(row):
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return int((datetime.strptime(row["completed_at"], fmt)
                - datetime.strptime(row["started_at"], fmt)).total_seconds())


def main(path):
    per_job, runs = {}, set()
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            per_job.setdefault(row["job"], []).append(seconds(row))
            runs.add(row["run_id"])
    missing = set(CAPS_MINUTES) - set(per_job)
    if missing:
        sys.exit(f"jobs with a proposed cap but no data: {sorted(missing)}")
    print(f"Control Rod CI per-job wall time, {len(runs)} runs, {sum(map(len, per_job.values()))} job timings")
    print("(started_at to completed_at of each check run, so it includes runner setup)\n")
    print(f"{'job':15} {'runs':>4} {'min s':>6} {'median s':>9} {'max s':>6} {'cap min':>8} {'cap / max':>10}")
    for job in sorted(per_job, key=lambda j: -max(per_job[j])):
        values = per_job[job]
        cap = CAPS_MINUTES[job]
        print(f"{job:15} {len(values):>4} {min(values):>6} {int(statistics.median(values)):>9} "
              f"{max(values):>6} {cap:>8} {cap * 60 / max(values):>9.1f}x")


if __name__ == "__main__":
    main(sys.argv[1])
