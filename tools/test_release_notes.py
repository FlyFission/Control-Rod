"""Release notes must come out of the change records' titles, not out of a hand-typed list."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from release_notes import main as notes_main  # noqa: E402

import subprocess  # noqa: E402


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


# a9c0634a..3750b1d8 is the #182 squash, which first added the r3-distribution-prep record.
RANGE = ("a9c0634a", "3750b1d8")
TITLE = "- Basis: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow) (r3-distribution-prep)"


def test_lists_records_added_in_the_range_by_their_basis_title():
    out = run_notes(*RANGE)
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == TITLE


def test_a_record_only_modified_in_the_range_is_not_listed():
    # 95cd1f4e..9243c552 modified r2-daemon-recovery-hardening (erratum) and added no record.
    out = run_notes("95cd1f4e", "9243c552")
    assert out.returncode != 0
    assert "refusing to emit empty release notes" in out.stderr


def test_a_preamble_is_printed_above_the_list(tmp_path):
    p = tmp_path / "preamble.md"
    p.write_text("Control Rod — first release. macOS not yet verified live.", encoding="utf-8")
    out = run_notes(*RANGE, preamble=p)
    lines = out.stdout.splitlines()
    assert lines[0] == "Control Rod — first release. macOS not yet verified live."
    assert lines[1] == ""
    assert lines[2] == TITLE


def test_an_empty_range_is_refused_not_printed_empty():
    out = run_notes("HEAD", "HEAD")
    assert out.returncode != 0
    assert "refusing to emit empty release notes" in out.stderr


def test_a_reversed_range_is_refused():
    out = run_notes(RANGE[1], RANGE[0])
    assert out.returncode != 0
    assert "refusing to emit empty release notes" in out.stderr
def test_a_file_added_to_a_pre_existing_record_does_not_republish_it(tmp_path):
    # `--diff-filter=A` selects files, not directories: a record that predates the range
    # but gains a file inside it must not be listed, and must not satisfy the empty-range guard.
    repo = tmp_path / "repo"
    repo.mkdir()
    run = lambda *a: subprocess.run(["git", *a], cwd=repo, check=True, capture_output=True)
    run("init", "-b", "main")
    run("config", "user.email", "t@example.test")
    run("config", "user.name", "Test")
    old = repo / ".nuclear" / "changes" / "old-record"
    old.mkdir(parents=True)
    (old / "basis.md").write_text("# Basis: old record\n", encoding="utf-8")
    run("add", "-A")
    run("commit", "-m", "old")
    base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()
    (old / "evidence.md").write_text("later evidence\n", encoding="utf-8")
    new = repo / ".nuclear" / "changes" / "new-record"
    new.mkdir()
    (new / "basis.md").write_text("# Basis: new record\n", encoding="utf-8")
    run("add", "-A")
    run("commit", "-m", "new")
    r = subprocess.run(
        [sys.executable, str(Path(__file__).parent / "release_notes.py"), "--from", base, "--to", "HEAD"],
        cwd=repo, capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "- Basis: new record (new-record)"
    assert "old record" not in r.stdout


def test_an_unknown_ref_fails():
    out = run_notes("HEAD", "no-such-ref-anywhere")
    assert out.returncode != 0
    assert "git " in out.stderr
