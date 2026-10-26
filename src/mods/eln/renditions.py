"""Deterministic, self-contained PDF rendering for reviewed document snapshots."""

from __future__ import annotations

import json
import re
import zlib
from pathlib import PurePosixPath


PRESENTATION_PROVIDER = "helix.eln.pdf"
PRESENTATION_VERSION = "1.1.0"


def _text_lines(node):
    """Flatten saved rich text in document order without loading a Mod viewer."""
    if isinstance(node, str):
        return [node]
    if isinstance(node, list):
        lines = []
        for child in node:
            lines.extend(_text_lines(child))
        return lines
    if not isinstance(node, dict):
        return []

    node_type = node.get("type")
    if node_type == "text":
        return [str(node.get("text", ""))]

    supported = {
        "doc", "paragraph", "heading", "hardBreak", "bulletList", "orderedList",
        "listItem", "blockquote", "horizontalRule", "table", "tableRow",
        "tableCell", "tableHeader", "reference", "elnProtocol", "protocol",
        "registry-table", "result-table", "elnPortableBlock", "elnPortableInline",
        "image", "attachment",
    }
    if node_type not in supported:
        raise ValueError(f"ELN content type '{node_type or 'unknown'}' cannot be rendered faithfully yet.")
    if node_type == "hardBreak":
        return [""]

    attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
    # Portable wrappers retain the original node. Render that frozen source,
    # rather than replacing scientific content with an identity placeholder.
    if node_type in {"elnPortableBlock", "elnPortableInline"}:
        source = attrs.get("source")
        if not isinstance(source, dict):
            raise ValueError("Portable ELN content is missing its frozen source node.")
        return _text_lines(source)
    if node_type in {"elnProtocol", "protocol"}:
        protocol_name = attrs.get("name")
        items = attrs.get("items")
        if not isinstance(protocol_name, str) or not isinstance(items, list):
            raise ValueError("Protocol content is incomplete and cannot be rendered faithfully.")
        lines = [protocol_name]
        states = attrs.get("stepStates") if isinstance(attrs.get("stepStates"), dict) else {}
        step = 0
        for item in items:
            if not isinstance(item, dict) or item.get("type") not in {"step", "note"} or not isinstance(item.get("text"), str):
                raise ValueError("Protocol content contains an unsupported item.")
            if item["type"] == "note":
                lines.append(f"Note: {item['text']}")
                continue
            state = states.get(str(step), states.get(step, {}))
            completed = isinstance(state, dict) and state.get("completed") is True
            timestamp = state.get("completedAt") if isinstance(state, dict) else None
            suffix = f" (completed {timestamp})" if completed and timestamp else (" (completed)" if completed else " (incomplete)")
            step += 1
            lines.append(f"{step}. {item['text']}{suffix}")
        return [*lines, ""]
    if node_type in {"registry-table", "result-table"}:
        return _structured_table_lines(attrs, node_type)
    if node_type == "reference":
        display_id = attrs.get("displayId")
        if not isinstance(display_id, str) or not display_id:
            raise ValueError("An ELN reference has no scientific identity.")
        return [display_id]
    if node_type == "tableRow":
        cells = node.get("content")
        if not isinstance(cells, list):
            raise ValueError("A scientific table row has no saved cells.")
        return [" | ".join(" ".join(_text_lines(cell)).strip() for cell in cells)]
    if node_type in {"image", "attachment"}:
        alt = node.get("attrs", {}).get("alt") or node.get("attrs", {}).get("title")
        return [f"[Embedded resource: {alt or node_type}]" ]

    children = node.get("content")
    if children is None:
        children = node.get("rows")
    if children is None:
        children = node.get("cells")
    if children is None:
        children = node.get("value")
    lines = _text_lines(children)
    if node_type in {"paragraph", "heading", "listItem", "tableRow", "registry-table"}:
        return [*lines, ""]
    return lines


