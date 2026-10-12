# Validator Diagnostics

<!-- This file is generated. Do not edit it directly. -->
<!-- src/helix_core/mod_system/manifest.py: aefb417c5909e346966a4d0207d497d2d889a367aff562f9c9b8355922bea36b -->
<!-- src/helix_core/mod_system/manifest_schema.json: ef1c504ff176cd5634e6487a9edafd70d10fa40aa7ffaba080e5cf585c1cd00d -->

The validator currently exposes `ValueError` messages rather than a machine-readable diagnostic object. These labels are stable documentation anchors for the existing checks; changing a source message requires regenerating this file.

| Code | Condition | Current source evidence |
| --- | --- | --- |
| `SCHEMA` | JSON Schema validation | `Draft202012Validator` |
| `ARTIFACT_DUPLICATE` | Duplicate artifacts | `artifacts must not contain duplicates` |
| `DEPENDENCY_DUPLICATE` | Duplicate dependency IDs | `dependsOn must not contain duplicate IDs` |
| `VERSION_INVALID` | Invalid manifest SemVer | `version must be a valid SemVer` |
| `HELIX_RANGE_INVALID` | Invalid requiresHelix range | `requiresHelix must be a valid npm range` |
| `DEPENDENCY_RANGE_INVALID` | Invalid dependency range | `has an invalid npm range` |
| `FORBIDDEN_PRIVATE_HELIX_IMPORT` | External Mod imports a private `helix_core` module | Static Python import scan |
| `FORBIDDEN_CROSS_MOD_IMPORT` | Mod imports another Bundled or External Mod directly | Static Python/TypeScript import scan |

Schema failures use the JSON Schema validator's message and path. Loader failures are documented with the loader API and are not duplicated here.
