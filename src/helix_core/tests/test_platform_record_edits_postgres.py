"""PostgreSQL transaction guarantees for generic record-form edits."""

import threading
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4

from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from bundled.access.access.models import Grant, ProjectRole
from helix_core.core.models import Project, User
from helix_core.models import ActionExecutionReceipt, ActionLogEntry, PlatformRecord, Schema, SchemaType


@skipUnless(connection.vendor == "postgresql", "requires independent PostgreSQL connections")
class RecordEditPostgresRaceTests(TransactionTestCase):
    reset_sequences = False

    def setUp(self):
        self.user = User.objects.create_user(username=f"record_racer_{uuid4().hex[:8]}", password="pass")
        self.project = Project.objects.create(name=f"Record Race {uuid4()}")
        Grant.objects.create(project=self.project, user=self.user, role=ProjectRole.EDIT)
        schema_type = SchemaType.objects.create(
            display_name="Race", workspace_id="fixture.record-race", model="platform.record",
            columns=[{"id": "field-value", "name": "Value", "type": "number"}],
        )
        schema = Schema.objects.create(name="Race", prefix=f"R{uuid4().hex[:6]}", schema_type=schema_type)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.client.raise_request_exception = False
        self.records = [self._create_record(schema, f"Race {index}") for index in range(2)]

    def _create_record(self, schema, name):
        response = self.client.post("/api/records/", {
            "name": name,
            "project_id": self.project.pk,
            "schema_id": schema.pk,
            "field_values": {"field-value": {"type": "number", "value": 1}},
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def _payload(self, record, request_id, value=2):
        return {
            "state_token": record["state_token"],
            "request_id": request_id,
            "field_values": {"field-value": {"type": "number", "value": value}},
        }

    def _parallel_posts(self, requests):
        start = threading.Barrier(len(requests) + 1)
        results = [None] * len(requests)
        connection_ids = [None] * len(requests)

        def post(index, record_id, payload):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            start.wait(timeout=10)
            response = client.post(f"/api/records/{record_id}/form/", payload, format="json")
            results[index] = (response.status_code, response.data)
            connection_ids[index] = id(connections["default"].connection)
            connections.close_all()

        threads = [
            threading.Thread(target=post, args=(index, record_id, payload))
            for index, (record_id, payload) in enumerate(requests)
        ]
        for thread in threads:
            thread.start()
        start.wait(timeout=10)
        for thread in threads:
            thread.join(timeout=20)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertNotEqual(connection_ids[0], connection_ids[1])
        return results

    def test_identical_concurrent_form_requests_commit_once_and_recover_same_outcome(self):
        record = self.records[0]
        request_id = str(uuid4())
        payload = self._payload(record, request_id)

        results = self._parallel_posts([
            (record["id"], payload),
            (record["id"], payload),
        ])

        self.assertEqual([status for status, _ in results], [200, 200])
        self.assertEqual(results[0][1], results[1][1])
        self.assertEqual(ActionExecutionReceipt.objects.count(), 1)
        self.assertEqual(ActionLogEntry.objects.filter(action_type="edited").count(), 1)
        self.assertEqual(PlatformRecord.objects.get(pk=record["id"]).field_values["field-value"]["value"], 2)

    def test_competing_first_use_on_different_records_conflicts_without_second_writes(self):
        request_id = str(uuid4())
        requests = [
            (record["id"], self._payload(record, request_id, value=number))
            for record, number in zip(self.records, (2, 3))
        ]

        results = self._parallel_posts(requests)

        self.assertCountEqual([status for status, _ in results], [200, 409])
        self.assertEqual(ActionExecutionReceipt.objects.count(), 1)
        self.assertEqual(ActionLogEntry.objects.filter(action_type="edited").count(), 1)
        values = {
            str(record.pk): record.field_values["field-value"]["value"]
            for record in PlatformRecord.objects.filter(pk__in=[row["id"] for row in self.records])
        }
        winner_index = next(index for index, (status, _) in enumerate(results) if status == 200)
        winner_id, winner_payload = requests[winner_index]
        loser_id = requests[1 - winner_index][0]
        self.assertEqual(values[str(winner_id)], winner_payload["field_values"]["field-value"]["value"])
        self.assertEqual(values[str(loser_id)], 1)

    def test_receipt_failure_rolls_back_postgres_edit_and_allows_fresh_retry(self):
        record = self.records[0]
        payload = self._payload(record, str(uuid4()))

        with patch.object(ActionExecutionReceipt.objects, "create", side_effect=RuntimeError("receipt failed")):
            failed = self.client.post(f"/api/records/{record['id']}/form/", payload, format="json")

        current = PlatformRecord.objects.get(pk=record["id"])
        self.assertEqual(failed.status_code, 500)
        self.assertEqual(current.field_values["field-value"]["value"], 1)
        self.assertEqual(ActionLogEntry.objects.filter(action_type="edited").count(), 0)
        self.assertEqual(ActionExecutionReceipt.objects.count(), 0)

        retried = self.client.post(f"/api/records/{record['id']}/form/", payload, format="json")
        self.assertEqual(retried.status_code, 200, retried.data)
        self.assertEqual(PlatformRecord.objects.get(pk=record["id"]).field_values["field-value"]["value"], 2)
        self.assertEqual(ActionLogEntry.objects.filter(action_type="edited").count(), 1)
        self.assertEqual(ActionExecutionReceipt.objects.count(), 1)
