"""
Pure-function parser for # references in ELN entry text.

Parses text like "see #123 for details" and extracts structured reference data.

No Django dependencies — pure string parsing.

>>> parse_references("")
[]
>>> parse_references("see #123 for details")
[{'type': 'id', 'id': 123}]
>>> parse_references("used #45 and #67")
[{'type': 'id', 'id': 45}, {'type': 'id', 'id': 67}]
>>> parse_references("#eln42 and #sample7")
[{'type': 'eln', 'id': 42}, {'type': 'sample', 'id': 7}]
>>> parse_references("pH 7.0 at #50")
[{'type': 'id', 'id': 50}]
"""
import re

# Pattern: # followed by optional word characters (type prefix) and then digits
# Examples: #123, #eln42, #sample7, #dna5
# Does NOT match: pH 7.0, #foo (no digits)
REFERENCE_PATTERN = re.compile(r"#([a-zA-Z]*)(\d+)")


def parse_references(text: str) -> list[dict]:
    """
    Extract # references from text.

    Returns a list of dicts, each with:
      - type: the prefix before the number (e.g., "eln", "sample", or "" for plain #123)
      - id: the integer ID referenced
    """
    if not text:
        return []

    matches = REFERENCE_PATTERN.findall(text)
    return [
        {"type": prefix.lower() if prefix else "id", "id": int(num)}
        for prefix, num in matches
    ]
