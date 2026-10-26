"""Deterministic, self-contained PDF rendering for reviewed document snapshots."""

from __future__ import annotations

import json
import re
import zlib
from pathlib import PurePosixPath


PRESENTATION_PROVIDER = "helix.eln.pdf"
PRESENTATION_VERSION = "1.0.0"


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
        "tableCell", "tableHeader", "registry-table",
    }
    if node_type not in supported:
        raise ValueError(f"ELN content type '{node_type or 'unknown'}' cannot be rendered faithfully yet.")
    if node_type == "hardBreak":
        return [""]

    # Keep unknown portable Blocks visible without invoking their runtime.
    if node_type in {"elnPortableBlock", "elnPortableInline"}:
        return [f"[Portable content: {node.get('attrs', {}).get('id', 'unknown')}]" ]
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
        + b") /Producer (Helix ELN snapshot PDF renderer 1.0.0) >>"
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
    return render_document_pdf(
        entry_name=metadata.get("name") or "Untitled ELN entry",
        revision_snapshot=snapshot,
        project_id=project_id,
    )
