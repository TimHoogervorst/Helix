# Security Policy

## Supported Versions

Helix is in active pre-1.0 development. Security updates are provided for the
current development branch only.

| Version | Supported          |
| ------- | ------------------ |
| `master` (development) | :white_check_mark: |
| < 1.0 (any tag) | :x:                |

Once a stable 1.0 release ships, we will adopt semantic versioning with security
support for the latest major version.

## Reporting a Vulnerability

**Do not report security vulnerabilities via public GitHub issues.**

Instead, please email **security@openscience.dev** (or the repository owner directly).
You should receive an initial response within 48 hours.

### What to Include

- A description of the vulnerability and its potential impact
- Steps to reproduce, including environment details (Docker, browser, etc.)
- Any proof-of-concept code or screenshots (please redact sensitive data)

### Disclosure Process

1. Reporter submits vulnerability via email.
2. Maintainers acknowledge receipt within 48 hours and begin investigation.
3. Once confirmed, a fix is developed and tested.
4. A security advisory is published on GitHub, crediting the reporter (unless anonymity is requested).
5. The fix is merged and deployed.

We follow coordinated disclosure: the fix is released concurrently with the advisory.
No advance notice is given beyond the maintainer team.

## Security Considerations

Helix is a lab data management system. Key security boundaries:

- **Authentication & Authorization**: Access control via Django's auth system.
  RBAC (Reader / Creator / Designer / Admin roles at the folder level) is planned
  but not yet enforced (Phase 5). Until then, assume all authenticated users have
  full access.
- **API Tokens**: DRF `TokenAuthentication` is available. Tokens are bearer tokens —
  protect them like passwords. Token creation is currently manual (Django admin).
- **Rich Content (ELN entries)**: ELN content is stored as TipTap/ProseMirror JSON,
  not raw HTML. Rendering uses a controlled serializer that produces safe HTML,
  eliminating stored-XSS risks from rich text content.
- **Django Admin**: The `/admin/` interface gives full database access. In production,
  restrict it by IP or disable it entirely.
- **Dev Configuration**: The Docker Compose setup uses default credentials
  (`admin`/`admin`, `openscience`/`openscience` for PostgreSQL) and a hardcoded
  `SECRET_KEY`. These are **not safe for production**. For any deployment beyond
  local development:
  - Change all passwords
  - Generate a strong `SECRET_KEY`
  - Set `DEBUG=false`
  - Restrict `ALLOWED_HOSTS`
  - Use HTTPS (terminate TLS at a reverse proxy)
- **PostgreSQL**: The database port is exposed on `localhost:5432` in dev. In
  production, remove the `ports` binding and use Docker network isolation.
- **Dependencies**: Django, DRF, and all Python/Node dependencies should be kept
  up to date. Enable Dependabot or similar automated updates for the repository.
