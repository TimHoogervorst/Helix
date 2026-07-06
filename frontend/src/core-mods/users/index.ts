import { lazy } from "react";
import { registerRoute, registerPublicRoute } from "../../core/mod-system";

export const meta = {
  id: "users",
  displayName: "Users",
  dependsOn: [] as string[],
};

export function register() {
  // ── Public routes (no sidebar, full-page) ──────────────────────────────
  registerPublicRoute({
    id: "users.login",
    modId: "users",
    path: "/login",
    component: lazy(() => import("./pages/LoginPage")),
  });

  registerPublicRoute({
    id: "users.register",
    modId: "users",
    path: "/register",
    component: lazy(() => import("./pages/RegisterPage")),
  });

  // ── Layout routes (with sidebar) ───────────────────────────────────────
  registerRoute({
    id: "users.profile",
    modId: "users",
    path: "/profile",
    component: lazy(() => import("./pages/ProfilePage")),
  });
}
