/**
 * Tests for the users mod registration contract.
 *
 * Verifies the mod's index.ts exports valid metadata and that the
 * register() function calls into the mod-system registration API
 * without throwing.  The actual route/settings rendering is tested
 * by the shell integration tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRegisterRoute, mockRegisterPublicRoute, mockRegisterSettingsSection } =
  vi.hoisted(() => ({
    mockRegisterRoute: vi.fn(),
    mockRegisterPublicRoute: vi.fn(),
    mockRegisterSettingsSection: vi.fn(),
  }));

vi.mock("../../../core/mod-system", () => ({
  registerRoute: mockRegisterRoute,
  registerPublicRoute: mockRegisterPublicRoute,
  registerSettingsSection: mockRegisterSettingsSection,
}));

import { meta, register } from "../index";

describe("users mod — index.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("meta", () => {
    it("has required id field", () => {
      expect(meta.id).toBe("users");
    });

    it("has displayName", () => {
      expect(meta.displayName).toBe("Users");
    });

    it("has dependsOn as an array", () => {
      expect(Array.isArray(meta.dependsOn)).toBe(true);
    });
  });

  describe("register()", () => {
    it("registers public routes for login and register", () => {
      register();

      const publicCalls = mockRegisterPublicRoute.mock.calls;
      const ids = publicCalls.map((c: [{ id: string }]) => c[0].id);
      expect(ids).toContain("users.login");
      expect(ids).toContain("users.register");
    });

    it("registers a layout route for profile", () => {
      register();

      const routeCalls = mockRegisterRoute.mock.calls;
      const ids = routeCalls.map((c: [{ id: string }]) => c[0].id);
      expect(ids).toContain("users.profile");
    });

    it("registers a settings section for user management", () => {
      register();

      const settingsCalls = mockRegisterSettingsSection.mock.calls;
      const ids = settingsCalls.map((c: [{ id: string }]) => c[0].id);
      expect(ids).toContain("users.management");
    });

    it("register() does not throw", () => {
      expect(() => register()).not.toThrow();
    });
  });
});
