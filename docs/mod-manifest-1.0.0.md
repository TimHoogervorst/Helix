# Mod Manifest 1.0.0

This reference is generated from `src/helix_core/mod_system/manifest_schema.json`.

| Field | Required | Contract |
| --- | --- | --- |
| `id` | yes | Lowercase ASCII `vendor.name` identity. |
| `displayName` | yes | Non-empty human-readable name. |
| `version` | yes | SemVer 2.0 version. |
| `requiresHelix` | yes | npm-compatible SemVer range. |
| `artifacts` | yes | Non-empty unique array containing only `frontend` and/or `backend`. |
| `dependsOn` | yes | Array of unique `{id, version}` dependency objects. |
| `description` | no | Human-readable description. |

Unknown properties, legacy `vendor`/`name`, `coreVersion`, inline metadata, string
dependencies, duplicate entries, and `fullstack` are invalid.
