import { lazy } from "react";
import { Users } from "lucide-react";
import type { Mod } from "@helix/mod-api";

// ── Public routes (no sidebar, full-page) ──────────────────────────────
export function register(mod: Mod) {
  mod.registerRoute("login", {
  path: "/login",
  component: lazy(() => import("./pages/LoginPage")),
  public: true,
  });

  mod.registerRoute("register", {
  path: "/register",
  component: lazy(() => import("./pages/RegisterPage")),
  public: true,
  });

// ── Layout routes (with sidebar) ───────────────────────────────────────
  mod.registerRoute("profile", {
  path: "/profile",
  component: lazy(() => import("./pages/ProfilePage")),
  });

// ── Settings section ───────────────────────────────────────────────────
  mod.registerSettingsSection("management", {
  label: "Users",
  icon: Users,
  component: lazy(() => import("./settings/UserManagement")),
  order: 5,
  });
}

