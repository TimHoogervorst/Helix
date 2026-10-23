"""Fast checks for the evidence comparison used by the deployment run."""

from __future__ import annotations

import unittest

from lifecycle_acceptance import AcceptanceFailure, _json_pointer, compare


def evidence() -> dict:
    return {
        "format_version": 1,
        "record_ids": ["record-1"],
        "record_count": 1,
        "database_tables": ["platform_record", "platform_revision"],
        "browse": {"count": 1, "record_ids": ["record-1"], "queries": [{"name": "saved", "count": 1, "record_ids": ["record-1"]}]},
        "records": [{
            "record_id": "record-1",
            "detail": {"id": "record-1", "field_values": {"eln.document": {"value": "saved"}}},
            "revisions": {"groups": [{"group_id": "group-1", "current_revision_id": "revision-2"}]},
            "exact_revisions": [{"id": "revision-1", "snapshot": {"text": "earlier"}}],
            "activity": {"count": 2, "results": [{"id": 41, "after": ["revision-2"]}]},
            "export": {"contractClosure": [{"id": "helix.eln.document", "version": "1.0.0"}]},
            "files": [{"id": "attachment-1", "revision_id": "revision-1", "sha256": "abc", "size": 3}],
        }],
    }


class EvidenceComparisonTests(unittest.TestCase):
    def test_same_record_values_revisions_actions_files_and_tables_pass(self):
        before = evidence()
        after = evidence()
        compare(before, after)

    def test_value_loss_fails_with_the_record_and_evidence_section(self):
        before = evidence()
        after = evidence()
        after["records"][0]["exact_revisions"][0]["snapshot"]["text"] = "lost"
        with self.assertRaisesRegex(AcceptanceFailure, "record-1 changed in exact_revisions"):
            compare(before, after)

    def test_activity_action_change_fails(self):
        before = evidence()
        after = evidence()
        after["records"][0]["activity"]["results"][0]["id"] = 42
        with self.assertRaisesRegex(AcceptanceFailure, "record-1 changed in activity"):
            compare(before, after)

    def test_file_hash_change_fails(self):
        before = evidence()
        after = evidence()
        after["records"][0]["files"][0]["sha256"] = "different"
        with self.assertRaisesRegex(AcceptanceFailure, "record-1 changed in files"):
            compare(before, after)

    def test_dropped_table_fails(self):
        before = evidence()
        after = evidence()
        after["database_tables"].remove("platform_revision")
        with self.assertRaisesRegex(AcceptanceFailure, "table inventory changed"):
            compare(before, after)

    def test_current_browse_count_and_search_are_checked(self):
        before = evidence()
        after = evidence()
        after["browse"]["count"] = 0
        with self.assertRaisesRegex(AcceptanceFailure, "browsing, query results, or counts changed"):
            compare(before, after)

    def test_json_pointer_reads_nested_unsupported_value(self):
        snapshot = {"document": {"content": [{"attrs": {"payload/extension": [1, 2]}}]}}
        self.assertEqual(_json_pointer(snapshot, "/document/content/0/attrs/payload~1extension"), [1, 2])

    def test_json_pointer_rejects_missing_path(self):
        with self.assertRaisesRegex(AcceptanceFailure, "missing from the saved snapshot"):
            _json_pointer({"document": {}}, "/document/content/2")


if __name__ == "__main__":
    unittest.main()
