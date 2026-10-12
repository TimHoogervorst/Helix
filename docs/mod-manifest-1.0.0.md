# Mod Manifest Fields

<!-- This file is generated. Do not edit it directly. -->
<!-- src/helix_core/mod_system/manifest_schema.json: ef1c504ff176cd5634e6487a9edafd70d10fa40aa7ffaba080e5cf585c1cd00d -->

| Field | Required | JSON type | Contract |
| --- | --- | --- | --- |
| `id` | yes | `string` | pattern `^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$` |
| `displayName` | yes | `string` | minimum length 1 |
| `version` | yes | `string` | pattern `^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$` |
| `requiresHelix` | yes | `string` | minimum length 1 |
| `artifacts` | yes | `array` | minimum items 1; unique items |
| `dependsOn` | yes | `array` | unique items; items are `{id, version}` objects |
| `description` | no | `string` | as defined by the schema |
