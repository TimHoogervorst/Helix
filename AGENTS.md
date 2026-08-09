## Agent skills

### Issue tracker

Issues live in GitHub Issues (no external PRs as a triage surface). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### Coding standards

Coding standards live under `docs/standards/`. Currently: `styling-standard.md` (theme tokens, component colour roles, typography, button hierarchy). The review skill (`/review`) picks these up automatically as standards sources.
