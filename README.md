# OpenScience

Open-source ELN/LIMS for research labs. Flexible, extensible, AI-native.

> **Status:** Phase 1 scaffold — Dockerized Django + React + PostgreSQL foundation.

## Quick Start

```bash
git clone <repo-url> openscience
cd openscience
docker-compose up
```

On first run, the backend automatically:
- Runs database migrations
- Seeds initial data (superuser + entity types + root folder)

## Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Frontend (React) | http://localhost:5173 | SPA with hot-reload |
| Backend API | http://localhost:8000/api/ | DRF browseable API |
| Django Admin | http://localhost:8000/admin/ | Login: `admin` / `admin` |
| API Schema (OpenAPI) | http://localhost:8000/api/schema/ | OpenAPI 3.0 spec |
| API Docs (Swagger) | http://localhost:8000/api/docs/ | Interactive API docs |

## API Endpoints

### ELN

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/eln/entries/` | No | List entries (paginated) |
| POST | `/api/eln/entries/` | Yes | Create entry |
| GET | `/api/eln/entries/{id}/` | No | Retrieve entry |
| PUT | `/api/eln/entries/{id}/` | Yes | Update entry |
| DELETE | `/api/eln/entries/{id}/` | Yes | Delete entry |

### LIMS (read-only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/lims/entities/` | List entities (filterable by `entity_type`) |
| GET | `/api/lims/entities/{id}/` | Retrieve entity |
| GET | `/api/lims/entity-types/` | List entity types |
| GET | `/api/lims/actions/` | List actions |

### Core

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/core/folders/` | No | List root folders |
| GET | `/api/core/folders/{id}/` | No | Retrieve folder with children |
| POST | `/api/core/auth/register/` | No | Register user, returns token |
| POST | `/api/core/auth/login/` | No | Login, returns token |

## Running Tests

```bash
docker-compose exec backend python manage.py test
```

## Resetting the Environment

```bash
# Stop and remove containers, networks, and the database volume
docker-compose down -v

# Fresh start
docker-compose up
```

## Architecture

```
openscience/
├── backend/
│   ├── config/      # Django project settings, urls, wsgi
│   ├── core/        # User, Folder, base models
│   ├── eln/         # NotebookEntry, Mention, # reference parser
│   └── lims/        # Entity, EntityType, Action
├── frontend/        # React 19 SPA (Vite + TypeScript)
├── docker-compose.yml
├── Dockerfile.backend
└── Dockerfile.frontend
```

**Stack:** Python 3.12 · Django 5.1 · DRF 3.15 · PostgreSQL 16 (pgvector) · Node 22 · React 19 · Vite 6 · TypeScript 5.7

## Next Phases

- **PRD-02:** ELN Rich Editor (TipTap integration, rich text, versioning)
- **PRD-03:** LIMS Entities (full CRUD, entity type schemas, barcode scanning)
- **PRD-04:** References & Actions (# parser, mention system, action recording)
- **PRD-05:** Permissions (RBAC, group management, folder-level access control)

See [.docs/](.docs/) for architecture decisions and detailed PRDs.
