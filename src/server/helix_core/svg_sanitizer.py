"""Server-side SVG sanitization for uploaded custom icons.

Accepts raw SVG markup, validates it has a single root ``<svg>`` with a
``viewBox``, strips dangerous elements and attributes, and returns
clean markup suitable for inline rendering.
"""

import re
import xml.etree.ElementTree as ET

MAX_SIZE_BYTES = 50 * 1024  # 50 KB

SVG_NAMESPACE = "http://www.w3.org/2000/svg"

_ALLOWED_ELEMENTS = frozenset({
    "svg", "g", "path", "circle", "ellipse", "line", "polyline",
    "polygon", "rect", "text", "tspan", "tref", "textPath",
    "defs", "use", "image", "clipPath", "mask", "linearGradient",
    "radialGradient", "stop", "pattern", "filter",
    "feBlend", "feColorMatrix", "feComponentTransfer",
    "feComposite", "feConvolveMatrix", "feDiffuseLighting",
    "feDisplacementMap", "feDistantLight", "feDropShadow",
    "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
    "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
    "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
    "feSpotLight", "feTile", "feTurbulence",
    "title", "desc", "metadata",
})

_SCRIPT_TAG = "script"

_DANGEROUS_ATTR_PATTERN = re.compile(r"^on", re.IGNORECASE)

_HREF_RE = re.compile(r"^#", re.I)


class SvgSanitizationError(ValueError):
    """Raised when SVG markup fails sanitization."""


def sanitize_svg(raw: str) -> str:
    """Validate and sanitize *raw* SVG markup.

    Returns clean SVG markup as a string.

    Raises :class:`SvgSanitizationError` when the markup:
    * exceeds the 50 KB size cap,
    * cannot be parsed as XML,
    * is not rooted at a single ``<svg>`` element,
    * lacks a ``viewBox`` attribute,
    * contains ``<script>`` elements,
    * contains event-handler attributes (``on…``), or
    * contains external URL references.
    """
    raw_bytes = raw.encode("utf-8")
    if len(raw_bytes) > MAX_SIZE_BYTES:
        raise SvgSanitizationError(
            f"SVG payload exceeds {MAX_SIZE_BYTES // 1024} KB size limit."
        )

    try:
        root = ET.fromstring(raw_bytes)
    except ET.ParseError as exc:
        raise SvgSanitizationError(f"Invalid XML: {exc}") from exc

    tag = _local_tag(root.tag)
    if tag != "svg":
        raise SvgSanitizationError(
            f"Root element must be <svg>, got <{tag}>."
        )

    view_box = root.get("viewBox", "").strip()
    if not view_box:
        raise SvgSanitizationError("SVG must define a viewBox attribute.")

    _sanitize_element(root)

    root.attrib.pop("width", None)
    root.attrib.pop("height", None)
    root.attrib.pop("{http://www.w3.org/2000/xmlns/}xmlns", None)

    ET.register_namespace("", SVG_NAMESPACE)
    body = ET.tostring(root, encoding="unicode")
    return _strip_declaration(body)


def _local_tag(tag: str) -> str:
    """Return the local name of an XML tag, stripping any namespace."""
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag


def _sanitize_element(element: ET.Element) -> None:
    """Recursively strip dangerous attributes and script elements."""
    tag = _local_tag(element.tag)

    if tag == _SCRIPT_TAG:
        raise SvgSanitizationError(
            "<script> elements are not allowed in uploaded SVGs."
        )

    if tag not in _ALLOWED_ELEMENTS:
        raise SvgSanitizationError(
            f"Element <{tag}> is not allowed in uploaded SVGs."
        )

    for attr_name in list(element.attrib.keys()):
        if _DANGEROUS_ATTR_PATTERN.match(attr_name):
            raise SvgSanitizationError(
                f"Event handler attribute '{attr_name}' is not allowed."
            )

        if _is_external_ref(attr_name, element.attrib[attr_name]):
            raise SvgSanitizationError(
                f"External reference in '{attr_name}' is not allowed."
            )

    for child in element:
        _sanitize_element(child)


def _is_external_ref(attr_name: str, value: str) -> bool:
    """Return ``True`` if *value* looks like an external URL."""
    if not value or not isinstance(value, str):
        return False

    local_attr = _local_tag(attr_name).lower()
    if local_attr in ("href", "xlink:href"):
        value_stripped = value.strip()
        if _HREF_RE.match(value_stripped):
            return False
        if "://" in value_stripped:
            return True
        if value_stripped.startswith("//"):
            return True
        if "javascript:" in value_stripped.lower():
            return True

    return False


def _strip_declaration(body: str) -> str:
    """Remove any XML declaration line from the serialized SVG."""
    lines = body.splitlines()
    if lines and lines[0].lstrip().startswith("<?xml"):
        lines = lines[1:]
    return "\n".join(lines)
