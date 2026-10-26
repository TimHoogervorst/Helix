import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type Annotation = { id: string; from: number; to: number; kind?: "text" | "block" };
const key = new PluginKey("eln-review-annotations");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reviewAnnotations: { setReviewAnnotations: (annotations: Annotation[]) => ReturnType };
  }
}

/** Renders review anchors as editor decorations without changing saved content. */
export default Extension.create({
  name: "reviewAnnotations",
  addStorage() { return { annotations: [] as Annotation[] }; },
  addCommands() {
    return {
      setReviewAnnotations: (annotations) => ({ tr, dispatch }) => {
        this.storage.annotations = annotations;
        dispatch?.(tr.setMeta(key, true));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [new Plugin({
      key,
      props: {
        handleClick(_view, _position, event) {
          const target = event.target instanceof HTMLElement
            ? event.target.closest<HTMLElement>("[data-review-thread]") : null;
          const threadId = target?.dataset.reviewThread;
          if (!threadId) return false;
          document.getElementById(`review-thread-${threadId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          return true;
        },
        decorations(state) {
          const decorations = storage.annotations
            .filter(({ from, to }) => Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to && to <= state.doc.content.size)
            .map(({ id, from, to, kind }) => {
              const attrs = {
                class: "eln-review-highlight", "data-review-thread": id,
                style: "background-color: var(--color-accent-subtle); border-bottom: 2px solid var(--color-primary)",
              };
              return kind === "block" ? Decoration.node(from, to, attrs) : Decoration.inline(from, to, attrs);
            });
          return DecorationSet.create(state.doc, decorations);
        },
      },
    })];
  },
});
