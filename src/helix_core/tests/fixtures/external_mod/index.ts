import { createElement } from "react";
import type { Mod } from "@helix/mod-api";

export function register(mod: Mod): void {
  mod.registerHub("content", {
    label: "Fixture content",
    icon: "library",
    route: "/fixture-content",
    order: 0,
    component: () => createElement("p", null, "Fixture content"),
  });
}
