import { lazy } from "react";
import { Users } from "lucide-react";
import { Mod } from "../../shell/src/mod-system/Mod";
import type { ModManifest } from "../../shell/src/mod-system/types";
import manifest from "./modManifest.json";

const mod = new Mod(manifest as ModManifest);

// ── Public routes (no sidebar, full-page) ──────────────────────────────
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

/** No-op — all registrations happen at module scope via the Mod class. */
export function register() {}
