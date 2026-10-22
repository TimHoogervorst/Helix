"""PostgreSQL concurrency guarantees for actor-scoped Action invocations."""

import threading
from unittest import skipUnless
from uuid import uuid4

from django.db import close_old_connections, connection, connections, transaction
from django.contrib.auth.models import Group
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from bundled.access.access.models import Grant, ProjectRole, Team
from helix_core.core.models import Project, User
from helix_core.models import ActionLogEntry, RetainedContract, Schema, SchemaType
from helix_core.mod_system.contracts import canonical_json, contract_fingerprint
from helix_core.mod_system.manifest import ModManifest
from helix_core.mod_system.registry import BackendModRegistry
from helix_core.public import ModRegistrar
from helix_core.record_persistence import ProposedEffects


@skipUnless(connection.vendor == "postgresql", "requires independent PostgreSQL connections")
class ActionInvocationPostgresRaceTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.user = User.objects.create_user(username="action_racer", password="pass")
        self.project = Project.objects.create(name="Action Race")
        Grant.objects.create(project=self.project, user=self.user, role=ProjectRole.EDIT)
        schema_type = SchemaType.objects.create(
            display_name="Race", workspace_id="fixture.race", model="platform.record",
            columns=[{"id": "field-value", "name": "Value", "type": "number"}],
        )
        self.schema = Schema.objects.create(name="Race", prefix="RACE", schema_type=schema_type)
        self.registry = BackendModRegistry()
        self.registry_patch = __import__("unittest.mock").mock.patch(
            "helix_core.mod_system.registry.registry", self.registry
        )
        self.registry_patch.start()
        self.contract_id = "fixture.race.edit"
        contract = {
            "formatVersion": 1, "kind": "action", "id": self.contract_id,
            "version": "1.0.0", "description": "Edit a record",
            "definition": {
                "inputs": {"value": {"type": "number"}}, "parameters": {}, "outputs": {},
                "targets": {"record": "helix.record"}, "effects": {"record": "edited"},
            },
        }
        RetainedContract.objects.create(
            kind="action", contract_id=self.contract_id, version="1.0.0",
            fingerprint=contract_fingerprint(contract),
            canonical_envelope=canonical_json(contract).decode("utf-8"),
        )
        self.calls = 0
        self.calls_lock = threading.Lock()
        self.handler_gate = None
        registrar = ModRegistrar(ModManifest(
            id="fixture.race", display_name="Fixture Race", version="1.0.0",
            requires_helix=">=1.0.0", artifacts=("backend",), depends_on=(),
        ), self.registry)
        registrar.register_record_action(
            "edit", label="Edit", action_contract_id=self.contract_id,
            action_contract_version="1.0.0", handler=self._handle,
        )
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.post("/api/records/", {
            "name": "Race record", "project_id": self.project.pk, "schema_id": self.schema.pk,
            "field_values": {"field-value": {"type": "number", "value": 1}},
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.record = response.data

    def tearDown(self):
        self.registry_patch.stop()

    def _handle(self, context, inputs):
        with self.calls_lock:
            self.calls += 1
        if self.handler_gate is not None:
            self.handler_gate[0].set()
            if not self.handler_gate[1].wait(timeout=10):
                raise TimeoutError("test did not release Action provider")
        return ProposedEffects(field_values={
            "field-value": {"type": "number", "value": inputs["value"]},
        })

    def _payload(self, invocation_id, value=2):
        return {
            "invocationId": invocation_id,
            "sequenceFingerprint": "fixture.race:edit@1.0.0",
            "inputs": {"value": value}, "parameters": {},
            "targets": {"record": self.record["id"]},
            "expectedState": {"record": {
                "stateToken": self.record["state_token"],
                "revisionId": self.record["revision"]["id"],
                "schemaState": self.record["schema_state"],
            }},
            "providers": {"action": "fixture.race:edit"},
        }

    def _parallel_post(self, payloads):
        start = threading.Barrier(len(payloads) + 1)
        results = [None] * len(payloads)
        connection_ids = [None] * len(payloads)

        def run(index, payload):
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            start.wait(timeout=10)
            response = client.post("/api/action-invocations/", payload, format="json")
            results[index] = (response.status_code, response.data)
            connection_ids[index] = id(connections["default"].connection)
            connections.close_all()

        threads = [threading.Thread(target=run, args=(index, payload)) for index, payload in enumerate(payloads)]
        for thread in threads:
            thread.start()
        start.wait(timeout=10)
        return threads, results, connection_ids

    def test_same_invocation_race_uses_distinct_connections_and_one_provider_execution(self):
        entered, release = threading.Event(), threading.Event()
        self.handler_gate = (entered, release)
        payload = self._payload("same-invocation")
        threads, results, connection_ids = self._parallel_post([payload, payload])
        self.assertTrue(entered.wait(timeout=10))
        release.set()
        for thread in threads:
            thread.join(timeout=15)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sorted(status for status, _ in results), [200, 200])
        self.assertEqual(len(set(connection_ids)), 2)
        self.assertEqual(self.calls, 1)
        self.assertEqual(results[0][1]["actionId"], results[1][1]["actionId"])
        self.assertEqual(sorted(result[1]["replayed"] for result in results), [False, True])
        self.assertEqual(ActionLogEntry.objects.count(), 2)

    def test_stale_target_race_commits_once_and_rejects_the_second_expected_state(self):
        payloads = [self._payload("stale-race-a", 2), self._payload("stale-race-b", 3)]
        threads, results, connection_ids = self._parallel_post(payloads)
        for thread in threads:
            thread.join(timeout=15)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(len(set(connection_ids)), 2)
        self.assertEqual(sorted(status for status, _ in results), [200, 409])
        self.assertEqual(self.calls, 1)
        self.assertEqual(ActionLogEntry.objects.count(), 2)

    def test_schema_mapping_write_serializes_with_expected_state_check(self):
        locked = threading.Event()
        release = threading.Event()
        action_started = threading.Event()
        result = {}

        def change_schema():
            close_old_connections()
            with transaction.atomic():
                schema_type = SchemaType.objects.select_for_update().get(
                    pk=self.schema.schema_type_id
                )
                schema_type.columns = [{"id": "field-value", "name": "Changed", "type": "number"}]
                schema_type.save()
                locked.set()
                if not release.wait(timeout=10):
                    raise TimeoutError("test did not release Schema writer")
            connections.close_all()

        def invoke():
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            action_started.set()
            response = client.post(
                "/api/action-invocations/", self._payload("schema-race"), format="json"
            )
            result["response"] = (response.status_code, response.data)
            connections.close_all()

        schema_thread = threading.Thread(target=change_schema)
        schema_thread.start()
        self.assertTrue(locked.wait(timeout=10))
        action_thread = threading.Thread(target=invoke)
        action_thread.start()
        self.assertTrue(action_started.wait(timeout=10))
        release.set()
        schema_thread.join(timeout=15)
        action_thread.join(timeout=15)

        self.assertFalse(schema_thread.is_alive())
        self.assertFalse(action_thread.is_alive())
        self.assertEqual(result["response"][0], 409)
        self.assertEqual(self.calls, 0)
        self.assertEqual(ActionLogEntry.objects.count(), 1)

    def test_project_grant_revocation_serializes_with_authorization_check(self):
        locked = threading.Event()
        release = threading.Event()
        result = {}

        def revoke_grant():
            close_old_connections()
            with transaction.atomic():
                grant = Grant.objects.get(project_id=self.project.pk, user_id=self.user.pk)
                grant.delete()
                locked.set()
                if not release.wait(timeout=10):
                    raise TimeoutError("test did not release Grant revocation")
            connections.close_all()

        def invoke():
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            response = client.post(
                "/api/action-invocations/", self._payload("permission-race"), format="json"
            )
            result["response"] = (response.status_code, response.data)
            connections.close_all()

        revoke_thread = threading.Thread(target=revoke_grant)
        revoke_thread.start()
        self.assertTrue(locked.wait(timeout=10))
        action_thread = threading.Thread(target=invoke)
        action_thread.start()
        release.set()
        revoke_thread.join(timeout=15)
        action_thread.join(timeout=15)

        self.assertFalse(revoke_thread.is_alive())
        self.assertFalse(action_thread.is_alive())
        self.assertEqual(result["response"][0], 403)
        self.assertEqual(self.calls, 0)
        self.assertEqual(ActionLogEntry.objects.count(), 1)

    def test_project_grant_creation_serializes_with_authorization_check(self):
        Grant.objects.filter(project=self.project, user=self.user).delete()
        locked = threading.Event()
        release = threading.Event()
        result = {}

        def create_grant():
            close_old_connections()
            with transaction.atomic():
                Grant.objects.create(
                    project_id=self.project.pk, user_id=self.user.pk, role=ProjectRole.EDIT
                )
                locked.set()
                if not release.wait(timeout=10):
                    raise TimeoutError("test did not release Grant creation")
            connections.close_all()

        def invoke():
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            response = client.post(
                "/api/action-invocations/", self._payload("grant-create-race"), format="json"
            )
            result["response"] = (response.status_code, response.data)
            connections.close_all()

        grant_thread = threading.Thread(target=create_grant)
        grant_thread.start()
        self.assertTrue(locked.wait(timeout=10))
        action_thread = threading.Thread(target=invoke)
        action_thread.start()
        release.set()
        grant_thread.join(timeout=15)
        action_thread.join(timeout=15)

        self.assertFalse(grant_thread.is_alive())
        self.assertFalse(action_thread.is_alive())
        self.assertEqual(result["response"][0], 200)
        self.assertEqual(self.calls, 1)

    def _switch_to_team_access(self, *, include_member):
        from bundled.access.access.models import Organization

        Grant.objects.filter(project=self.project, user=self.user).delete()
        from bundled.access.access.models import Organization

        organization = Organization.objects.first()
        if organization is None:
            organization = Organization.objects.create(name=f"Race org {uuid4()}")
        group = Group.objects.create(name=f"Race team {uuid4()}")
        team = Team.objects.create(organization=organization, group=group)
        Grant.objects.create(project=self.project, team=team, role=ProjectRole.EDIT)
        if include_member:
            group.user_set.add(self.user)
        return group

    def _race_group_membership_change(self, *, add, expected_status, invocation_id):
        locked = threading.Event()
        release = threading.Event()
        result = {}

        def change_membership():
            close_old_connections()
            group = Group.objects.get(name=self.group.name)
            with transaction.atomic():
                if add:
                    group.user_set.add(User.objects.get(pk=self.user.pk))
                else:
                    group.user_set.remove(self.user.pk)
                locked.set()
                if not release.wait(timeout=10):
                    raise TimeoutError("test did not release group membership change")
            connections.close_all()

        def invoke():
            close_old_connections()
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.user.pk))
            response = client.post(
                "/api/action-invocations/", self._payload(invocation_id), format="json"
            )
            result["response"] = (response.status_code, response.data)
            connections.close_all()

        membership_thread = threading.Thread(target=change_membership)
        membership_thread.start()
        self.assertTrue(locked.wait(timeout=10))
        action_thread = threading.Thread(target=invoke)
        action_thread.start()
        release.set()
        membership_thread.join(timeout=15)
        action_thread.join(timeout=15)

        self.assertFalse(membership_thread.is_alive())
        self.assertFalse(action_thread.is_alive())
        self.assertEqual(result["response"][0], expected_status)

    def test_group_membership_creation_serializes_with_authorization_check(self):
        self.group = self._switch_to_team_access(include_member=False)
        self._race_group_membership_change(
            add=True, expected_status=200, invocation_id="team-member-create-race"
        )
        self.assertEqual(self.calls, 1)

    def test_group_membership_revocation_serializes_with_authorization_check(self):
        self.group = self._switch_to_team_access(include_member=True)
        self._race_group_membership_change(
            add=False, expected_status=403, invocation_id="team-member-revoke-race"
        )
        self.assertEqual(self.calls, 0)
