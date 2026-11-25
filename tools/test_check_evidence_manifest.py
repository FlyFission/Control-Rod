"""The evidence-manifest convention check. Existing records stay valid; a cited missing file without a manifest fails."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECK = ROOT / "tools" / "check_evidence_manifest.py"


def run(tree: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(CHECK), str(tree)], capture_output=True, text=True)


def test_existing_style_and_new_style_pass_and_manifest_less_absence_fails() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old = root / "old"
        (old / "evidence").mkdir(parents=True)
        (old / "evidence" / "run.log").write_text("present")
        (old / "verification.md").write_text("see `evidence/run.log`\n")
        new = root / "new"
        (new / "evidence").mkdir(parents=True)
        (new / "evidence" / "manifest.json").write_text(
            json.dumps({"store": "mirror", "files": [{"path": "evidence/run.log", "sha256": "ab" * 32}]})
        )
        bad = root / "bad"
        bad.mkdir()
        (bad / "verification.md").write_text("see `evidence/gone.log`\n")
        first = run(root)
        assert first.returncode != 0
        assert "bad: cites `evidence/gone.log`" in first.stdout
        assert "old:" not in first.stdout
        assert "new:" not in first.stdout
        (bad / "verification.md").write_text("no cited file\n")
        second = run(root)
        assert second.returncode == 0, second.stdout