def _display_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def _structured_table_lines(attrs, node_type):
    """Render the persisted column and row values shown by ELN data blocks."""
    columns, rows = attrs.get("columns"), attrs.get("rows")
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise ValueError(f"{node_type} is missing its saved columns or rows.")
    names = []
    for column in columns:
        if not isinstance(column, dict) or not isinstance(column.get("name"), str):
            raise ValueError(f"{node_type} contains a column without a readable name.")
        names.append(column["name"])
    title = attrs.get("title") or ("Registry Table" if node_type == "registry-table" else "Result Table")
    lines = [str(title)]
    schema_name = attrs.get("schemaName")
    if schema_name:
        lines.append(f"Schema: {schema_name}")
    if node_type == "registry-table":
        names = ["Name", *names]
    else:
        names = ["Entity", *names]
    lines.append(" | ".join(names))
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("values", {}), dict):
            raise ValueError(f"{node_type} contains a malformed saved row.")
        if node_type == "registry-table":
            cells = [row.get("__name", ""), *[row["values"].get(name) for name in names[1:]]]
            identity = row.get("displayId")
            registered = row.get("isRegistered") is True
            cells[0] = " ".join(part for part in (_display_value(cells[0]), _display_value(identity) if registered else "") if part)
        else:
            cells = [row.get("displayId") or row.get("sourceEntityId", ""), *[row["values"].get(name) for name in names[1:]]]
        lines.append(" | ".join(_display_value(cell) for cell in cells))
    return [*lines, ""]


def capture_external_evidence(*, manifest, project_id, actor):
    """Freeze exact revisions for registered entities referenced by ELN tables."""
    from rest_framework.exceptions import ValidationError
    from helix_core.models import PlatformRecord, RecordRevisionGroup
    from helix_core.public import effective_role

    document = (manifest.get("groups") or {}).get("document", {}).get("snapshot", {})
    record_ids = set()

    def visit(value):
        if isinstance(value, dict):
            if isinstance(value.get("recordId"), str) and value["recordId"]:
                record_ids.add(value["recordId"])
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(document)
    if not record_ids:
        return {}
    records = {str(record.pk): record for record in PlatformRecord.objects.filter(pk__in=record_ids, project_id=project_id)}
    missing = sorted(record_ids - records.keys())
    if missing:
        raise ValidationError({"evidence": f"Referenced ELN evidence is unavailable in this Project: {', '.join(missing)}."})
    evidence = {}
    for record_id in sorted(record_ids):
        record = records[record_id]
        if effective_role(actor, record) not in {"read", "edit"}:
            raise ValidationError({"evidence": f"You no longer have permission to capture referenced record {record.display_id}."})
        groups = {}
        for group in RecordRevisionGroup.objects.filter(record=record).select_related("current_revision").order_by("group_key"):
            revision = group.current_revision
            if revision is None:
                raise ValidationError({"evidence": f"Referenced record {record.display_id} has no current revision for '{group.group_key}'."})
            groups[group.group_key] = {
                "group_id": str(group.pk), "revision_id": str(revision.pk),
                "sequence": revision.sequence, "content_hash": revision.content_hash,
                "snapshot": revision.snapshot,
            }
        evidence[record_id] = {
            "record_id": record_id, "display_id": record.display_id, "name": record.name,
            "state_token": str(record.state_token), "groups": groups,
        }
    return evidence


def _attachment_ids(value):
    if isinstance(value, dict):
        if value.get("type") == "attachmentReference":
            ref = value.get("value")
            if isinstance(ref, dict) and isinstance(ref.get("id"), str):
                yield ref["id"]
        for child in value.values():
            yield from _attachment_ids(child)
    elif isinstance(value, list):
        for child in value:
            yield from _attachment_ids(child)


def embedded_resource_count(snapshot):
    return 1 + len(set(_attachment_ids(snapshot)))


