import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { GripVertical, Plus } from "lucide-react";
import type { BlockBinding } from "../../mod-system/types";
import { IconButton } from "../../shared/primitives/IconButton";
import { BlockPopover } from "./BlockPopover";

interface BlockControlsProps {
  editor: Editor;
  bindings: BlockBinding[];
  editable: boolean;
}

interface OpenPopover {
  index: number;
  paragraphPosition: number;
  top: number;
  left: number;
}

export function BlockControls({ editor, bindings, editable }: BlockControlsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [popover, setPopover] = useState<OpenPopover | null>(null);
  const [, refresh] = useState(0);
  const children = editor.state.doc.content.content;
  const editorElement = editor.view.dom;

  useEffect(() => {
    const update = () => {
      refresh((value) => value + 1);
      if (popover) {
        const element = editorElement.children[popover.index] as HTMLElement | undefined;
        if (element) {
          const rect = element.getBoundingClientRect();
          setPopover((current) => current ? {
            ...current,
            top: rect.bottom + 4,
            left: rect.left,
          } : null);
        }
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as Element;
      const row = target.closest(".ProseMirror > *");
      if (row?.parentElement === editorElement) {
        setHoveredIndex(Array.prototype.indexOf.call(editorElement.children, row));
      }
    };
    const handleMouseLeave = () => {
      if (!popover) setHoveredIndex(null);
    };
    editor.on("transaction", update);
    editorElement.addEventListener("mousemove", handleMouseMove);
    editorElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      editor.off("transaction", update);
      editorElement.removeEventListener("mousemove", handleMouseMove);
      editorElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor, editorElement, popover]);

  if (!editable) return null;
  const editorRect = editorElement.getBoundingClientRect();

  return (
    <div
      className="block-controls-overlay"
      aria-label="Block controls"
    >
      {children.map((node, index) => {
        const element = editorElement.children[index] as HTMLElement | undefined;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const emptyParagraph = node.type.name === "paragraph" && node.content.size === 0;
        const position = children.slice(0, index).reduce((sum, child) => sum + child.nodeSize, 0);
        const visible = hoveredIndex === index || popover?.paragraphPosition === position;
        return (
          <div
            key={`${position}-${node.type.name}`}
            className={`block-controls-row${visible ? " is-visible" : ""}`}
            style={{ top: rect.top - editorRect.top, height: rect.height }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {emptyParagraph ? (
              <IconButton
                type="button"
                aria-label="Add block"
                className="block-control-button block-add-button"
                size="sm"
                onClick={() => setPopover({ index, paragraphPosition: position, top: rect.bottom + 4, left: rect.left })}
              >
                <Plus size={16} aria-hidden="true" />
              </IconButton>
            ) : null}
            <IconButton type="button" aria-label="Block Handle" size="sm" className="block-control-button block-handle" onClick={(event) => event.preventDefault()}>
              <GripVertical size={16} aria-hidden="true" />
            </IconButton>
          </div>
        );
      })}
      {popover ? (
        <BlockPopover
          editor={editor}
          bindings={bindings}
          paragraphPosition={popover.paragraphPosition}
          position={{ top: popover.top, left: popover.left }}
          onClose={() => setPopover(null)}
        />
      ) : null}
    </div>
  );
}
