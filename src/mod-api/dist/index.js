var I = Object.defineProperty;
var E = (e, t, a) => t in e ? I(e, t, { enumerable: !0, configurable: !0, writable: !0, value: a }) : e[t] = a;
var x = (e, t, a) => E(e, typeof t != "symbol" ? t + "" : t, a);
import { c as S, I as v, C as T, M as A } from "./editor-CuTS04NA.js";
import { A as ne, B as ae, a as oe, b as re, O as ie, S as ce, d as le, T as de, W as ue, e as me, f as fe, g as he, h as xe, i as ve, l as pe, p as ge, r as be, u as je, j as we, w as ye } from "./editor-CuTS04NA.js";
import { j as s } from "./jsx-runtime-D1SHvdVE.js";
import { createContext as M, useState as p, useEffect as w, useCallback as j, useMemo as b, useContext as L, useRef as P } from "react";
import "@tiptap/react";
import "react-dom";
import { ApiError as Se, NetworkError as Ne, del as Re, get as ke, getText as Ie, isNotFoundError as Ee, patch as Te, post as Ae, put as Me } from "./api.js";
import { canonicalJson as Pe, canonicalizeContractJson as Fe, contractFingerprint as Ge, isExactJsonNumber as Be, parseExactContractJson as ze } from "./contracts.js";
import { RecordValueInspector as $e, UnavailableRecordCapability as De, exportPlatformRecord as Oe, getExactRecordRevision as _e, getPlatformRecord as Je, listPlatformRecords as We, listRecordActivity as Ke, listRecordGroupRevisions as qe, uploadPlatformAttachment as Qe } from "./records.js";
/**
 * @license lucide-react v1.26.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const F = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]], C = S("chevron-left", F);
/**
 * @license lucide-react v1.26.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const G = [["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }]], g = S("chevron-right", G);
function Y({
  bindings: e,
  bus: t,
  context: a
}) {
  return e.length === 0 ? null : /* @__PURE__ */ s.jsx("div", { className: "flex items-center gap-1", children: e.map((n) => {
    const i = n.icon;
    return /* @__PURE__ */ s.jsxs(
      "button",
      {
        type: "button",
        className: "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary hover:bg-hover hover:text-primary transition-colors",
        onClick: () => n.onClick({ bus: t, context: a }),
        "aria-label": n.label,
        children: [
          i && /* @__PURE__ */ s.jsx(i, { className: "h-4 w-4" }),
          n.label
        ]
      },
      n.id
    );
  }) });
}
const N = M(null);
function B({ children: e }) {
  const [t, a] = p(!1), [n, i] = p(
    () => typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia("(max-width: 1023px)").matches : !1
  ), [r, m] = p(
    /* @__PURE__ */ new Set()
  );
  w(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function")
      return;
    const c = window.matchMedia("(max-width: 1023px)"), h = (f) => {
      i(f.matches);
    };
    return c.addEventListener("change", h), () => c.removeEventListener("change", h);
  }, []);
  const d = j(() => {
    n || a((c) => !c);
  }, [n]), l = j((c) => {
    m((h) => {
      const f = new Set(h);
      return f.has(c) ? f.delete(c) : f.add(c), f;
    });
  }, []), o = j(
    (c) => r.has(c),
    [r]
  ), u = b(
    () => ({
      isCollapsed: n || t,
      toggleSidebar: d,
      collapsedSections: r,
      toggleSection: l,
      isSectionCollapsed: o
    }),
    [n, t, d, r, l, o]
  );
  return /* @__PURE__ */ s.jsx(N.Provider, { value: u, children: e });
}
function R() {
  const e = L(N);
  if (!e)
    throw new Error("useSidebar must be used inside <SidebarProvider>.");
  return e;
}
function z({ groups: e }) {
  return /* @__PURE__ */ s.jsx("div", { className: "flex flex-col items-center gap-0 py-2", role: "navigation", "aria-label": "Icon strip", children: e.map((t, a) => /* @__PURE__ */ s.jsxs("div", { className: "flex flex-col items-center gap-1 w-full", children: [
    a > 0 && /* @__PURE__ */ s.jsx("div", { className: "w-6 h-px bg-border my-1", "aria-hidden": "true" }),
    t.icons.map(
      (n, i) => n.onClick ? /* @__PURE__ */ s.jsx(
        v,
        {
          className: "flex items-center justify-center w-9 h-9 rounded-md",
          onClick: n.onClick,
          title: n.label,
          "aria-label": n.label,
          children: n.icon
        },
        i
      ) : /* @__PURE__ */ s.jsx(
        "span",
        {
          className: "flex items-center justify-center w-9 h-9 text-muted-foreground",
          "aria-hidden": "true",
          children: n.icon
        },
        i
      )
    )
  ] }, a)) });
}
function U(e) {
  if (e.length === 0 || e[0].icons.length === 0)
    return { logoIcon: null, remainingGroups: e };
  const [t, ...a] = e[0].icons, n = { icons: a }, i = a.length > 0 ? [n, ...e.slice(1)] : e.slice(1);
  return { logoIcon: t, remainingGroups: i };
}
function $({
  side: e,
  variant: t,
  iconStripGroups: a = [],
  children: n,
  hideToggle: i = !1,
  footer: r,
  collapsedContent: m
}) {
  const { isCollapsed: d, toggleSidebar: l } = R(), o = e === "left" ? d ? g : C : d ? C : g, u = d ? "Expand sidebar" : "Collapse sidebar";
  if (d && t === "full-hide")
    return /* @__PURE__ */ s.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-full-hide",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: r ? { overflow: "visible" } : void 0,
        children: [
          /* @__PURE__ */ s.jsx(
            v,
            {
              className: "sidebar-toggle",
              onClick: l,
              title: u,
              "aria-label": u,
              children: /* @__PURE__ */ s.jsx(o, { size: 16 })
            }
          ),
          m,
          r && /* @__PURE__ */ s.jsx("div", { className: "mt-auto", children: r })
        ]
      }
    );
  if (d && t === "icon-strip") {
    const c = e === "left", { logoIcon: h, remainingGroups: f } = c ? U(a) : { logoIcon: null, remainingGroups: a };
    return /* @__PURE__ */ s.jsxs(
      "aside",
      {
        className: "collapsible-sidebar is-collapsed variant-icon-strip",
        "data-side": e,
        role: "complementary",
        "aria-label": e === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)",
        style: r ? { overflow: "visible" } : void 0,
        children: [
          h && /* @__PURE__ */ s.jsxs(
            v,
            {
              className: "sidebar-logo-toggle",
              onClick: l,
              title: u,
              "aria-label": u,
              children: [
                /* @__PURE__ */ s.jsx("span", { className: "sidebar-logo-toggle-icon", children: h.icon }),
                /* @__PURE__ */ s.jsx(
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
          f.length > 0 && /* @__PURE__ */ s.jsx(z, { groups: f }),
          !h && /* @__PURE__ */ s.jsx(
            v,
            {
              className: "sidebar-toggle",
              onClick: l,
              title: u,
              "aria-label": u,
              children: /* @__PURE__ */ s.jsx(o, { size: 16 })
            }
          ),
          m,
          r && /* @__PURE__ */ s.jsx("div", { className: "mt-auto", children: r })
        ]
      }
    );
  }
  return /* @__PURE__ */ s.jsx(
    "aside",
    {
      className: "collapsible-sidebar is-expanded",
      "data-side": e,
      role: "complementary",
      "aria-label": e === "left" ? "Left sidebar" : "Right sidebar",
      children: /* @__PURE__ */ s.jsxs("div", { className: "sidebar-content", children: [
        !i && /* @__PURE__ */ s.jsx("div", { className: "sidebar-toggle-row", "data-side": e, children: /* @__PURE__ */ s.jsx(
          v,
          {
            className: "sidebar-toggle",
            onClick: l,
            title: u,
            "aria-label": u,
            children: /* @__PURE__ */ s.jsx(o, { size: 16 })
          }
        ) }),
        n,
        r && /* @__PURE__ */ s.jsx("div", { className: "sidebar-footer", children: r })
      ] })
    }
  );
}
function k({
  id: e,
  label: t,
  icon: a,
  collapsible: n = !0,
  children: i,
  actions: r
}) {
  const { isSectionCollapsed: m, toggleSection: d } = R(), l = n && m(e), o = () => {
    n && d(e);
  }, u = (c) => {
    n && (c.key === "Enter" || c.key === " ") && (c.preventDefault(), d(e));
  };
  return /* @__PURE__ */ s.jsxs("div", { className: "sidebar-section", "data-section-id": e, children: [
    /* @__PURE__ */ s.jsxs(
      "div",
      {
        className: "sidebar-section-header",
        onClick: o,
        role: n ? "button" : void 0,
        tabIndex: n ? 0 : void 0,
        onKeyDown: u,
        "aria-expanded": n ? !l : void 0,
        "aria-label": n ? `${t} section` : void 0,
        children: [
          a && /* @__PURE__ */ s.jsx(a, { size: 16, className: "sidebar-section-icon" }),
          /* @__PURE__ */ s.jsx("span", { className: "sidebar-section-label", children: t }),
          r && /* @__PURE__ */ s.jsx("span", { onClick: (c) => c.stopPropagation(), children: r }),
          n && /* @__PURE__ */ s.jsx("span", { className: "sidebar-section-chevron", "aria-hidden": "true", children: l ? /* @__PURE__ */ s.jsx(g, { size: 16 }) : /* @__PURE__ */ s.jsx(T, { size: 16 }) })
        ]
      }
    ),
    !l && /* @__PURE__ */ s.jsx("div", { className: "sidebar-section-content", children: i })
  ] });
}
function D(e, t, a) {
  const [n, i] = p(
    e.defaultState
  ), r = P(null), m = b(
    () => `${e.id}::${crypto.randomUUID()}`,
    [e.id, t]
  );
  w(() => {
    i(e.defaultState);
  }, [e.defaultState]);
  const d = {
    id: m,
    blockId: e.id,
    slotId: t,
    attrs: n,
    updateAttrs: (l) => {
      i((o) => ({ ...o, ...l }));
    }
  };
  return r.current = d, w(() => {
    if (!a) return;
    const l = [];
    for (const o of e.listensTo) {
      const u = e.onEvent[o];
      if (!u) continue;
      const c = a.on(o, (h) => {
        const f = r.current;
        if (f)
          return u(f, h);
      });
      l.push(c);
    }
    return () => {
      for (const o of l)
        o();
    };
  }, [e.listensTo, e.onEvent, a]), d;
}
const O = {
  workspaceId: "",
  user: null,
  viewMode: null
}, _ = () => {
};
function Z(e) {
  const t = b(() => {
    if ("bindings" in e)
      return e.bindings;
    const o = A.getInstance().resolveSlot(e.slotId);
    return (o == null ? void 0 : o.bindings) ?? [];
  }, ["bindings" in e ? e.bindings : e.slotId]);
  if (t.length === 0) return null;
  const a = e.slotId, n = "bindings" in e && "bus" in e, i = n ? e.context : e.context ?? O, r = e.bus, m = ("side" in e ? e.side : void 0) ?? "right", d = ("variant" in e ? e.variant : void 0) ?? "full-hide", l = ("iconStripGroups" in e ? e.iconStripGroups : void 0) ?? [];
  return /* @__PURE__ */ s.jsx(B, { children: /* @__PURE__ */ s.jsx(
    $,
    {
      side: m,
      variant: d,
      iconStripGroups: l,
      children: t.map((o) => {
        if (o.type !== "block") return null;
        if (r)
          return /* @__PURE__ */ s.jsx(
            J,
            {
              binding: o,
              slotId: a,
              bus: r,
              context: i
            },
            o.id
          );
        const u = o.component, c = {
          id: `${o.id}::static`,
          blockId: o.id,
          slotId: a,
          attrs: o.defaultState,
          updateAttrs: _
        };
        return /* @__PURE__ */ s.jsx(
          k,
          {
            id: o.id,
            label: o.label,
            icon: o.icon,
            children: /* @__PURE__ */ s.jsx(
              u,
              {
                context: i,
                instance: c,
                overrides: o.overrides
              }
            )
          },
          o.id
        );
      })
    }
  ) });
}
function J({
  binding: e,
  slotId: t,
  bus: a,
  context: n
}) {
  const i = e.component, r = D(e, t, a), m = b(
    () => ({
      ...n,
      emitAction: (d, l) => {
        a.emit(`${e.id}.${d}`, {
          blockInstanceId: r.id,
          blockId: e.id,
          localId: d,
          payload: l
        });
      }
    }),
    [n, e.id, a, r.id]
  );
  return /* @__PURE__ */ s.jsx(
    k,
    {
      id: e.id,
      label: e.label,
      icon: e.icon,
      children: /* @__PURE__ */ s.jsx(
        i,
        {
          context: m,
          instance: r,
          overrides: e.overrides
        }
      )
    }
  );
}
class y {
  // ── Construction ──────────────────────────────────────────────────────
  constructor(t, a, n, i = []) {
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
    this.id = t, this.category = a, this.core = n, this.tags = i;
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
    return new y(t.id, "action", t.core, t.tags);
  }
  /**
   * Create a UI-only workspace signal.
   *
   * Produces ``category: "ui"`` with ``core: "ui"``.  These events stay
   * on the bus and never hit the database — they are for in-workspace
   * communication between blocks (e.g. column resized, sort changed).
   */
  static ui(t) {
    return new y(t.id, "ui", "ui", t.tags);
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
function ee(e, t) {
  return W(t, e);
}
export {
  ne as ActionReference,
  Se as ApiError,
  y as BlockEvent,
  ae as Button,
  Y as ButtonGroupRenderer,
  v as IconButton,
  oe as Menu,
  re as ModelReference,
  Ne as NetworkError,
  ie as ObjectReference,
  $e as RecordValueInspector,
  ce as ServiceReference,
  le as SlotReference,
  Z as SlotSidebar,
  de as TipTapRenderer,
  De as UnavailableRecordCapability,
  ue as WorkspaceReference,
  Pe as canonicalJson,
  Fe as canonicalizeContractJson,
  Ge as contractFingerprint,
  Re as del,
  W as entityReference,
  me as evaluateCellFormula,
  fe as evaluateFormula,
  he as evaluateRow,
  Oe as exportPlatformRecord,
  xe as externalRoutePath,
  ve as functionCallsIn,
  ke as get,
  _e as getExactRecordRevision,
  Je as getPlatformRecord,
  Ie as getText,
  Be as isExactJsonNumber,
  Ee as isNotFoundError,
  pe as legacyWorkspaceUrl,
  We as listPlatformRecords,
  Ke as listRecordActivity,
  qe as listRecordGroupRevisions,
  ze as parseExactContractJson,
  ge as parseFormula,
  Te as patch,
  Ae as post,
  Me as put,
  be as registrationId,
  ee as schemaReference,
  je as unimplementedFormulaFunctionsIn,
  Qe as uploadPlatformAttachment,
  we as usesBackendOnlyFunction,
  ye as workspaceUrl
};
