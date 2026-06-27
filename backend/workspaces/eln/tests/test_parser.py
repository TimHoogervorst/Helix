"""
Tests for the # reference parser (pure function).
"""
from django.test import SimpleTestCase

from workspaces.eln.parser import parse_references


class ParserTests(SimpleTestCase):
    def test_no_references(self):
        """Text with no # returns empty list."""
        result = parse_references("Just some normal text without references.")
        self.assertEqual(result, [])

    def test_single_eln_reference(self):
        """'see #123 for details' returns one mention with id 123."""
        result = parse_references("see #123 for details")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["type"], "id")
        self.assertEqual(result[0]["id"], 123)

    def test_multiple_references(self):
        """'used #45 and #67' returns two mentions."""
        result = parse_references("used #45 and #67")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["id"], 45)
        self.assertEqual(result[1]["id"], 67)

    def test_mixed_references(self):
        """'#eln42 and #sample7' returns correctly typed mentions."""
        result = parse_references("#eln42 and #sample7")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["type"], "eln")
        self.assertEqual(result[0]["id"], 42)
        self.assertEqual(result[1]["type"], "sample")
        self.assertEqual(result[1]["id"], 7)

    def test_number_edge_cases(self):
        """'pH 7.0 at #50' does not parse 7.0 as a reference."""
        result = parse_references("pH 7.0 at #50")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], 50)
