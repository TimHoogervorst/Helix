import { House } from "lucide-react";
import { registerHub } from "../../shell/src/mod-system";
import HomePage from "./HomePage";
export function register() {
  registerHub({
    id: "home",
    label: "Home",
    icon: House,
    route: "/home",
    component: HomePage,
    order: 0,
    description: "Your lab dashboard — greeting, activity feed, and quick navigation to all hubs.",
  });
}
