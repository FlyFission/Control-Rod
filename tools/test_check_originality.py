import unittest

from check_originality import find_hits, load_denylist, normalize_words, phrase_hash


class OriginalityGateTests(unittest.TestCase):
    def test_normalization_folds_case_accents_and_punctuation(self):
        self.assertEqual(normalize_words("Café -- Q-Ship!"), ["cafe", "q", "ship"])

    def test_detects_a_denied_multiword_phrase_across_punctuation(self):
        denied = {phrase_hash(["glimmer", "kettle"])}
        self.assertEqual(find_hits("A tour of the Glimmer-Kettle works.", denied), [(1, 2)])

    def test_ignores_partial_word_matches(self):
        denied = {phrase_hash(["kettle"])}
        self.assertEqual(find_hits("kettles and teakettle", denied), [])

    def test_repository_denylist_is_hashes_only(self):
        hashes = load_denylist()
        self.assertGreater(len(hashes), 0)
        for value in hashes:
            self.assertRegex(value, r"^[0-9a-f]{64}$")

    def test_genre_words_used_by_worlds_are_allowed(self):
        hits = find_hits(
            "The Chocolate Factory, Heist Night, Starport Shipyard, Blockworks Foundry",
            load_denylist(),
        )
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