def _resource_files(snapshot, project_id):
    """Load and verify saved attachment resources so the PDF has no live links."""
    from django.core.files.storage import default_storage
    from rest_framework.exceptions import ValidationError

    from helix_core.public import verify_attachment_content
    from helix_core.public import PlatformAttachment

    ids = sorted(set(_attachment_ids(snapshot)))
    if not ids:
        return []
    rows = PlatformAttachment.objects.filter(pk__in=ids, project_id=project_id)
    by_id = {str(row.pk): row for row in rows}
    files = []
    for resource_id in ids:
        row = by_id.get(resource_id)
        if row is None or row.status != "complete":
            raise ValidationError({"document": f"Saved attachment resource '{resource_id}' is unavailable."})
        verify_attachment_content(row.storage_key, row.size, row.sha256)
        with default_storage.open(row.storage_key, "rb") as stream:
            files.append((row.filename, row.media_type, stream.read()))
    return files


def _safe_pdf_name(value):
    value = PurePosixPath(str(value).replace("\\", "/")).name
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return value[:120] or "resource.bin"


def _pdf_bytes(lines, embedded_files, *, title):
    """Write a small PDF using only PDF-native fonts and embedded file streams."""
    wrapped = []
    for line in lines:
        line = str(line).replace("\t", "    ")
        while len(line) > 96:
            wrapped.append(line[:96])
            line = line[96:]
        wrapped.append(line)
    if not wrapped:
        wrapped = ["(empty document)"]
    pages = [wrapped[index:index + 50] for index in range(0, len(wrapped), 50)]

    objects: list[bytes | None] = [None]

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects) - 1

    catalog_id = add(b"")
    pages_id = add(b"")
    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    page_ids = []
    for page_lines in pages:
        commands = [b"BT /F1 10 Tf 48 792 Td 13 TL"]
        for line in page_lines:
            encoded = line.encode("cp1252", errors="strict")
            commands.append(b"<" + encoded.hex().encode("ascii") + b"> Tj T* ")
        commands.append(b"ET")
        stream = b"\n".join(commands)
        content_id = add(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n"
            + stream + b"\nendstream"
        )
        page_id = add(
            b"<< /Type /Page /Parent " + str(pages_id).encode("ascii")
            + b" 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 "
            + str(font_id).encode("ascii") + b" 0 R >> >> /Contents "
            + str(content_id).encode("ascii") + b" 0 R >>"
        )
        page_ids.append(page_id)

    file_specs = []
    for filename, media_type, content in embedded_files:
        filename = _safe_pdf_name(filename)
        compressed = zlib.compress(content)
        stream_id = add(
            b"<< /Type /EmbeddedFile /Subtype /"
            + re.sub(r"[^A-Za-z0-9#]", "", media_type.replace("/", "#2F")).encode("ascii")
            + b" /Params << /Size " + str(len(content)).encode("ascii") + b" >> /Filter /FlateDecode /Length "
            + str(len(compressed)).encode("ascii") + b" >>\nstream\n"
            + compressed + b"\nendstream"
        )
        spec_id = add(
            b"<< /Type /Filespec /F (" + filename.encode("ascii", "replace")
            + b") /UF (" + filename.encode("ascii", "replace")
            + b") /EF << /F " + str(stream_id).encode("ascii") + b" 0 R >> >>"
        )
        file_specs.append((filename, spec_id))

    names_id = 0
    if file_specs:
        names = b" ".join(
            b"(" + filename.encode("ascii", "replace") + b") "
            + str(spec_id).encode("ascii") + b" 0 R"
            for filename, spec_id in file_specs
        )
        names_id = add(b"<< /Names [" + names + b"] >>")

    objects[pages_id] = (
        b"<< /Type /Pages /Kids ["
        + b" ".join(str(page_id).encode("ascii") + b" 0 R" for page_id in page_ids)
        + b"] /Count " + str(len(page_ids)).encode("ascii") + b" >>"
    )
    catalog = b"<< /Type /Catalog /Pages " + str(pages_id).encode("ascii") + b" 0 R"
    if names_id:
        catalog += b" /Names << /EmbeddedFiles " + str(names_id).encode("ascii") + b" 0 R >>"
    objects[catalog_id] = catalog + b" >>"
    info_id = add(
        b"<< /Title (" + _safe_pdf_name(title).encode("ascii")
        + b") /Producer (Helix ELN review PDF renderer 1.1.0) >>"
    )

    output = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id, body in enumerate(objects[1:], start=1):
        offsets.append(len(output))
        output.extend(f"{object_id} 0 obj\n".encode("ascii"))
        output.extend(body or b"null")
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects)}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        b"trailer\n<< /Size " + str(len(objects)).encode("ascii")
        + b" /Root " + str(catalog_id).encode("ascii") + b" 0 R /Info "
        + str(info_id).encode("ascii") + b" 0 R >>\nstartxref\n"
        + str(xref_offset).encode("ascii") + b"\n%%EOF\n"
    )
    return bytes(output)


