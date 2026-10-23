# ELN boot matrix sign-off

Automated coverage for ticket #668 is in:

- `src/helix_core/tests/test_eln_boot_matrix.py` — `manage.py check` and
  `manage.py migrate` with the ELN package installed, then after deleting the
  ELN package directory.
- `src/shell/src/mod-system/__tests__/elnBootMatrix.test.ts` — registry-driven
  Home/Library hubs, the ELN editor slot, and ELN blocks in both compositions.

## Manual editor/workspace sign-off

Human verification is required against a running deployment before release:

- [ ] With ELN installed, open an ELN entry workspace and confirm the editor
      slot and registered blocks render.
- [ ] Remove the ELN package, restart, and confirm Home and Library remain
      navigable; an old ELN workspace link shows the unavailable state rather
      than a shell crash.

Status: **Pending human sign-off** (not executable in the isolated test
worktree).
