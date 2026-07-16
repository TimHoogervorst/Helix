import { House } from "lucide-react";
import { registerHub } from "../../core/mod-system";
import HomePage from "./HomePage";

export const meta = {
  id: "home",
  displayName: "Home",
  version: "0.1.0",
  dependsOn: [],
};

export function register() {
  registerHub({
    id: "home",
    label: "Home",
    icon: House,
    route: "/home",
    component: HomePage,
    order: 0,
  });
}
