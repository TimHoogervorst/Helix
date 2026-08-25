import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  deleteTopLevelBlocks,
  duplicateTopLevelBlocks,
  moveTopLevelBlocks,
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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set());
  const [, forceLayoutUpdate] = useState(0);
  const popoverRef = useRef<OpenPopover | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const documentState = editor.state.doc;
  const children = documentState.content.content;
  const editorElement = editor.view.dom;

  popoverRef.current = popover;

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => forceLayoutUpdate((version) => version + 1));
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => forceLayoutUpdate((version) => version + 1));
    resizeObserver?.observe(editorElement);
    Array.from(editorElement.children).forEach((child) => resizeObserver?.observe(child));
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [editorElement, documentState]);

  useEffect(() => {
    const updateSelectedBlocks = () => {
      Array.from(editorElement.children).forEach((element, index) => {
        element.classList.toggle("is-block-selected", selectedIndices.has(index));
      });
    };
    updateSelectedBlocks();
    const handleTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) setSelectedIndices(new Set());
    };
    editor.on("transaction", handleTransaction);
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
    const clearSelectionOnTextClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".ProseMirror > *")) setSelectedIndices(new Set());
    };
    editorElement.addEventListener("mousemove", handleMouseMove);
    editorElement.addEventListener("mouseleave", handleMouseLeave);
    editorElement.addEventListener("click", clearSelectionOnTextClick);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIndices(new Set());
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      editorElement.removeEventListener("mousemove", handleMouseMove);
      editorElement.removeEventListener("mouseleave", handleMouseLeave);
      editorElement.removeEventListener("click", clearSelectionOnTextClick);
      document.removeEventListener("keydown", handleKeyDown);
      editor.off("transaction", handleTransaction);
      Array.from(editorElement.children).forEach((element) => {
        element.classList.remove("is-block-selected");
      });
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor, editorElement, selectedIndices]);

  if (!editable) return null;
  const editorRect = editorElement.getBoundingClientRect();

  const handleDragStart = ({ active }: { active: { id: string | number } }) => {
    const index = Number(String(active.id).replace("block:", ""));
    setActiveIndex(index);
  };
  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverIndex(over ? Number(String(over.id).replace("gap:", "")) : null);
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const sourceIndex = Number(String(active.id).replace("block:", ""));
    const targetIndex = over ? Number(String(over.id).replace("gap:", "")) : -1;
    if (over) {
      moveTopLevelBlocks(editor, selectedIndices.has(sourceIndex) ? [...selectedIndices] : [sourceIndex], targetIndex);
      setSelectedIndices(new Set());
    }
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
          const controlAnchor = element.querySelector<HTMLElement>('[data-bleed-role="card"]')
            ?? element.querySelector<HTMLElement>(
              '.block-node-view-wrapper[data-layout="dynamic-bleed"] > :first-child',
            );
          const controlLeft = (controlAnchor ?? element).getBoundingClientRect().left;
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
                className={`block-controls-row${visible ? " is-visible" : ""}${selectedIndices.has(index) ? " is-selected" : ""}`}
                style={{
                  top: rect.top - editorRect.top,
                  left: controlLeft - editorRect.left,
                  height: rect.height,
                }}
                onMouseEnter={() => setHoveredIndex((current) => current === index ? current : index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {emptyParagraph ? (
                  <IconButton
                    type="button"
                    aria-label="Add block"
                    className="block-control-button block-add-button"
                    size="md"
                    onClick={() => setPopover({ index, paragraphPosition: position, top: rect.bottom + 4, left: rect.left })}
                  >
                    <Plus size={22} aria-hidden="true" />
                  </IconButton>
                ) : null}
                <Menu
                  className="block-action-trigger"
                  trigger={
                    <BlockHandle
                      index={index}
                      onShiftClick={() => {
                        setSelectedIndices((current) => {
                          const next = new Set(current);
                          if (next.has(index)) next.delete(index); else next.add(index);
                          return next;
                        });
                      }}
                    />
                  }
                  items={[
                    {
                      id: "delete",
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      onSelect: () => {
                        const indices = selectedIndices.has(index) ? [...selectedIndices] : [index];
                        deleteTopLevelBlocks(editor, indices);
                        setSelectedIndices(new Set());
                      },
                    },
                    {
                      id: "duplicate",
                      label: "Duplicate",
                      icon: Copy,
                      onSelect: () => {
                        const indices = selectedIndices.has(index) ? [...selectedIndices] : [index];
                        duplicateTopLevelBlocks(editor, indices, (selectedNode) =>
                          bindings.find((binding) => binding.id === selectedNode.type.name));
                        setSelectedIndices(new Set());
                      },
                    },
                    {
                      id: "move-up",
                      label: "Move up",
                      icon: ChevronUp,
                      disabled: (selectedIndices.has(index) ? Math.min(...selectedIndices) : index) === 0,
                      onSelect: () => {
                        const indices = selectedIndices.has(index) ? [...selectedIndices] : [index];
                        moveTopLevelBlocks(editor, indices, Math.min(...indices) - 1);
                        setSelectedIndices(new Set());
                      },
                    },
                    {
                      id: "move-down",
                      label: "Move down",
                      icon: ChevronDown,
                      disabled: (selectedIndices.has(index) ? Math.max(...selectedIndices) : index) === children.length - 1,
                      onSelect: () => {
                        const indices = selectedIndices.has(index) ? [...selectedIndices] : [index];
                        moveTopLevelBlocks(editor, indices, Math.max(...indices) + 2);
                        setSelectedIndices(new Set());
                      },
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

function BlockHandle({ index, onShiftClick }: { index: number; onShiftClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${index}` });
  return (
    <IconButton
      ref={setNodeRef}
      className={`block-control-button block-handle${isDragging ? " is-dragging" : ""}`}
      type="button"
      aria-label="Block Handle"
      size="md"
      {...attributes}
      {...listeners}
      onClick={(event) => {
        if (event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          onShiftClick();
        } else {
          event.preventDefault();
        }
      }}
    >
      <GripVertical size={22} aria-hidden="true" />
    </IconButton>
  );
}

function DropTarget({ index, top, left, width, active }: { index: number; top: number; left: number; width: number; active: boolean }) {
  const { setNodeRef } = useDroppable({ id: `gap:${index}` });
  return <div ref={setNodeRef} className={`block-drop-indicator${active ? " is-active" : ""}`} style={{ top, left, width }} aria-label={`Drop block at position ${index + 1}`} />;
}
