import unittest
from lists import last_n

class T(unittest.TestCase):
    def test_two(self):
        self.assertEqual(last_n([1, 2, 3], 2), [2, 3])
