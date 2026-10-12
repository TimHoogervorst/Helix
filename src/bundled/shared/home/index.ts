import { House } from "lucide-react";
import type { Mod } from "@helix/mod-api";
import HomePage from "./HomePage";

export function register(mod: Mod) {
  mod.registerHub("home", {
  label: "Home",
  icon: House,
  route: "/home",
  component: HomePage,
  order: 0,
  description: "Your lab dashboard — greeting, activity feed, and quick navigation to all hubs.",
  });
}

