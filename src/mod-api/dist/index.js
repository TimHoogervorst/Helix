var A = Object.defineProperty;
var E = (e, t, a) => t in e ? A(e, t, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[t] = a;
var h = (e, t, a) => E(e, typeof t != "symbol" ? t + "" : t, a);
import { I as v, C as P, M as T } from "./Button-CXH-9zj5.js";
import { A as ae, B as re, a as ie, b as ce, O as le, S as de, d as ue, W as me, e as fe, f as xe, g as he, h as ve, i as pe, l as be, p as ge, r as je, u as Ce, j as we, w as ye } from "./Button-CXH-9zj5.js";
import { j as n } from "./jsx-runtime-BzflLqGi.js";
import { createContext as M, useState as p, useEffect as C, useCallback as j, useMemo as g, useContext as B, useRef as F } from "react";
import b from "./chevron-right-Df9XrNWg.js";
import y from "./chevron-left-xHQCqUAL.js";
import { u as S, i as k } from "./editor-CMfF8bXZ.js";
import { T as ke } from "./editor-CMfF8bXZ.js";
import "@tiptap/react";
import { ApiError as Re, NetworkError as Ie, del as Ae, get as Ee, getText as Pe, isNotFoundError as Te, patch as Me, post as Be, put as Fe } from "./api.js";
import "react-dom";
import { canonicalJson as Le, canonicalizeContractJson as ze, contractFingerprint as Ue, isExactJsonNumber as De, parseExactContractJson as Oe } from "./contracts.js";
import { RecordValueInspector as Je, UnavailableRecordCapability as We, exportPlatformRecord as Ke, getExactRecordRevision as Ve, getPlatformRecord as Qe, listPlatformRecords as Xe, listRecordActivity as _e, listRecordGroupRevisions as qe, uploadPlatformAttachment as He } from "./records.js";
import { PortableBlockView as Ze, getActionInvocation as et, invokeAction as tt, resolvePortableActionContext as nt } from "./portable-blocks.js";
function ee({
  bindings: e,
  bus: t,
  context: a
}) {
  return e.length === 0 ? null : /* @__PURE__ */ n.jsx("div", { className: "flex items-center gap-1", children: e.map((o) => {
    const i = o.icon;
    return /* @__PURE__ */ n.jsxs(
      "button",
      {
        type: "button",
        className: "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary hover:bg-hover hover:text-primary transition-colors",
        onClick: () => o.onClick({ bus: t, context: a }),
        "aria-label": o.label,
        children: [
          i && /* @__PURE__ */ n.jsx(i, { className: "h-4 w-4" }),
          o.label
        ]
      },
      o.id
    );
  }) });
}
const N = M(null);
function G({ children: e }) {
  const [t, a] = p(!1), [o, i] = p(
    () => typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia("(max-width: 1023px)").matches : !1
  ), [r, f] = p(
    /* @__PURE__ */ new Set()
  );
  C(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function")
      return;
    const c = window.matchMedia("(max-width: 1023px)"), x = (m) => {
      i(m.matches);
    };
    return c.addEventListener("change", x), () => c.removeEventListener("change", x);
  }, []);
  const u = j(() => {
    o || a((c) => !c);
  }, [o]), l = j((c) => {
    f((x) => {
      const m = new Set(x);
      return m.has(c) ? m.delete(c) : m.add(c), m;
    });
  }, []), s = j(
    (c) => r.has(c),
    [r]
  ), d = g(
    () => ({
      isCollapsed: o || t,
      toggleSidebar: u,
      collapsedSections: r,
      toggleSection: l,
      isSectionCollapsed: s
    }),
    [o, t, u, r, l, s]
  );
  return /* @__PURE__ */ n.jsx(N.Provider, { value: d, children: e });
}
function R() {
  const e = B(N);
  if (!e)
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  return e;
}
function L({ groups: e }) {
  return /* @__PURE__ */ n.jsx("div", { className: "flex flex-col items-center gap-0 py-2", role: "navigation", "aria-label": "Icon strip", children: e.map((t, a) => /* @__PURE__ */ n.jsxs("div", { className: "flex flex-col items-center gap-1 w-full", children: [
    a > 0 && /* @__PURE__ */ n.jsx("div", { className: "w-6 h-px bg-border my-1", "aria-hidden": "true" }),
    t.icons.map(
      (o, i) => o.onClick ? /* @__PURE__ */ n.jsx(
        v,
        {
          className: "flex items-center justify-center w-9 h-9 rounded-md",
          onClick: o.onClick,
          title: o.label,
          "aria-label": o.label,
          children: o.icon
        },
        i
      ) : /* @__PURE__ */ n.jsx(
        "span",
        {
          className: "flex items-center justify-center w-9 h-9 text-muted-foreground",
          "aria-hidden": "true",
          children: o.icon
        },
        i
      )
    )
  ] }, a)) });
}
function z(e) {
  if (e.length === 0 || e[0].icons.length === 0)
    return { logoIcon: null, remainingGroups: e };
  const [t, ...a] = e[0].icons, o = { icons: a }, i = a.length > 0 ? [o, ...e.slice(1)] : e.slice(1);
  return { logoIcon: t, remainingGroups: i };
}
function U({
  side: e,
  variant: t,
  iconStripGroups: a = [],
  children: o,
  hideToggle: i = !1,
  footer: r,
  collapsedContent: f
}) {
  const { isCollapsed: u, toggleSidebar: l } = R(), s = e === "left" ? u ? b : y : u ? y : b, d = u ? "Expand sidebar" : "Collapse sidebar";
  if (u && t === "full-hide")
    return /* @__PURE__ */ n.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-full-hide",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: r ? { overflow: "visible" } : void 0,
        children: [
          /* @__PURE__ */ n.jsx(
            v,
            {
              className: "sidebar-toggle",
              onClick: l,
              title: d,
              "aria-label": d,
              children: /* @__PURE__ */ n.jsx(s, { size: 16 })
            }
          ),
          f,
          r && /* @__PURE__ */ n.jsx("div", { className: "mt-auto", children: r })
        ]
      }
    );
  if (u && t === "icon-strip") {
    const c = e === "left", { logoIcon: x, remainingGroups: m } = c ? z(a) : { logoIcon: null, remainingGroups: a };
    return /* @__PURE__ */ n.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-icon-strip",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: r ? { overflow: "visible" } : void 0,
        children: [
          x && /* @__PURE__ */ n.jsxs(
            v,
            {
              className: "sidebar-logo-toggle",
              onClick: l,
              title: d,
              "aria-label": d,
              children: [
                /* @__PURE__ */ n.jsx("span", { className: "sidebar-logo-toggle-icon", children: x.icon }),
                /* @__PURE__ */ n.jsx(
                  b,
                  {
                    size: 14,
                    className: "sidebar-logo-toggle-chevron",
                    "aria-hidden": "true"
                  }
                )
              ]
            }
          ),
          m.length > 0 && /* @__PURE__ */ n.jsx(L, { groups: m }),
          !x && /* @__PURE__ */ n.jsx(
            v,
            {
              className: "sidebar-toggle",
              onClick: l,
              title: d,
              "aria-label": d,
              children: /* @__PURE__ */ n.jsx(s, { size: 16 })
            }
          ),
          f,
          r && /* @__PURE__ */ n.jsx("div", { className: "mt-auto", children: r })
        ]
      }
    );
  }
  return /* @__PURE__ */ n.jsx(
    "aside",
    {
      className: "collapsible-sidebar is-expanded",
      "data-side": e,
      role: "complementary",
      "aria-label": e === "left" ? "Left sidebar" : "Right sidebar",
      children: /* @__PURE__ */ n.jsxs("div", { className: "sidebar-content", children: [
        !i && /* @__PURE__ */ n.jsx("div", { className: "sidebar-toggle-row", "data-side": e, children: /* @__PURE__ */ n.jsx(
          v,
          {
            className: "sidebar-toggle",
            onClick: l,
            title: d,
            "aria-label": d,
            children: /* @__PURE__ */ n.jsx(s, { size: 16 })
          }
        ) }),
        o,
        r && /* @__PURE__ */ n.jsx("div", { className: "sidebar-footer", children: r })
      ] })
    }
  );
}
function I({
  id: e,
  label: t,
  icon: a,
  collapsible: o = !0,
  children: i,
  actions: r
}) {
  const { isSectionCollapsed: f, toggleSection: u } = R(), l = o && f(e), s = () => {
    o && u(e);
  }, d = (c) => {
    o && (c.key === "Enter" || c.key === " ") && (c.preventDefault(), u(e));
  };
  return /* @__PURE__ */ n.jsxs("div", { className: "sidebar-section", "data-section-id": e, children: [
    /* @__PURE__ */ n.jsxs(
      "div",
      {
        className: "sidebar-section-header",
        onClick: s,
        role: o ? "button" : void 0,
        tabIndex: o ? 0 : void 0,
        onKeyDown: d,
        "aria-expanded": o ? !l : void 0,
        "aria-label": o ? `${t} section` : void 0,
        children: [
          a && /* @__PURE__ */ n.jsx(a, { size: 16, className: "sidebar-section-icon" }),
          /* @__PURE__ */ n.jsx("span", { className: "sidebar-section-label", children: t }),
          r && /* @__PURE__ */ n.jsx("span", { onClick: (c) => c.stopPropagation(), children: r }),
          o && /* @__PURE__ */ n.jsx("span", { className: "sidebar-section-chevron", "aria-hidden": "true", children: l ? /* @__PURE__ */ n.jsx(b, { size: 16 }) : /* @__PURE__ */ n.jsx(P, { size: 16 }) })
        ]
      }
    ),
    !l && /* @__PURE__ */ n.jsx("div", { className: "sidebar-section-content", children: i })
  ] });
}
function D(e, t, a) {
  const [o, i] = p(
    e.defaultState
  ), r = F(null), f = g(
    () => `${e.id}::${crypto.randomUUID()}`,
    [e.id, t]
  );
  C(() => {
    i(e.defaultState);
  }, [e.defaultState]);
  const u = {
    id: f,
    blockId: e.id,
    slotId: t,
    attrs: o,
    updateAttrs: (l) => {
      i((s) => ({ ...s, ...l }));
    }
  };
  return r.current = u, C(() => {
    if (!a) return;
    const l = [];
    for (const s of e.listensTo) {
      const d = e.onEvent[s];
      if (!d) continue;
      const c = a.on(s, (x) => {
        const m = r.current;
        if (m)
          return d(m, x);
      });
      l.push(c);
    }
    return () => {
      for (const s of l)
        s();
    };
  }, [e.listensTo, e.onEvent, a]), u;
}
const O = {
  workspaceId: "",
  user: null,
  viewMode: null
}, $ = () => {
};
function te(e) {
  const t = g(() => {
    if ("bindings" in e)
      return e.bindings;
    const s = T.getInstance().resolveSlot(e.slotId);
    return (s == null ? void 0 : s.bindings) ?? [];
  }, ["bindings" in e ? e.bindings : e.slotId]);
  if (t.length === 0) return null;
  const a = e.slotId, o = "bindings" in e && "bus" in e, i = o ? e.context : e.context ?? O, r = e.bus, f = ("side" in e ? e.side : void 0) ?? "right", u = ("variant" in e ? e.variant : void 0) ?? "full-hide", l = ("iconStripGroups" in e ? e.iconStripGroups : void 0) ?? [];
  return /* @__PURE__ */ n.jsx(G, { children: /* @__PURE__ */ n.jsx(
    U,
    {
      side: f,
      variant: u,
      iconStripGroups: l,
      children: t.map((s) => {
        if (s.type !== "block") return null;
        if (r)
          return /* @__PURE__ */ n.jsx(
            J,
            {
              binding: s,
              slotId: a,
              bus: r,
              context: i
            },
            s.id
          );
        const d = s.component, c = i.actionContext ?? S(), x = i.invokeAction ?? k, m = {
          id: `${s.id}::static`,
          blockId: s.id,
          slotId: a,
          attrs: s.defaultState,
          updateAttrs: $
        };
        return /* @__PURE__ */ n.jsx(
          I,
          {
            id: s.id,
            label: s.label,
            icon: s.icon,
            children: /* @__PURE__ */ n.jsx(
              d,
              {
                context: i,
                instance: m,
                overrides: s.overrides,
                actionContext: c,
                invokeAction: x
              }
            )
          },
          s.id
        );
      })
    }
  ) });
}
function J({
  binding: e,
  slotId: t,
  bus: a,
  context: o
}) {
  const i = e.component, r = D(e, t, a), f = o.actionContext ?? S(), u = o.invokeAction ?? k, l = g(
    () => ({
      ...o,
      emitAction: (s, d) => {
        a.emit(`${e.id}.${s}`, {
          blockInstanceId: r.id,
          blockId: e.id,
          localId: s,
          payload: d
        });
      }
    }),
    [o, e.id, a, r.id]
  );
  return /* @__PURE__ */ n.jsx(
    I,
    {
      id: e.id,
      label: e.label,
      icon: e.icon,
      children: /* @__PURE__ */ n.jsx(
        i,
        {
          context: l,
          instance: r,
          overrides: e.overrides,
          actionContext: f,
          invokeAction: u
        }
      )
    }
  );
}
class w {
  // ── Construction ──────────────────────────────────────────────────────
  constructor(t, a, o, i = []) {
    /**
     * Local event identifier, e.g. ``"entities-registered"``.
     * Combined with the block's global ID to form the full bus event key.
     */
    h(this, "id");
    /** ``"action"`` for auditable events, ``"ui"`` for in-workspace signals. */
    h(this, "category");
    /**
     * Audit classification.
     *
     * - ``"created" | "edited" | "deleted"`` — lifecycle or domain mutations.
     * - ``"ui"`` — workspace-internal signal (always paired with ``category: "ui"``).
     */
    h(this, "core");
    /** Reserved for future listen-by-tag.  Stored, not consumed. */
    h(this, "tags");
    this.id = t, this.category = a, this.core = o, this.tags = i;
  }
  // ── Static factories ──────────────────────────────────────────────────
  /**
   * Create an auditable domain event.
   *
   * Produces ``category: "action"`` with the given ``core`` classification.
   * Used for lifecycle events and custom domain actions that should be
   * persisted in the action log.
   */
  static action(t) {
    return new w(t.id, "action", t.core, t.tags);
  }
  /**
   * Create a UI-only workspace signal.
   *
   * Produces ``category: "ui"`` with ``core: "ui"``.  These events stay
   * on the bus and never hit the database — they are for in-workspace
   * communication between blocks (e.g. column resized, sort changed).
   */
  static ui(t) {
    return new w(t.id, "ui", "ui", t.tags);
  }
  // ── Runtime ───────────────────────────────────────────────────────────
  /**
   * Construct the full bus payload shape for this event.
   *
   * Combines the event's identity with caller-supplied data into the
   * canonical bus payload.  Not wired to the actual bus yet — that
   * integration happens in a follow-up issue.
   *
   * @param payload - Arbitrary caller-supplied data for the event.
   * @returns The full bus payload object.
   */
  fire(t) {
    return {
      eventId: this.id,
      category: this.category,
      core: this.core,
      tags: this.tags,
      payload: t
    };
  }
}
function W(e, t) {
  return t === void 0 ? { type: "entity-reference", displayId: e } : { type: "entity-reference", displayId: e, schemaId: t };
}
function ne(e, t) {
  return W(t, e);
}
export {
  ae as ActionReference,
  Re as ApiError,
  w as BlockEvent,
  re as Button,
  ee as ButtonGroupRenderer,
  v as IconButton,
  ie as Menu,
  ce as ModelReference,
  Ie as NetworkError,
  le as ObjectReference,
  Ze as PortableBlockView,
  Je as RecordValueInspector,
  de as ServiceReference,
  ue as SlotReference,
  te as SlotSidebar,
  ke as TipTapRenderer,
  We as UnavailableRecordCapability,
  me as WorkspaceReference,
  Le as canonicalJson,
  ze as canonicalizeContractJson,
  Ue as contractFingerprint,
  Ae as del,
  W as entityReference,
  fe as evaluateCellFormula,
  xe as evaluateFormula,
  he as evaluateRow,
  Ke as exportPlatformRecord,
  ve as externalRoutePath,
  pe as functionCallsIn,
  Ee as get,
  et as getActionInvocation,
  Ve as getExactRecordRevision,
  Qe as getPlatformRecord,
  Pe as getText,
  tt as invokeAction,
  De as isExactJsonNumber,
  Te as isNotFoundError,
  be as legacyWorkspaceUrl,
  Xe as listPlatformRecords,
  _e as listRecordActivity,
  qe as listRecordGroupRevisions,
  Oe as parseExactContractJson,
  ge as parseFormula,
  Me as patch,
  Be as post,
  Fe as put,
  je as registrationId,
  nt as resolvePortableActionContext,
  ne as schemaReference,
  Ce as unimplementedFormulaFunctionsIn,
  He as uploadPlatformAttachment,
  we as usesBackendOnlyFunction,
  ye as workspaceUrl
};
