import { lazy } from "react";
import { registerPublicRoute } from "../../core/mod-system";

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
}
