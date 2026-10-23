import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendBootForTests, startFrontendBoot } from "../boot";
import { ModRegistry } from "../ModRegistry";

afterEach(() => {
  vi.unstubAllGlobals();
  resetFrontendBootForTests();
  ModRegistry._reset();
});

describe("frontend boot lifecycle", () => {
  it("shares the successful page-load outcome with concurrent callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ activeMods: [], registry: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcomes = await Promise.all([startFrontendBoot(), startFrontendBoot()]);

    expect(outcomes).toEqual([undefined, undefined]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains a terminal failure for later callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const attempt = startFrontendBoot();
    await expect(attempt).rejects.toThrow("Backend boot data failed (HTTP 503)");
    await expect(startFrontendBoot()).rejects.toThrow("Backend boot data failed (HTTP 503)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
