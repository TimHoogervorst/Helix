# OpenScience — Domain Glossary

> This is the canonical glossary. It defines terms, not implementation. For architecture decisions, see [.docs/architecture.md](.docs/architecture.md). For ADRs, see [docs/adr/](docs/adr/).

---

## Core Concepts

### Folder

A hierarchical container that owns Notebook Entries, Entities, and child Folders. Folders form a tree — the primary organizational structure of the system. Permissions are assigned to Folders and inherit downward.

**Synonyms:** directory, project (rejected — "project" implies a temporary endeavor; Folders are a permanent organizational structure)

### User

A person with an account. Has a username, email, password. Belongs to one or more Groups. Owns the entries and entities they create.

### Group

A named collection of Users. Groups are the unit of permission assignment — permissions are granted to Groups on Folders, not directly to Users.

---

## ELN Concepts

### Notebook Entry (or "ELN Entry")

A single page of narrative lab documentation. Has a title, rich-text content, an author, a folder, and timestamps. The primary unit of scientific narrative in the system.

An entry is the *whole thing* — metadata + document content. It is not the document.

**Invariant:** An entry belongs to exactly one Folder.

**Synonyms:** entry, ELN page, notebook page

### Rich-Text Document

The structured content *inside* a Notebook Entry. A tree of blocks (paragraphs, headings, lists, etc.) stored as a structured document format. The document is the editable, renderable content — distinct from the entry's metadata (title, author, folder, dates).

**Invariant:** A document belongs to exactly one Notebook Entry.

**Synonyms:** content, document body, editor content

### Mention

A parsed reference from one Notebook Entry to another object (another Entry, an Entity, or — later — any referenceable thing). Created when a `#` reference is found in the entry text. The Mention stores the source entry, the target object, and the surrounding context text.

**Invariant:** A Mention has exactly one source entry and exactly one target object.

**Synonyms:** reference, link, `#`-ref

### Entry Version *(deferred)*

A point-in-time snapshot of an entry's rich-text document. When a user saves changes, a new Version is created. The current document is always the latest version; older versions are immutable history.

**Synonyms:** revision, snapshot, save point

---

## LIMS Concepts

### Entity

A trackable physical or conceptual item in the lab. Has a name, a type (EntityType), an optional barcode, extensible JSON properties, and a folder. Examples: a DNA sample, a chemical reagent, a buffer solution, a piece of equipment.

An Entity is *structured data* — it has typed properties and a known schema (via its EntityType). This distinguishes it from a Notebook Entry, which is *unstructured narrative*.

**Invariant:** An Entity has exactly one EntityType.

**Synonyms:** sample (rejected — too narrow; entities include reagents, equipment, etc.), item

### Entity Type

A classification of Entities. Defines what kind of thing an Entity is (e.g., "DNA", "Chemical", "Buffer", "Equipment"). May later carry a schema that defines the JSON properties an Entity of this type can have.

**Synonyms:** sample type (rejected — same reason as above), category

### Action

A recorded operation performed on an Entity by a User. Has a type (e.g., "Used", "Created", "Measured", "Noted"), the performer, optional data (e.g., `{"volume_ul": 50}`), and an optional source Notebook Entry (the entry where this action was recorded).

Actions are **user-explicit** — the user records them deliberately. They are not inferred from text.

**Invariant:** An Action acts on exactly one Entity.

**Synonyms:** event, operation, activity

---

## Relationship Summary

```
Folder ──┬── Folder (parent/child, recursive)
         ├── NotebookEntry (1:N — entry lives in one folder)
         └── Entity (1:N — entity lives in one folder)

NotebookEntry ──▶ Mention (1:N — entry can mention many things)
Mention ──▶ NotebookEntry | Entity (target of the reference)

Entity ──▶ Action (1:N — entity has many actions recorded)
Action ──▶ NotebookEntry (N:1 — action optionally recorded in an entry)

User ──▶ NotebookEntry (1:N — author of entries)
User ──▶ Action (1:N — performer of actions)
User ──▶ Entity (1:N — creator of entities)
```

---

## Key Distinctions

### Entry vs Entity

| Dimension | Notebook Entry | Entity |
|-----------|---------------|--------|
| Nature | Unstructured narrative | Structured data |
| Content | Rich-text document (blocks) | Typed properties (JSON) |
| Identity | Title + content | Name + barcode + type |
| Lifecycle | Authored, edited, versioned | Created, tracked, acted upon |

### Entry vs Document

An **Entry** is the database record (id, title, author, folder, dates). The **Document** is the rich-text content inside it. They are 1:1 but conceptually distinct — the document format can change independently of the entry model.

### Mention vs Action

A **Mention** is a passive link: "I referenced sample #42." An **Action** is an active record: "I used 50µL of sample #42." Mentions are parsed from text; Actions are user-recorded.
