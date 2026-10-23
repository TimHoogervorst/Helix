import { afterEach, describe, expect, it, vi } from "vitest";
import { getText } from "../client";

describe("API raw-text reads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves exact JSON number tokens from retained definitions", async () => {
    const source = '{"value":90071992547409931234567890.123456789}';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, { status: 200 })));

    await expect(getText("/contracts/data/acme.publisher.value/1.0.0")).resolves.toBe(source);
  });
});
