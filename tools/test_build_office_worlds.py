import json
import re
import unittest
from pathlib import Path

import build_office_worlds as worlds
import build_theme_art as art
from check_theme_assets import check_svg

ROOT = Path(__file__).resolve().parents[1]


class OfficeWorldTests(unittest.TestCase):
    """The fifteen worlds as office themes (plan task 4.9)."""

    @classmethod
    def setUpClass(cls):
        cls.out, cls.ids = worlds.render()
        cls.layout = json.loads(worlds.LAYOUT.read_text())

    def theme(self, pid):
        text = self.out[f'apps/web/src/features/office/themes/worlds/{pid}.ts']
        return json.loads(text.split('const theme: OfficeThemeV1 = ', 1)[1].rsplit(';\nexport default', 1)[0])

    def test_committed_files_are_exactly_what_the_generator_draws(self):
        # Regenerates every region, body, manifest and module from the catalogue and the layout,
        # and requires identical bytes, with nothing unowned left in the world folders.
        self.assertEqual(worlds.main(['--check']), 0, 'run python3 tools/build_office_worlds.py')

    def test_every_catalogue_world_is_ported(self):
        self.assertEqual(self.ids, [e['id'] for e in worlds.catalog()])
        self.assertEqual(len(self.ids), 15)

    def test_region_art_is_sized_to_the_canonical_layout(self):
        for pid in self.ids:
            t = self.theme(pid)
            self.assertEqual(set(t['regions']), {r['id'] for r in self.layout['regions']}, pid)
            for r in self.layout['regions']:
                a = t['regions'][r['id']]['art']
                self.assertEqual((a['width'], a['height']), (r['w'], r['h']), f"{pid} {r['id']}")
                text = self.out['apps/web/public' + a['path']]
                self.assertIn(f'width="{r["w"]}" height="{r["h"]}" viewBox="0 0 {r["w"]} {r["h"]}"', text.split('>', 1)[0])

    def test_bodies_are_the_worlds_own_cast_so_the_cast_checks_cover_them(self):
        # Each body is the floor character, unchanged, at half size: the distinct cast and per world
        # body geometry tests in test_check_theme_assets.py therefore hold for the office worlds too.
        for world, entry in enumerate(worlds.catalog()):
            t = self.theme(entry['id'])
            self.assertEqual(len(t['bodies']), 6)
            for v, body in enumerate(t['bodies']):
                text = self.out['apps/web/public' + body['path']]
                character = art.character(world, v, entry['palette'])
                inner = character.split('>', 1)[1].rsplit('</svg>', 1)[0]
                self.assertIn(f'<g transform="scale(.5)">{inner}</g>', text, f"{entry['id']} body-{v}")

    def test_every_file_passes_the_passive_svg_gate_and_its_digest(self):
        import hashlib
        for path, text in self.out.items():
            if not path.endswith('.svg'):
                continue
            self.assertEqual(check_svg(text.encode()), [], path)
            self.assertTrue(path.split('/')[-1].split('.')[1] == hashlib.sha256(text.encode()).hexdigest()[:12], path)

    def test_labels_are_short_distinct_and_never_numbers(self):
        for pid in self.ids:
            labels = [r['label'] for r in self.theme(pid)['regions'].values()]
            self.assertEqual(len(set(labels)), len(labels), pid)
            for label in labels:
                self.assertLessEqual(len(label), 32, label)
                self.assertIsNone(re.search(r'\d', label), label)

    def test_worlds_are_development_themes_only(self):
        for pid in self.ids:
            self.assertEqual(self.theme(pid)['availability'], 'development')
        released = json.loads((ROOT / 'apps/web/src/features/office/themes/released.json').read_text())
        self.assertFalse(set(released) & set(self.ids))


if __name__ == '__main__':
    unittest.main()
