import unittest

from check_offline_assets import remote_references


class OfflineAssetsTests(unittest.TestCase):
    def test_finds_remote_stylesheets_fonts_and_imports(self):
        html = '<link rel="stylesheet" href="https://fonts.example.com/css2?family=X" />'
        css = '@import "https://cdn.example.com/a.css"; src: url(//fonts.example.com/x.woff2);'
        self.assertEqual(len(remote_references(html)), 1)
        self.assertEqual(len(remote_references(css)), 2)

    def test_allows_local_paths_and_svg_namespace(self):
        text = ('<link rel="preload" href="/fonts/InterVariable.woff2" />'
                'src: url("/fonts/a.woff2"); <svg xmlns="http://www.w3.org/2000/svg"></svg>')
        self.assertEqual(remote_references(text), [])


if __name__ == "__main__":
    unittest.main()
