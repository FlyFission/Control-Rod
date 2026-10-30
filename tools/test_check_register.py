import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from check_register import COLUMNS, check_rows, overlap_report, parse_register, shingles, unregistered_markers

HEADER = "| " + " | ".join(COLUMNS) + " |\n|" + "---|" * len(COLUMNS) + "\n"


def row(**cells):
    base = {
        "Local path": "src/port.go",
        "Upstream repository": "example/upstream",
        "Commit": "a" * 40,
        "Upstream path": "pkg/port.go",
        "License": "MIT",
        "Notice retained": "yes",
        "Local changes": "renamed types",
    }
    base.update(cells)
    return "| " + " | ".join(base[c] for c in COLUMNS) + " |\n"


class RegisterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "src").mkdir()
        (self.root / "src" / "port.go").write_text("package port\n")
        lic = self.root / "third_party" / "licenses" / "example__upstream"
        lic.mkdir(parents=True)
        (lic / "LICENSE").write_text("MIT License\n")

    def tearDown(self):
        self.tmp.cleanup()

    def test_complete_row_with_retained_license_passes(self):
        header, rows = parse_register(HEADER + row())
        self.assertEqual(check_rows(header, rows, self.root), [])

    def test_refuses_copyleft_short_commit_missing_path_and_missing_evidence(self):
        for cells, expected in [
            ({"License": "AGPL-3.0"}, "permissive"),
            ({"Commit": "abc1234"}, "40 character"),
            ({"Local path": "src/missing.go"}, "does not exist"),
            ({"Upstream repository": "other/repo"}, "retained license"),
            ({"Local changes": ""}, "every column"),
        ]:
            with self.subTest(cells=cells):
                header, rows = parse_register(HEADER + row(**cells))
                self.assertTrue(any(expected in p for p in check_rows(header, rows, self.root)))

    def test_font_license_is_accepted_for_font_files_only(self):
        (self.root / "src" / "face.woff2").write_bytes(b"wOF2")
        header, rows = parse_register(HEADER + row(**{"Local path": "src/face.woff2", "License": "OFL-1.1"}))
        self.assertEqual(check_rows(header, rows, self.root), [])
        header, rows = parse_register(HEADER + row(**{"License": "OFL-1.1"}))
        self.assertTrue(any("permissive" in p for p in check_rows(header, rows, self.root)))

    def test_marked_file_without_row_is_refused(self):
        marked = self.root / "src" / "copied.ts"
        marked.write_text("// Adapted from example/upstream at a commit\nexport const x = 1;\n")
        self.assertEqual(len(unregistered_markers([marked], set(), self.root)), 1)
        self.assertEqual(unregistered_markers([marked], {"src/copied.ts"}, self.root), [])

    def test_overlap_scan_reports_unregistered_copy_only(self):
        body = "\n".join(f"value_{i} := compute(input_{i}, factor_{i})" for i in range(10)) + "\n"
        donors = self.root / "donors"
        (donors / "pkg").mkdir(parents=True)
        (donors / "pkg" / "lib.go").write_text(body)
        local = self.root / "src" / "lib.go"
        local.write_text(body)
        self.assertEqual(len(overlap_report([local], donors, set(), self.root)), 1)
        self.assertEqual(overlap_report([local], donors, {"src/lib.go"}, self.root), [])

    def test_excluded_donor_subdirectory_is_skipped(self):
        body = "\n".join(f"value_{i} := compute(input_{i}, factor_{i})" for i in range(10)) + "\n"
        donors = self.root / "donors"
        (donors / "_ours").mkdir(parents=True)
        (donors / "_ours" / "lib.go").write_text(body)
        local = self.root / "src" / "lib.go"
        local.write_text(body)
        self.assertEqual(overlap_report([local], donors, set(), self.root, exclude=("_ours",)), [])

    def test_short_and_comment_lines_do_not_create_overlaps(self):
        self.assertEqual(shingles("{\n}\n// comment line that is long enough\n" * 10), set())


if __name__ == "__main__":
    unittest.main()
