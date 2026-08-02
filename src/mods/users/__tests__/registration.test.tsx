/**
 * Tests for the users mod registration contract.
 *
 * All registrations happen at module scope via the Mod class.
 * This test verifies the ModRegistry state after importing the mod.
 */
import { describe, it, expect } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

import "../index";

describe("users mod — registry state", () => {
  const registry = ModRegistry.getInstance();

  describe("meta (modManifest.json)", () => {
    it("exports a manifest with correct name", async () => {
      const manifest = (await import("../modManifest.json")).default;
      expect(manifest.vendor).toBe("helix");
      expect(manifest.name).toBe("users");
      expect(manifest.displayName).toBe("Users");
      expect(Array.isArray(manifest.dependsOn)).toBe(true);
    });
  });

  describe("routes", () => {
    it("registers public routes for login and register", () => {
      const routes = registry.getRoutes();
      const login = routes.get("users.login");
      const register = routes.get("users.register");

      expect(login).toBeDefined();
      expect(login!.path).toBe("/login");
      expect(login!.public).toBe(true);

      expect(register).toBeDefined();
      expect(register!.path).toBe("/register");
      expect(register!.public).toBe(true);
    });

    it("registers public routes via getPublicRoutes()", () => {
      const publicRoutes = registry.getPublicRoutes();
      const ids = publicRoutes.map((r) => r.id);
      expect(ids).toContain("users.login");
      expect(ids).toContain("users.register");
    });

    it("registers a layout route for profile", () => {
      const routes = registry.getRoutes();
      const profile = routes.get("users.profile");

      expect(profile).toBeDefined();
      expect(profile!.path).toBe("/profile");
      expect(profile!.public).toBeUndefined();
    });

    it("profile route appears in getLayoutRoutes()", () => {
      const layoutRoutes = registry.getLayoutRoutes();
      const ids = layoutRoutes.map((r) => r.id);
      expect(ids).toContain("users.profile");
    });
  });

  describe("settings", () => {
    it("registers a settings section for user management", () => {
      const sections = registry.getSettingsSections();
      const management = sections.find((s) => s.id === "users.management");

      expect(management).toBeDefined();
      expect(management!.modId).toBe("users");
      expect(management!.label).toBe("Users");
      expect(management!.order).toBe(5);
    });
  });
});
