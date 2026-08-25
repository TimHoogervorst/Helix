import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { BlockBinding } from "../../mod-system/types";
import { IconButton } from "../../shared/primitives/IconButton";
import { Menu } from "../../shared/primitives/Menu";
import { BlockPopover } from "./BlockPopover";
import {
  deleteTopLevelBlock,
  duplicateTopLevelBlock,
  moveTopLevelBlock,
} from "./moveTopLevelBlock";

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const popoverRef = useRef<OpenPopover | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const children = editor.state.doc.content.content;
  const editorElement = editor.view.dom;

  popoverRef.current = popover;

  useEffect(() => {
    const update = () => {
      const currentPopover = popoverRef.current;
      if (currentPopover) {
        const element = editorElement.children[currentPopover.index] as HTMLElement | undefined;
        if (element) {
          const rect = element.getBoundingClientRect();
          const top = rect.bottom + 4;
          const left = rect.left;
          if (currentPopover.top !== top || currentPopover.left !== left) {
            setPopover((current) => current ? { ...current, top, left } : null);
          }
        }
      }
    };
    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as Element;
      const row = target.closest(".ProseMirror > *");
      if (row?.parentElement === editorElement) {
        const index = Array.prototype.indexOf.call(editorElement.children, row);
        setHoveredIndex((current) => current === index ? current : index);
      }
    };
    const handleMouseLeave = () => {
      if (!popoverRef.current) setHoveredIndex(null);
    };
    editorElement.addEventListener("mousemove", handleMouseMove);
    editorElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      editorElement.removeEventListener("mousemove", handleMouseMove);
      editorElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor, editorElement]);

  if (!editable) return null;
  const editorRect = editorElement.getBoundingClientRect();

  const handleDragStart = ({ active }: { active: { id: string | number } }) => {
    setActiveIndex(Number(String(active.id).replace("block:", "")));
  };
  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverIndex(over ? Number(String(over.id).replace("gap:", "")) : null);
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const sourceIndex = Number(String(active.id).replace("block:", ""));
    const targetIndex = over ? Number(String(over.id).replace("gap:", "")) : -1;
    if (over) moveTopLevelBlock(editor, sourceIndex, targetIndex);
    setActiveIndex(null);
    setOverIndex(null);
  };

  return (
    <DndContext
      sensors={sensors}
      autoScroll={{ threshold: { x: 0, y: 0.12 }, acceleration: 10 }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={() => { setActiveIndex(null); setOverIndex(null); }}
      onDragEnd={handleDragEnd}
    >
      <div className={`block-controls-overlay${activeIndex !== null ? " is-dragging" : ""}`} aria-label="Block controls">
        {children.map((node, index) => {
          const element = editorElement.children[index] as HTMLElement | undefined;
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const emptyParagraph = node.type.name === "paragraph" && node.content.size === 0;
          const position = children.slice(0, index).reduce((sum, child) => sum + child.nodeSize, 0);
          const previousElement = editorElement.children[index - 1] as HTMLElement | undefined;
          const visible = hoveredIndex === index || popover?.paragraphPosition === position || activeIndex === index;
          return (
            <div key={`${position}-${node.type.name}`}>
              <DropTarget
                index={index}
                top={(previousElement ? (previousElement.getBoundingClientRect().bottom + rect.top) / 2 : rect.top) - editorRect.top}
                left={rect.left - editorRect.left}
                width={rect.width}
                active={activeIndex !== null && overIndex === index}
              />
              <div
                className={`block-controls-row${visible ? " is-visible" : ""}`}
                style={{ top: rect.top - editorRect.top, height: rect.height }}
                onMouseEnter={() => setHoveredIndex((current) => current === index ? current : index)}
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
                    <Plus size={18} aria-hidden="true" />
                  </IconButton>
                ) : null}
                <Menu
                  className="block-action-trigger"
                  trigger={<BlockHandle index={index} />}
                  items={[
                    {
                      id: "delete",
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      onSelect: () => { deleteTopLevelBlock(editor, index); },
                    },
                    {
                      id: "duplicate",
                      label: "Duplicate",
                      icon: Copy,
                      onSelect: () => {
                        duplicateTopLevelBlock(
                          editor,
                          index,
                          bindings.find((binding) => binding.id === node.type.name),
                        );
                      },
                    },
                    {
                      id: "move-up",
                      label: "Move up",
                      icon: ChevronUp,
                      disabled: index === 0,
                      onSelect: () => { moveTopLevelBlock(editor, index, index - 1); },
                    },
                    {
                      id: "move-down",
                      label: "Move down",
                      icon: ChevronDown,
                      disabled: index === children.length - 1,
                      onSelect: () => { moveTopLevelBlock(editor, index, index + 2); },
                    },
                  ]}
                />
              </div>
            </div>
          );
        })}
        {children.length > 0 ? (() => {
          const last = editorElement.children[children.length - 1] as HTMLElement | undefined;
          if (!last) return null;
          const rect = last.getBoundingClientRect();
          return <DropTarget index={children.length} top={rect.bottom - editorRect.top} left={rect.left - editorRect.left} width={rect.width} active={activeIndex !== null && overIndex === children.length} />;
        })() : null}
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
    </DndContext>
  );
}

function BlockHandle({ index }: { index: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${index}` });
  return (
    <IconButton
      ref={setNodeRef}
      className={`block-control-button block-handle${isDragging ? " is-dragging" : ""}`}
      type="button"
      aria-label="Block Handle"
      size="sm"
      {...attributes}
      {...listeners}
      onClick={(event) => event.preventDefault()}
    >
      <GripVertical size={18} aria-hidden="true" />
    </IconButton>
  );
}

function DropTarget({ index, top, left, width, active }: { index: number; top: number; left: number; width: number; active: boolean }) {
  const { setNodeRef } = useDroppable({ id: `gap:${index}` });
  return <div ref={setNodeRef} className={`block-drop-indicator${active ? " is-active" : ""}`} style={{ top, left, width }} aria-label={`Drop block at position ${index + 1}`} />;
}
