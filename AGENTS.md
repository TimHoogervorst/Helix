## Running tests

Backend tests use **pytest** — a single command runs `helix_core`, `core`, and every mod's tests. Frontend tests use Vitest.

```bash
# Backend (Docker)
docker-compose exec backend pytest -n auto

# Backend (local, no Docker) — from the repo root
cd src && pytest -n auto

# Frontend
npm test
```

For local SQLite vs Docker Postgres, targeting a single mod, and CI — see `docs/agents/testing.md`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (no external PRs as a triage surface). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### Coding standards

Coding standards live under `docs/standards/`. Currently: `styling-standard.md` (theme tokens, component colour roles, typography, button hierarchy). The review skill (`/review`) picks these up automatically as standards sources.
