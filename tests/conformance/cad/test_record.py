"""Record refusals that run without CADCraft or font dependencies."""

import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DRAWINGS = ROOT / "packs/capital-projects/drawings"
SPEC = importlib.util.spec_from_file_location("render_sheet", DRAWINGS / "render_sheet.py")
rs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rs)


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.tpl = json.loads((DRAWINGS / "sheet-ansi-d.json").read_text())
        self.rec = json.loads((DRAWINGS / "examples/fdn-200-001.record.json").read_text())

    def test_drawing_number_cannot_escape_output_directory(self):
        for number in ("../x", "/tmp/x", "a/b", "..\\x", "C:\\x", "C:x", "x\x00"):
            with self.subTest(number=number):
                rec = copy.deepcopy(self.rec)
                rec["titleBlock"]["DWGNO"] = number
                with self.assertRaises(rs.SheetError):
                    rs.check_record(self.tpl, rec)

    def test_omitted_notes_do_not_assert_none(self):
        for section in self.rec["notes"]:
            with self.subTest(section=section):
                rec = copy.deepcopy(self.rec)
                del rec["notes"][section]
                with self.assertRaises(rs.SheetError):
                    rs.check_record(self.tpl, rec)

    def test_explicit_empty_notes_are_valid(self):
        self.rec["notes"] = {key: [] for key in self.rec["notes"]}
        rs.check_record(self.tpl, self.rec)

    def test_invalid_notes_cannot_assert_none(self):
        for value in (None, False, 0, "", "a note", [None], [""], ["   "]):
            with self.subTest(value=value):
                rec = copy.deepcopy(self.rec)
                rec["notes"]["holds"] = value
                with self.assertRaises(rs.SheetError):
                    rs.check_record(self.tpl, rec)

    def test_notes_must_be_an_object(self):
        for value in (None, False, 0, "", []):
            with self.subTest(value=value):
                rec = copy.deepcopy(self.rec)
                rec["notes"] = value
                with self.assertRaises(rs.SheetError):
                    rs.check_record(self.tpl, rec)

    def test_valid_record_is_accepted(self):
        rs.check_record(self.tpl, self.rec)
