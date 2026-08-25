import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestEditor } from "../../test/factories";
import { BlockPopover } from "../TipTapRenderer/BlockPopover";
import type { BlockBinding } from "../../mod-system/types";

function makeBinding(id: string, label: string): BlockBinding {
  return {
    type: "block",
    id,
    label,
    icon: () => null,
    component: () => null,
    listensTo: [],
    onEvent: {},
    overrides: {},
    order: 0,
    serialize: () => "{}",
    deserialize: () => ({}),
    defaultState: {},
  };
}

describe("BlockPopover slash rendering", () => {
  afterEach(() => cleanup());

  it("hides search, filters the supplied query, and selects a block", () => {
    const editor = createTestEditor([]);
    const onSelect = vi.fn();
    render(
      <BlockPopover
        editor={editor}
        bindings={[makeBinding("table", "Table"), makeBinding("protocol", "Protocol")]}
        initialQuery="tbl"
        showSearch={false}
        position={{ top: 10, left: 20 }}
        onClose={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Search blocks" })).toBeNull();
    expect(screen.getByRole("option", { name: "Table" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Protocol" })).toBeNull();

    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "table" }));
    editor.destroy();
  });

  it("navigates with arrows, selects with Tab, and closes with Escape", () => {
    const editor = createTestEditor([]);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <BlockPopover
        editor={editor}
        bindings={[makeBinding("table", "Table"), makeBinding("protocol", "Protocol")]}
        showSearch={false}
        position={{ top: 10, left: 20 }}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "protocol" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    editor.destroy();
  });
});
