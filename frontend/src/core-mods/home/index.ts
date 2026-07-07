import { House } from "lucide-react";
import { registerHub } from "../../core/mod-system";
import HomePage from "./HomePage";

export const meta = {
  id: "home",
  displayName: "Home",
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
