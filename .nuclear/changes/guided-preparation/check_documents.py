"""Check this planning packet's local links, requirement coverage and whitespace.

Run from the repository or exported packet root:
    python3 .nuclear/changes/guided-preparation/check_documents.py
This checks documentation structure, not product behavior or design adequacy.
"""

from pathlib import Path
import re

root = Path(__file__).resolve().parents[3]
packet = root / ".nuclear/changes/guided-preparation"
spec_path = root / "docs/superpowers/specs/2026-10-22-guided-preparation-design.md"
plan_path = root / "docs/superpowers/plans/2026-10-22-guided-preparation.md"
files = sorted(packet.glob("*.md")) + [spec_path, plan_path]
errors = []
for path in files:
    content = path.read_text()
    for target in re.findall(r"\]\(([^)]+)\)", content):
        if "://" not in target and not target.startswith("#"):
            if not (path.parent / target.split("#")[0]).exists():
                errors.append(f"{path.name}: unresolved local link {target}")
    if re.search(r"\b(TODO|TBD|FIXME)\b", content):
        errors.append(f"{path.name}: unresolved placeholder")
    for number, line in enumerate(content.splitlines(), 1):
        if line.rstrip() != line:
            errors.append(f"{path.name}:{number}: trailing whitespace")

spec = spec_path.read_text()
plan = plan_path.read_text()
for number in range(1, 19):
    for token in [f"GP-{number:02}", f"AC-{number:02}"]:
        if token not in spec:
            errors.append(f"Missing specification ID {token}")
    if not re.search(rf"^\| GP-{number:02} \|", plan, re.MULTILINE):
        errors.append(f"Missing task coverage GP-{number:02}")
tasks = re.findall(r"^## Task (\d+):", plan, re.MULTILINE)
if tasks != [str(number) for number in range(1, 11)]:
    errors.append("Tasks must be numbered 1 through 10 exactly once")
print(f"Inspected {len(files)} Markdown files, 18 requirement/scenario pairs, 10 tasks.")
if errors:
    print("\n".join(errors))
    raise SystemExit(1)
print("PASS: local links, IDs, task coverage, placeholders and whitespace.")
