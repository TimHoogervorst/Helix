# ADR-0028: Preserve the `core` App Label

> Date: 2026-10-12
> Status: Accepted

The Platform owns the Django app now located at `src/helix_core/core/`, but its Django app label remains `core`. `core.User`, `core.Project`, `core.Folder`, and `core.CoreSetting` retain their labels, migration history, foreign-key references, and table names. `AUTH_USER_MODEL` remains `core.User`; no swappable-auth surgery or label-renaming migrations are permitted as part of the repository restructure.

The filesystem package path may change to make the Platform boundary visible. The Django identity does not: moving the app is structural, while its label is a persisted contract used by authentication, relations, and migrations.
