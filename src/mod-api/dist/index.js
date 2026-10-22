var E = Object.defineProperty;
var P = (e, t, a) => t in e ? E(e, t, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[t] = a;
var x = (e, t, a) => P(e, typeof t != "symbol" ? t + "" : t, a);
import { c as k, I as v, C as T, M, u as S, i as N } from "./editor-rgcyRClr.js";
import { A as ae, B as ie, a as re, b as ce, O as le, S as de, d as ue, T as me, W as fe, e as he, f as xe, g as ve, h as pe, j as ge, l as be, p as je, r as Ce, k as we, m as ye, w as ke } from "./editor-rgcyRClr.js";
import { j as n } from "./jsx-runtime-D1SHvdVE.js";
import { createContext as L, useState as p, useEffect as C, useCallback as j, useMemo as b, useContext as B, useRef as F } from "react";
import "@tiptap/react";
import { ApiError as Ne, NetworkError as Re, del as Ie, get as Ae, getText as Ee, isNotFoundError as Pe, patch as Te, post as Me, put as Le } from "./api.js";
import "react-dom";
import { canonicalJson as Fe, canonicalizeContractJson as Ge, contractFingerprint as ze, isExactJsonNumber as Ue, parseExactContractJson as $e } from "./contracts.js";
import { RecordValueInspector as Oe, UnavailableRecordCapability as _e, exportPlatformRecord as Je, getExactRecordRevision as We, getPlatformRecord as Ke, listPlatformRecords as Ve, listRecordActivity as qe, listRecordGroupRevisions as Qe, uploadPlatformAttachment as Xe } from "./records.js";
import { PortableBlockView as Ye, getActionInvocation as Ze, invokeAction as et, resolvePortableActionContext as tt } from "./portable-blocks.js";
/**
 * @license lucide-react v1.26.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const G = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]], y = k("chevron-left", G);
/**
 * @license lucide-react v1.26.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const z = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], g = k("chevron-right", z);
function ee({
  bindings: e,
  bus: t,
  context: a
}) {
  return e.length === 0 ? null : /* @__PURE__ */ n.jsx("div", { className: "flex items-center gap-1", children: e.map((o) => {
    const r = o.icon;
    return /* @__PURE__ */ n.jsxs(
      "button",
      {
        type: "button",
        className: "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary hover:bg-hover hover:text-primary transition-colors",
        onClick: () => o.onClick({ bus: t, context: a }),
        "aria-label": o.label,
        children: [
          r && /* @__PURE__ */ n.jsx(r, { className: "h-4 w-4" }),
          o.label
        ]
      },
      o.id
    );
  }) });
}
const R = L(null);
function U({ children: e }) {
  const [t, a] = p(!1), [o, r] = p(
    () => typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia("(max-width: 1023px)").matches : !1
  ), [i, f] = p(
    /* @__PURE__ */ new Set()
  );
  C(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function")
      return;
    const c = window.matchMedia("(max-width: 1023px)"), h = (m) => {
      r(m.matches);
    };
    return c.addEventListener("change", h), () => c.removeEventListener("change", h);
  }, []);
  const u = j(() => {
    o || a((c) => !c);
  }, [o]), l = j((c) => {
    f((h) => {
      const m = new Set(h);
      return m.has(c) ? m.delete(c) : m.add(c), m;
    });
  }, []), s = j(
    (c) => i.has(c),
    [i]
  ), d = b(
    () => ({
      isCollapsed: o || t,
      toggleSidebar: u,
      collapsedSections: i,
      toggleSection: l,
      isSectionCollapsed: s
    }),
    [o, t, u, i, l, s]
  );
  return /* @__PURE__ */ n.jsx(R.Provider, { value: d, children: e });
}
function I() {
  const e = B(R);
  if (!e)
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  return e;
}
function $({ groups: e }) {
  return /* @__PURE__ */ n.jsx("div", { className: "flex flex-col items-center gap-0 py-2", role: "navigation", "aria-label": "Icon strip", children: e.map((t, a) => /* @__PURE__ */ n.jsxs("div", { className: "flex flex-col items-center gap-1 w-full", children: [
    a > 0 && /* @__PURE__ */ n.jsx("div", { className: "w-6 h-px bg-border my-1", "aria-hidden": "true" }),
    t.icons.map(
      (o, r) => o.onClick ? /* @__PURE__ */ n.jsx(
        v,
        {
          className: "flex items-center justify-center w-9 h-9 rounded-md",
          onClick: o.onClick,
          title: o.label,
          "aria-label": o.label,
          children: o.icon
        },
        r
      ) : /* @__PURE__ */ n.jsx(
        "span",
        {
          className: "flex items-center justify-center w-9 h-9 text-muted-foreground",
          "aria-hidden": "true",
          children: o.icon
        },
        r
      )
    )
  ] }, a)) });
}
function D(e) {
  if (e.length === 0 || e[0].icons.length === 0)
    return { logoIcon: null, remainingGroups: e };
  const [t, ...a] = e[0].icons, o = { icons: a }, r = a.length > 0 ? [o, ...e.slice(1)] : e.slice(1);
  return { logoIcon: t, remainingGroups: r };
}
function O({
  side: e,
  variant: t,
  iconStripGroups: a = [],
  children: o,
  hideToggle: r = !1,
  footer: i,
  collapsedContent: f
}) {
  const { isCollapsed: u, toggleSidebar: l } = I(), s = e === "left" ? u ? g : y : u ? y : g, d = u ? "Expand sidebar" : "Collapse sidebar";
  if (u && t === "full-hide")
    return /* @__PURE__ */ n.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-full-hide",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: i ? { overflow: "visible" } : void 0,
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
          i && /* @__PURE__ */ n.jsx("div", { className: "mt-auto", children: i })
        ]
      }
    );
  if (u && t === "icon-strip") {
    const c = e === "left", { logoIcon: h, remainingGroups: m } = c ? D(a) : { logoIcon: null, remainingGroups: a };
    return /* @__PURE__ */ n.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-icon-strip",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: i ? { overflow: "visible" } : void 0,
        children: [
          h && /* @__PURE__ */ n.jsxs(
            v,
            {
              className: "sidebar-logo-toggle",
              onClick: l,
              title: d,
              "aria-label": d,
              children: [
                /* @__PURE__ */ n.jsx("span", { className: "sidebar-logo-toggle-icon", children: h.icon }),
                /* @__PURE__ */ n.jsx(
                  g,
                  {
                    size: 14,
                    className: "sidebar-logo-toggle-chevron",
                    "aria-hidden": "true"
                  }
                )
              ]
            }
          ),
          m.length > 0 && /* @__PURE__ */ n.jsx($, { groups: m }),
          !h && /* @__PURE__ */ n.jsx(
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
          i && /* @__PURE__ */ n.jsx("div", { className: "mt-auto", children: i })
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
        !r && /* @__PURE__ */ n.jsx("div", { className: "sidebar-toggle-row", "data-side": e, children: /* @__PURE__ */ n.jsx(
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
        i && /* @__PURE__ */ n.jsx("div", { className: "sidebar-footer", children: i })
      ] })
    }
  );
}
function A({
  id: e,
  label: t,
  icon: a,
  collapsible: o = !0,
  children: r,
  actions: i
}) {
  const { isSectionCollapsed: f, toggleSection: u } = I(), l = o && f(e), s = () => {
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
          i && /* @__PURE__ */ n.jsx("span", { onClick: (c) => c.stopPropagation(), children: i }),
          o && /* @__PURE__ */ n.jsx("span", { className: "sidebar-section-chevron", "aria-hidden": "true", children: l ? /* @__PURE__ */ n.jsx(g, { size: 16 }) : /* @__PURE__ */ n.jsx(T, { size: 16 }) })
        ]
      }
    ),
    !l && /* @__PURE__ */ n.jsx("div", { className: "sidebar-section-content", children: r })
  ] });
}
function _(e, t, a) {
  const [o, r] = p(
    e.defaultState
  ), i = F(null), f = b(
    () => `${e.id}::${crypto.randomUUID()}`,
    [e.id, t]
  );
  C(() => {
    r(e.defaultState);
  }, [e.defaultState]);
  const u = {
    id: f,
    blockId: e.id,
    slotId: t,
    attrs: o,
    updateAttrs: (l) => {
      r((s) => ({ ...s, ...l }));
    }
  };
  return i.current = u, C(() => {
    if (!a) return;
    const l = [];
    for (const s of e.listensTo) {
      const d = e.onEvent[s];
      if (!d) continue;
      const c = a.on(s, (h) => {
        const m = i.current;
        if (m)
          return d(m, h);
      });
      l.push(c);
    }
    return () => {
      for (const s of l)
        s();
    };
  }, [e.listensTo, e.onEvent, a]), u;
}
const J = {
  workspaceId: "",
  user: null,
  viewMode: null
}, W = () => {
};
function te(e) {
  const t = b(() => {
    if ("bindings" in e)
      return e.bindings;
    const s = M.getInstance().resolveSlot(e.slotId);
    return (s == null ? void 0 : s.bindings) ?? [];
  }, ["bindings" in e ? e.bindings : e.slotId]);
  if (t.length === 0) return null;
  const a = e.slotId, o = "bindings" in e && "bus" in e, r = o ? e.context : e.context ?? J, i = e.bus, f = ("side" in e ? e.side : void 0) ?? "right", u = ("variant" in e ? e.variant : void 0) ?? "full-hide", l = ("iconStripGroups" in e ? e.iconStripGroups : void 0) ?? [];
  return /* @__PURE__ */ n.jsx(U, { children: /* @__PURE__ */ n.jsx(
    O,
    {
      side: f,
      variant: u,
      iconStripGroups: l,
      children: t.map((s) => {
        if (s.type !== "block") return null;
        if (i)
          return /* @__PURE__ */ n.jsx(
            K,
            {
              binding: s,
              slotId: a,
              bus: i,
              context: r
            },
            s.id
          );
        const d = s.component, c = r.actionContext ?? S(), h = r.invokeAction ?? N, m = {
          id: `${s.id}::static`,
          blockId: s.id,
          slotId: a,
          attrs: s.defaultState,
          updateAttrs: W
        };
        return /* @__PURE__ */ n.jsx(
          A,
          {
            id: s.id,
            label: s.label,
            icon: s.icon,
            children: /* @__PURE__ */ n.jsx(
              d,
              {
                context: r,
                instance: m,
                overrides: s.overrides,
                actionContext: c,
                invokeAction: h
              }
            )
          },
          s.id
        );
      })
    }
  ) });
}
function K({
  binding: e,
  slotId: t,
  bus: a,
  context: o
}) {
  const r = e.component, i = _(e, t, a), f = o.actionContext ?? S(), u = o.invokeAction ?? N, l = b(
    () => ({
      ...o,
      emitAction: (s, d) => {
        a.emit(`${e.id}.${s}`, {
          blockInstanceId: i.id,
          blockId: e.id,
          localId: s,
          payload: d
        });
      }
    }),
    [o, e.id, a, i.id]
  );
  return /* @__PURE__ */ n.jsx(
    A,
    {
      id: e.id,
      label: e.label,
      icon: e.icon,
      children: /* @__PURE__ */ n.jsx(
        r,
        {
          context: l,
          instance: i,
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
  constructor(t, a, o, r = []) {
    /**
     * Local event identifier, e.g. ``"entities-registered"``.
     * Combined with the block's global ID to form the full bus event key.
     */
    x(this, "id");
    /** ``"action"`` for auditable events, ``"ui"`` for in-workspace signals. */
    x(this, "category");
    /**
     * Audit classification.
     *
     * - ``"created" | "edited" | "deleted"`` — lifecycle or domain mutations.
     * - ``"ui"`` — workspace-internal signal (always paired with ``category: "ui"``).
     */
    x(this, "core");
    /** Reserved for future listen-by-tag.  Stored, not consumed. */
    x(this, "tags");
    this.id = t, this.category = a, this.core = o, this.tags = r;
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
function V(e, t) {
  return t === void 0 ? { type: "entity-reference", displayId: e } : { type: "entity-reference", displayId: e, schemaId: t };
}
function ne(e, t) {
  return V(t, e);
}
export {
  ae as ActionReference,
  Ne as ApiError,
  w as BlockEvent,
  ie as Button,
  ee as ButtonGroupRenderer,
  v as IconButton,
  re as Menu,
  ce as ModelReference,
  Re as NetworkError,
  le as ObjectReference,
  Ye as PortableBlockView,
  Oe as RecordValueInspector,
  de as ServiceReference,
  ue as SlotReference,
  te as SlotSidebar,
  me as TipTapRenderer,
  _e as UnavailableRecordCapability,
  fe as WorkspaceReference,
  Fe as canonicalJson,
  Ge as canonicalizeContractJson,
  ze as contractFingerprint,
  Ie as del,
  V as entityReference,
  he as evaluateCellFormula,
  xe as evaluateFormula,
  ve as evaluateRow,
  Je as exportPlatformRecord,
  pe as externalRoutePath,
  ge as functionCallsIn,
  Ae as get,
  Ze as getActionInvocation,
  We as getExactRecordRevision,
  Ke as getPlatformRecord,
  Ee as getText,
  et as invokeAction,
  Ue as isExactJsonNumber,
  Pe as isNotFoundError,
  be as legacyWorkspaceUrl,
  Ve as listPlatformRecords,
  qe as listRecordActivity,
  Qe as listRecordGroupRevisions,
  $e as parseExactContractJson,
  je as parseFormula,
  Te as patch,
  Me as post,
  Le as put,
  Ce as registrationId,
  tt as resolvePortableActionContext,
  ne as schemaReference,
  we as unimplementedFormulaFunctionsIn,
  Xe as uploadPlatformAttachment,
  ye as usesBackendOnlyFunction,
  ke as workspaceUrl
};
