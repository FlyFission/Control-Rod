import unittest

from check_public_claims import sentence_findings


class PublicClaimsTests(unittest.TestCase):
    def test_refuses_bare_present_tense_claims(self):
        for text in [
            "Every package runs in a sandbox.",
            "A sandbox limits what each agent can touch.",
            "It runs fully air-gapped.",
            "Evidence is independently witnessed.",
        ]:
            with self.subTest(text=text):
                self.assertTrue(sentence_findings(text))

    def test_allows_qualified_claims(self):
        for text in [
            "Work is designed to run in a sandbox.",
            "Sandboxed runs (planned).",
            "The web app is not yet air-gap ready, so it is not air-gapped.",
            "Control Rod is not a certification.",
        ]:
            with self.subTest(text=text):
                self.assertEqual(sentence_findings(text), [])

    def test_distant_unrelated_qualifier_does_not_excuse_a_claim(self):
        text = ("Both modes share the same controls: work packages, sandboxed runs, custody of evidence, "
                "independent verification, signed decisions, and organization floors that no project can loosen.")
        self.assertEqual(sentence_findings(text), ["sandboxed runs"])

    def test_qualifier_in_another_sentence_does_not_excuse_a_claim(self):
        self.assertEqual(
            sentence_findings("Confinement is planned. Every package runs in a sandbox."),
            ["runs in a sandbox"],
        )


if __name__ == "__main__":
    unittest.main()
