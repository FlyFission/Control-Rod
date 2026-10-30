"""Fail when public text states an assurance the code does not yet provide.

Scans README.md and web UI strings for present-tense isolation, air-gap,
witnessing, certification and compliance claims. A sentence passes when it
carries a qualifier close to the claim ("not", "planned", "designed to", "will", ...), so the
honest "designed to run in a sandbox (planned)" form is allowed while the bare
"runs in a sandbox" form is refused. Workbench spec WB-00.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLAIMS = [
    r"runs? in (?:a|its own) sandbox",
    r"sandbox(?:es)? limits?",
    r"sandboxed runs?",
    r"fully air[- ]?gapped",
    r"air[- ]?gapped",
    r"tamper[- ]?proof",
    r"independently witnessed",
    r"\bcertified\b",
    r"\bcompliant\b",
    r"\bguarantee[sd]?\b",
]
QUALIFIERS = re.compile(
    r"\b(?:not|no|never|planned|designed to|will|until|future|roadmap|aims? to|intended)\b",
    re.IGNORECASE,
)
CLAIM = re.compile("|".join(CLAIMS), re.IGNORECASE)
SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")


BEFORE, AFTER = 120, 20


def sentence_findings(text: str) -> list[str]:
    """Return claim phrases with no qualifier close to them in the same sentence.

    The qualifier must sit within BEFORE characters ahead of the claim or AFTER
    characters behind it, so an unrelated "no" elsewhere in a long sentence
    cannot excuse a claim.
    """
    found = []
    for sentence in SENTENCE.findall(text):
        for match in CLAIM.finditer(sentence):
            window = sentence[max(0, match.start() - BEFORE):match.end() + AFTER]
            if not QUALIFIERS.search(window):
                found.append(match.group(0))
    return found


def public_files(root: Path = ROOT) -> list[Path]:
    files = [root / "README.md"]
    web = root / "apps" / "web" / "src"
    if web.exists():
        files += [
            p for p in web.rglob("*")
            if p.suffix in {".ts", ".tsx"} and ".test." not in p.name and not p.name.endswith(".d.ts")
        ]
    return [p for p in files if p.is_file()]


def main() -> int:
    problems = []
    for path in public_files():
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for phrase in sentence_findings(line):
                problems.append(f"{path.relative_to(ROOT)}:{line_no}: unqualified claim '{phrase}'")
    for problem in problems:
        print(problem)
    if problems:
        print(f"{len(problems)} public claim finding(s); qualify the sentence or remove the claim")
        return 1
    print("public claims check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
