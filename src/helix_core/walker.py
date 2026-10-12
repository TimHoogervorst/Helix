"""
Shared TipTap/ProseMirror JSON tree walker.

The walker handles all traversal — recursing into ``content[]`` arrays,
nested dicts, and arbitrary lists of dicts.  Each caller supplies a
handler invoked for every dict node; the handler decides what to do
based on the node's ``type`` (or any other property).

This module has zero domain knowledge.  It imports nothing from
``lims``, ``eln``, or ``references``.
"""
from typing import Callable


def walk_tiptap_tree(root: dict, handler: Callable[[dict], dict | None]) -> dict:
    """
    Walk a TipTap/ProseMirror JSON tree depth-first.

    *handler* is called for every dict node in the tree.  It may return:

    * A ``dict`` — the node is replaced with the returned dict.
    * ``None`` — the node is left unchanged.

    The walker recurses into:

    * ``content`` arrays (TipTap child nodes)
    * Nested dict values (e.g., ``attrs``)
    * Arbitrary lists of dicts (e.g., ``attrs.rows``)

    Non-dict list items (strings, numbers) are passed through unchanged.

    Returns a (possibly identical) copy of *root*.  The input tree is
    never mutated — handlers that return ``None`` get back the original
    node.  Multi-pass patterns (collect, then patch) are supported:
    call ``walk_tiptap_tree`` once per pass.
    """
    if not isinstance(root, dict):
        return root

    # Call handler on this node.
    result = handler(root)

    # Treat "returned the same object" as no-change, same as None.
    if result is not None and result is not root:
        node_replaced = True
        node = result
    else:
        node_replaced = False
        node = root

    # Walk children, tracking whether any child changed identity.
    children_modified = False
    new_children: dict = {}

    for key, value in node.items():
        if isinstance(value, list):
            new_list = []
            for item in value:
                new_item = walk_tiptap_tree(item, handler)
                if new_item is not item:
                    children_modified = True
                new_list.append(new_item)
            new_children[key] = new_list
        elif isinstance(value, dict):
            new_val = walk_tiptap_tree(value, handler)
            new_children[key] = new_val
            if new_val is not value:
                children_modified = True
        else:
            new_children[key] = value

    # Nothing changed — return the original root.
    if not children_modified and not node_replaced:
        return root

    # Only the handler replaced this node; children unchanged.
    if not children_modified and node_replaced:
        return node

    # Children were modified.  Build the result node, starting from the
    # handler's replacement (if any) or a shallow copy of the original.
    result_node = result if node_replaced else dict(node)
    result_node.update(new_children)
    return result_node
