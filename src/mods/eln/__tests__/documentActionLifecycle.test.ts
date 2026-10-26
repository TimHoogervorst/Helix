import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useEntryCrud } from "../hooks/useEntryCrud";
import { collectPortableBlocks, registrationBaselines } from "../workspace/savedActionBlocks";
import { decodeBlockContent, getTypedPath } from "../workspace/portableInput";
import type { EntryDetail, TipTapDoc } from "../types";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), resolveIds: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@helix/mod-api/host", () => ({
  get: mocks.get, put: mocks.put, del: vi.fn(),
  ApiError: class extends Error {}, NetworkError: class extends Error {},
  useMentionContext: () => ({ resolveIds: mocks.resolveIds }),
  useCurrentUser: () => ({ user: { id: 1 } }),
}));
vi.mock("../api", () => ({
  attachTags: vi.fn(), acquireLock: vi.fn().mockResolvedValue({}),
  releaseLock: vi.fn().mockResolvedValue({}), getLockStatus: vi.fn().mockResolvedValue({ locked: false }),
}));

const row = { displayId: "#new-1", __name: "Sample", values: { Description: "new" }, isRegistered: false };
function document(rows: unknown[]): TipTapDoc {
  return { type: "doc", content: [{ type: "helix.lims:registry-table", attrs: {
    content: JSON.stringify({ id: "table", schemaContentHash: "schema", rows }),
  } }] };
}
function entry(content: TipTapDoc, token: string): EntryDetail {
  return { id: 3, display_id: "E3", name: "Entry", status: "in_progress", content,
    platform_state_token: token, mentions: [] } as unknown as EntryDetail;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(entry(document([]), "initial"));
  mocks.put.mockImplementation(async (_url, payload) => entry(payload.content, "saved"));
});

describe("document Action lifecycle", () => {
  it("saves latest rows for a newly created entry, blocks autosave, then adopts Action state", async () => {
    const contentRef = { current: document([row]) };
    const { result } = renderHook(() => useEntryCrud({ entryId: "E3", isNew: true, contentRef }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let saved!: EntryDetail;
    await act(async () => { saved = await result.current.beginAction(); });
    const block = collectPortableBlocks(decodeBlockContent(saved.content)).get("table")!;
    expect(getTypedPath(block.content!.value, ["rows"])?.value).toEqual([row]);
    expect(result.current.actionBusy).toBe(true);
    act(() => result.current.autoSave(null));
    expect(mocks.put).toHaveBeenCalledTimes(1);
    await expect(result.current.beginAction()).rejects.toThrow("already in progress");

    const registered = { ...row, displayId: "SAM2", entityId: "record", recordId: "record", isRegistered: true };
    act(() => result.current.finishAction(entry(document([registered]), "after-action")));
    expect(result.current.actionBusy).toBe(false);
    expect(contentRef.current).toEqual(document([registered]));
    await act(async () => { await result.current.save(null, []); });
    expect(mocks.put.mock.calls[1][1].state_token).toBe("after-action");
    expect(JSON.stringify(mocks.put.mock.calls[1][1].content)).toContain("SAM2");
  });

  it("drains an earlier save before the Action snapshot and rejects new saves while held", async () => {
    const contentRef = { current: document([row]) };
    const { result } = renderHook(() => useEntryCrud({ entryId: "E3", isNew: false, contentRef }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    let release!: (value: EntryDetail) => void;
    mocks.put.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    act(() => result.current.autoSave(null));
    await waitFor(() => expect(release).toBeDefined());
    let pending!: Promise<EntryDetail>;
    act(() => { pending = result.current.beginAction(); });
    await expect(result.current.save(null, [])).rejects.toThrow("in progress");
    await act(async () => { release(entry(document([row]), "earlier")); await pending; });
    expect(mocks.put.mock.calls[1][1].state_token).toBe("earlier");
    // A failed post-commit fetch does not call finishAction: saves stay blocked.
    act(() => result.current.autoSave(null));
    expect(mocks.put).toHaveBeenCalledTimes(2);
    act(() => result.current.finishAction(entry(document([row]), "recovered")));
  });

  it("preserves the draft and releases the guard when the pre-Action save conflicts", async () => {
    const contentRef = { current: document([row]) };
    const { result } = renderHook(() => useEntryCrud({ entryId: "E3", isNew: false, contentRef }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    mocks.put.mockRejectedValue(new Error("The record changed since this form was loaded."));
    await act(async () => { await expect(result.current.beginAction()).rejects.toThrow("record changed"); });
    expect(result.current.actionBusy).toBe(false);
    expect(result.current.saveStatus).toBe("error");
    expect(contentRef.current).toEqual(document([row]));
  });

  it("adds green-row baselines to committed rows without replacing their values", () => {
    const registered = { ...row, entityId: "record", isRegistered: true };
    const content = registrationBaselines(document([registered]), new Set(["record"]));
    const block = collectPortableBlocks(decodeBlockContent(content)).get("table")!;
    const rows = getTypedPath(block.content!.value, ["rows"])!.value as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ values: row.values, lastRegisteredSchemaContentHash: "schema",
      lastRegisteredValueHash: JSON.stringify({ Description: "new", __name: "Sample" }) });
  });
});
