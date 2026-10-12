import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Button, type Mod } from "@helix/mod-api";

const HelloWorkspace: ComponentType = () => <main><h1>Hello World Workspace</h1></main>;

const HelloSlotRenderer: ComponentType<any> = ({ bindings, ...props }) => (
  <section data-slot="content">
    {bindings.map((binding: any) => {
      const Block = binding.component;
      return <Block key={binding.id} {...props} overrides={binding.overrides} />;
    })}
  </section>
);

const HelloBlock: ComponentType<any> = () => {
  const [greeting, setGreeting] = useState("Loading...");
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/mods/example/helloworld/greeting/")
      .then((response) => response.json())
      .then((data: { greeting: string }) => setGreeting(data.greeting));
  }, []);

  async function createEntity() {
    const entity = await fetch("/api/mods/example/helloworld/entities/", { method: "POST" }).then((response) => response.json());
    await fetch("/api/actions/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "example.helloworld.entity.created",
        action_type: "created",
        target_type: "example.helloworld:entity",
        target_id: entity.id,
        workspace_id: "example.helloworld",
      }),
    });
    setCreated(entity.id);
  }

  return <article><p>{greeting}</p><Button variant="primary" size="sm" onClick={createEntity}>Create Hello World Entity</Button>{created && <p>Created {created}</p>}</article>;
};

export function register(mod: Mod) {
  const slot = mod.declareSlot("content", {
    accepts: "block",
    renderer: HelloSlotRenderer,
    layout: "vertical",
    order: 0,
    defaults: {},
  });
  const block = mod.registerBlock("greeting", {
    label: "Greeting",
    icon: (() => null) as ComponentType<any>,
    component: HelloBlock,
    listensTo: [],
    onEvent: {},
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
  });
  mod.registerIntoSlot(slot, block, {}, 0);
  mod.registerWorkspace("hello", { component: HelloWorkspace, displayName: "Hello World" });
  mod.registerExternalRoute("health", { path: "/health", component: HelloWorkspace, public: false });
}
