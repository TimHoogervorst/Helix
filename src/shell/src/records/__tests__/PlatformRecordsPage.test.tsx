import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readers = vi.hoisted(() => ({
  listPlatformRecords: vi.fn(),
  getPlatformRecord: vi.fn(),
  listRecordGroupRevisions: vi.fn(),
  getExactRecordRevision: vi.fn(),
  listRecordActivity: vi.fn(),
  exportPlatformRecord: vi.fn(),
}));

vi.mock("../../../../mod-api/src/records", () => ({
  ...readers,
  RecordValueInspector: ({ value }: { value: unknown }) => <pre>{JSON.stringify(value)}</pre>,
  UnavailableRecordCapability: ({ capability, reason }: { capability: string; reason: string }) => <p>{capability} unavailable. {reason}</p>,
}));

import PlatformRecordsPage from "../PlatformRecordsPage";

const record = {
  id: "record-a", display_id: "REC1", name: "Sample A", metadata: {}, project_id: 1,
  schema_id: 2, field_values: { measurement: { type: "number", value: 4.2 } }, state_token: "token",
  revision: { id: "revision-current", group_id: "group-a", sequence: 2, content_hash: "hash" },
};
const revisions = {
  count: 2, next: null, previous: null, page: 1, page_size: 100,
  results: [{ id: "revision-current", group_id: "group-a", sequence: 2, content_hash: "hash", created_at: "2026-10-22" }],
};

describe("Platform-owned record browser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readers.listPlatformRecords.mockResolvedValue({ count: 1, next: null, previous: null, page: 1, page_size: 25, results: [record] });
    readers.getPlatformRecord.mockResolvedValue(record);
    readers.listRecordGroupRevisions.mockResolvedValue(revisions);
    readers.listRecordActivity.mockResolvedValue({ count: 1, next: null, previous: null, page: 1, page_size: 25, results: [{
      id: 1, action: "helix.record.edited", action_type: "edited", performed_by: 1, created_at: "2026-10-22",
      descriptions: ["Updated measurement"], subject: { id: "record-a", roles: ["subject"] }, before: [],
      after: [{ group_id: "group-a", revision_id: "revision-current" }],
    }] });
    readers.getExactRecordRevision.mockResolvedValue({
      id: "revision-current", group_id: "group-a", group_key: "record", sequence: 2, content_hash: "hash",
      snapshot: { field_values: { measurement: { type: "number", value: 4.2 } } }, created_at: "2026-10-22",
    });
  });

  it("browses current records, loads Activity, and opens the selected exact Revision", async () => {
    render(<MemoryRouter initialEntries={["/records"]}><Routes>
      <Route path="/records" element={<PlatformRecordsPage />} />
      <Route path="/records/:recordId" element={<PlatformRecordsPage />} />
    </Routes></MemoryRouter>);

    expect(await screen.findByText("1 current records")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Sample A" }));
    expect(await screen.findByText("Updated measurement")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("link", { name: /Open exact Revision/ })[0]);
    expect(await screen.findByText(/Historical group snapshot/)).toBeTruthy();
    expect(readers.getExactRecordRevision).toHaveBeenCalledWith("record-a", "group-a", "revision-current");
    await waitFor(() => expect(screen.getByText("Historical values")).toBeTruthy());
  });

  it("shows access failures and never falls back from an unavailable exact Revision", async () => {
    readers.getPlatformRecord.mockRejectedValueOnce({ status: 403 });
    const denied = render(<MemoryRouter initialEntries={["/records/record-a"]}><Routes>
      <Route path="/records/:recordId" element={<PlatformRecordsPage />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("do not have access");
    denied.unmount();

    readers.getPlatformRecord.mockResolvedValue(record);
    readers.getExactRecordRevision.mockRejectedValueOnce({ status: 404 });
    render(<MemoryRouter initialEntries={["/records/record-a?group_id=group-a&revision_id=missing-revision"]}><Routes>
      <Route path="/records/:recordId" element={<PlatformRecordsPage />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("exact Revision is unavailable");
    expect(screen.queryByText("Current values")).toBeNull();
  });
});
