"""Lint the site role briefs against the paths a real run has.

A run workspace holds the agent's own results in `out/`, earlier packages' results in
`inputs/deps/<package id>/`, this package's deliverables (for a pre-check) in
`inputs/deliverables/`, and the pack's templates, typicals and examples in `inputs/pack/`.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PACK = Path(__file__).resolve().parents[1]
ROLES = PACK / "roles"
BRIEFS = sorted(p for p in ROLES.glob("*.md") if not p.name.endswith(".tools.md"))

# What each stage writes to its own out/. Anything else named here is someone else's result.
STAGE_FILES = {"parcel.json", "constraints.json", "program.json", "layout.json"}
OWN = {
    "site-parcel.md": {"parcel.json"},
    "site-constraints.md": {"constraints.json"},
    "site-charter.md": {"program.json"},
    "site-plan.md": {"layout.json"},
    "site-next-stage.md": set(),
}

FENCE = re.compile(r"```.*?```", re.DOTALL)
INLINE = re.compile(r"`([^`\n]+)`")


def code_tokens(text: str) -> list[str]:
    """Every whitespace-separated token inside inline code spans and fenced blocks."""
    spans = [m.group(0).strip("`") for m in FENCE.finditer(text)]
    spans += INLINE.findall(FENCE.sub("", text))
    tokens: list[str] = []
    for span in spans:
        for tok in re.split(r"[\s=\"']+", span):
            tok = tok.strip(".,;:()[]{}")
            if tok:
                tokens.append(tok)
    return tokens


def test_there_are_briefs_to_lint():
    names = {p.name for p in BRIEFS}
    assert {"site-pre-check.md", "site-plan-pre-check.md", *OWN} <= names


@pytest.mark.parametrize("brief", BRIEFS, ids=lambda p: p.name)
def test_no_brief_names_the_old_in_folder(brief: Path):
    bad = [t for t in code_tokens(brief.read_text()) if t.startswith("in/")]
    assert not bad, f"{brief.name} names {bad}; a pre-check reads inputs/deliverables/"


@pytest.mark.parametrize("brief", BRIEFS, ids=lambda p: p.name)
def test_every_pack_path_a_brief_names_exists(brief: Path):
    for tok in code_tokens(brief.read_text()):
        if tok.startswith("inputs/pack/"):
            rel = tok.removeprefix("inputs/pack/").rstrip("/")
            assert (PACK / rel).exists(), f"{brief.name} names {tok}, which the pack does not ship"


@pytest.mark.parametrize("name", sorted(OWN))
def test_no_author_reads_a_dependency_from_out(name: str):
    text = (ROLES / name).read_text()
    others = STAGE_FILES - OWN[name]
    bad = sorted(f"out/{f}" for f in others if f"out/{f}" in text)
    assert not bad, f"{name} reads {bad} from out/; dependencies arrive in inputs/deps/"