def render_document_pdf(*, entry_name, revision_snapshot, project_id):
    """Render a frozen document snapshot and embed its source and used files."""
    document = revision_snapshot.get("document", {})
    if not isinstance(document, dict) or document.get("type") != "doc":
        raise ValueError("The saved Revision does not contain a valid ELN document.")
    source = json.dumps(
        revision_snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")
    resources = [("source-document.json", "application/json", source)]
    resources.extend(_resource_files(document, project_id))
    lines = [entry_name, "Historical Rendition of the saved ELN document", ""]
    description = revision_snapshot.get("reviewed_description")
    if isinstance(description, str) and description.strip():
        lines.extend([description.strip(), ""])
    lines.extend(_text_lines(document))
    return _pdf_bytes(lines, resources, title=f"{entry_name} historical rendition")


def render_review_manifest(*, manifest, project_id):
    """Render the immutable ELN inputs supplied by Platform review."""
    metadata = manifest.get("reviewed_metadata") or {}
    groups = manifest.get("groups") or {}
    document_group = groups.get("document")
    if not isinstance(document_group, dict) or not isinstance(document_group.get("snapshot"), dict):
        raise ValueError("The registered ELN document Revision is missing from the submission manifest.")
    snapshot = document_group["snapshot"]
    description = metadata.get("description", "")
    if isinstance(description, str) and description.strip():
        # Keep the exact reviewed description with the captured document source.
        snapshot = {**snapshot, "reviewed_description": description, "review_manifest": manifest}
    else:
        snapshot = {**snapshot, "review_manifest": manifest}
    pdf = render_document_pdf(
        entry_name=metadata.get("name") or "Untitled ELN entry",
        revision_snapshot=snapshot,
        project_id=project_id,
    )
    evidence = manifest.get("captured_external_evidence") or {}
    if not evidence:
        return pdf
    # Include the captured identities and exact revisions in the human-readable
    # review rendition; the full snapshots also remain embedded as JSON source.
    lines = [metadata.get("name") or "Untitled ELN entry", "External evidence", ""]
    for record_id, item in sorted(evidence.items()):
        lines.append(f"{item.get('display_id', record_id)} — {item.get('name', '')}".rstrip())
        for group_key, revision in sorted((item.get("groups") or {}).items()):
            lines.append(f"{group_key}: revision {revision.get('sequence')} ({revision.get('revision_id')})")
    evidence_pdf = _pdf_bytes(lines, [], title=f"{metadata.get('name') or 'ELN entry'} external evidence")
    # Keep the main document's faithful content and retain external-evidence
    # details as embedded JSON, avoiding an unstructured string rewrite of PDF.
    return _append_evidence_page(pdf, evidence_pdf)


def _append_evidence_page(document_pdf, evidence_pdf):
    """Append a rendered evidence page using pypdf without rasterizing it."""
    from io import BytesIO
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(BytesIO(document_pdf))
    evidence = PdfReader(BytesIO(evidence_pdf))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    for page in evidence.pages:
        writer.add_page(page)
    for name, content in reader.attachments.items():
        writer.add_attachment(name, content[0] if isinstance(content, list) else content)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()
