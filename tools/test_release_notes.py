"""Release notes must come out of git, not out of a hand-typed list."""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from release_notes import main as notes_main  # noqa: E402


def run_notes(from_ref: str, to_ref: str, preamble: Path | None = None) -> subprocess.CompletedProcess:
    import contextlib
    import io

    argv = ["release_notes.py", "--from", from_ref, "--to", to_ref]
    if preamble is not None:
        argv += ["--preamble", str(preamble)]
    out, err = io.StringIO(), io.StringIO()
    code = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            sys.argv = argv
            notes_main()
        except SystemExit as e:
            if isinstance(e.code, str):
                err.write(e.code + "\n")
            code = int(e.code) if isinstance(e.code, int) else 1
    return subprocess.CompletedProcess(argv, code, out.getvalue(), err.getvalue())


def subject(ref: str) -> str:
    r = subprocess.run(["git", "log", "-1", "--pretty=%s", ref], capture_output=True, text=True, check=True)
    return r.stdout.strip()


def test_lists_the_titles_of_the_range():
    out = run_notes("HEAD~2", "HEAD")
    assert out.returncode == 0, out.stdout
    lines = out.stdout.strip().splitlines()
    assert lines[0] == f"- {subject('HEAD')}"
    assert lines[1] == f"- {subject('HEAD~1')}"
    assert len(lines) == 2


def test_a_preamble_is_printed_above_the_list(tmp_path):
    p = tmp_path / "preamble.md"
    p.write_text("Control Rod v0.1.0 — first release.", encoding="utf-8")
    out = run_notes("HEAD~1", "HEAD", preamble=p)
    assert out.returncode == 0, out.stdout
    lines = out.stdout.splitlines()
    assert lines[0] == "Control Rod v0.1.0 — first release."
    assert lines[1] == ""
    assert lines[2] == f"- {subject('HEAD')}"


def test_an_empty_range_is_refused_not_printed_empty():
    out = run_notes("HEAD", "HEAD")
    assert out.returncode != 0
    assert "refusing to emit empty release notes" in out.stderr


def test_a_reversed_range_is_refused():
    out = run_notes("HEAD", "HEAD~2")
    assert out.returncode != 0
    assert "refusing to emit empty release notes" in out.stderr


def test_an_unknown_ref_fails():
    out = run_notes("HEAD", "no-such-ref-anywhere")
    assert out.returncode != 0
    assert "git log" in out.stderr
