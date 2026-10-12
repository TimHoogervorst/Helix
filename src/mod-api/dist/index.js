var S = Object.defineProperty;
var L = (e, t, r) => t in e ? S(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var k = (e, t, r) => L(e, typeof t != "symbol" ? t + "" : t, r);
class U {
  // ── Construction ──────────────────────────────────────────────────────
  constructor(t, r, i, a = []) {
    /**
     * Local event identifier, e.g. ``"entities-registered"``.
     * Combined with the block's global ID to form the full bus event key.
     */
    k(this, "id");
    /** ``"action"`` for auditable events, ``"ui"`` for in-workspace signals. */
    k(this, "category");
    /**
     * Audit classification.
     *
     * - ``"created" | "edited" | "deleted"`` — lifecycle or domain mutations.
     * - ``"ui"`` — workspace-internal signal (always paired with ``category: "ui"``).
     */
    k(this, "core");
    /** Reserved for future listen-by-tag.  Stored, not consumed. */
    k(this, "tags");
    this.id = t, this.category = r, this.core = i, this.tags = a;
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
    return new U(t.id, "action", t.core, t.tags);
  }
  /**
   * Create a UI-only workspace signal.
   *
   * Produces ``category: "ui"`` with ``core: "ui"``.  These events stay
   * on the bus and never hit the database — they are for in-workspace
   * communication between blocks (e.g. column resized, sort changed).
   */
  static ui(t) {
    return new U(t.id, "ui", "ui", t.tags);
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
const N = /* @__PURE__ */ new Map(), O = /* @__PURE__ */ new Set([
  "IF",
  "IFERROR",
  "AND",
  "OR",
  "NOT",
  "ROUND",
  "ABS",
  "MIN",
  "MAX",
  "SUM",
  "AVERAGE",
  "COUNT",
  "CONCAT",
  "UPPER",
  "LOWER",
  "LEN"
]);
function R() {
  return /* @__PURE__ */ new Set([
    ...O,
    ...N.keys()
  ]);
}
const d = (e, t) => ({
  ok: !1,
  error: { code: e, message: t }
}), f = (e) => ({ ok: !0, value: e });
function C(e) {
  const t = [];
  for (let r = 0; r < e.length; ) {
    if (/\s/.test(e[r])) {
      r++;
      continue;
    }
    const i = e[r];
    if (i === "[") {
      const u = e.indexOf("]", r + 1);
      if (u < 0 || u === r + 1) throw Error("Invalid column reference");
      t.push({
        kind: "reference",
        value: e.slice(r + 1, u)
      }), r = u + 1;
      continue;
    }
    if (i === '"' || i === "'") {
      const u = i;
      let n = "", o = r + 1;
      for (; o < e.length && e[o] !== u; )
        e[o] === "\\" && o++, o < e.length && (n += e[o++]);
      if (e[o] !== u) throw Error("Unclosed string literal");
      t.push({ kind: "value", value: JSON.stringify(n) }), r = o + 1;
      continue;
    }
    const a = e.slice(r).match(/^\d+(?:\.\d+)?/);
    if (a) {
      t.push({ kind: "value", value: a[0] }), r += a[0].length;
      continue;
    }
    const s = e.slice(r).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (s) {
      t.push({ kind: "value", value: s[0] }), r += s[0].length;
      continue;
    }
    const h = e.slice(r).match(/^(<=|>=|<>|!=|==|[+\-*\/%^<>=])/);
    if (h) {
      t.push({ kind: "operator", value: h[0] }), r += h[0].length;
      continue;
    }
    if (i === "(") t.push({ kind: "left", value: i });
    else if (i === ")") t.push({ kind: "right", value: i });
    else if (i === ",") t.push({ kind: "comma", value: i });
    else throw Error(`Unexpected character '${i}'`);
    r++;
  }
  return t;
}
class F {
  constructor(t) {
    k(this, "index", 0);
    this.tokens = t;
  }
  current() {
    return this.tokens[this.index];
  }
  take() {
    const t = this.current();
    if (!t) throw Error("Unexpected end of formula");
    return this.index++, t;
  }
  has(t, r) {
    const i = this.current();
    return !!i && i.kind === t && (r === void 0 || i.value === r);
  }
  parse() {
    if (!this.tokens.length) throw Error("Formula cannot be empty");
    const t = this.comparison();
    if (this.current()) throw Error("Unexpected token");
    return t;
  }
  comparison() {
    let t = this.term();
    for (; this.has("operator") && ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(
      this.current().value
    ); )
      t = {
        kind: "binary",
        operator: this.take().value,
        left: t,
        right: this.term()
      };
    return t;
  }
  term() {
    let t = this.factor();
    for (; this.has("operator") && ["+", "-"].includes(this.current().value); )
      t = {
        kind: "binary",
        operator: this.take().value,
        left: t,
        right: this.factor()
      };
    return t;
  }
  factor() {
    let t = this.unary();
    for (; this.has("operator") && ["*", "/", "%", "^"].includes(this.current().value); )
      t = {
        kind: "binary",
        operator: this.take().value,
        left: t,
        right: this.unary()
      };
    return t;
  }
  unary() {
    return this.has("operator", "-") || this.has("operator", "+") ? {
      kind: "unary",
      operator: this.take().value,
      operand: this.unary()
    } : this.primary();
  }
  primary() {
    const t = this.take();
    if (t.kind === "reference")
      return { kind: "reference", name: t.value };
    if (t.kind === "left") {
      const i = this.comparison();
      if (!this.has("right")) throw Error("Expected ')' ");
      return this.take(), i;
    }
    if (t.kind !== "value") throw Error("Expected a value");
    if (/^\d/.test(t.value))
      return { kind: "literal", value: Number(t.value) };
    if (t.value.startsWith('"'))
      return { kind: "literal", value: JSON.parse(t.value) };
    const r = t.value.includes(".") ? t.value : t.value.toUpperCase();
    if (this.has("left")) {
      this.take();
      const i = [];
      if (!this.has("right"))
        do {
          if (i.push(this.comparison()), !this.has("comma")) break;
          this.take();
        } while (!this.has("right"));
      if (!this.has("right"))
        throw Error("Expected ')' after function arguments");
      return this.take(), { kind: "call", name: r, args: i };
    }
    if (r === "TRUE") return { kind: "literal", value: !0 };
    if (r === "FALSE") return { kind: "literal", value: !1 };
    if (r === "NULL") return { kind: "literal", value: null };
    throw Error(`Unknown name '${t.value}'`);
  }
}
function b(e) {
  try {
    return {
      ok: !0,
      value: null,
      ast: new F(C(e)).parse()
    };
  } catch (t) {
    return d("#SYNTAX!", t instanceof Error ? t.message : "Invalid formula");
  }
}
function v(e, t) {
  t(e), e.kind === "unary" ? v(e.operand, t) : e.kind === "binary" ? (v(e.left, t), v(e.right, t)) : e.kind === "call" && e.args.forEach((r) => v(r, t));
}
function T(e) {
  const t = b(e);
  if (!t.ok || !t.ast) return [];
  const r = [];
  return v(t.ast, (i) => {
    i.kind === "call" && r.push(i.name);
  }), r;
}
function I(e, t = R()) {
  const r = T(e);
  return [...O, ...N.keys()], [...new Set(r)].filter((i) => !t.has(i));
}
function x(e, t = R()) {
  return I(e, t).length > 0;
}
function g(e) {
  return e.ok ? typeof e.value == "number" ? e.value : typeof e.value == "string" && e.value.trim() !== "" && !Number.isNaN(Number(e.value)) ? Number(e.value) : d("#VALUE!", "Expected a number") : e;
}
function M(e) {
  return e.ok ? e.value !== null && e.value !== !1 && e.value !== "" && e.value !== 0 : e;
}
function p(e, t, r) {
  var u;
  if (e.kind === "literal") return f(e.value);
  if (e.kind === "reference") {
    const n = e.name.match(/^(.*):(\d+)$/), o = n ? n[1] : e.name;
    if ((u = r == null ? void 0 : r.forbiddenColumns) != null && u.has(o))
      return d("#REF!", `Column '${o}' cannot be referenced`);
    const l = (n ? r == null ? void 0 : r.rows[Number(n[2]) - 1] : r == null ? void 0 : r.rows[r.rowIndex]) ?? t;
    return Object.prototype.hasOwnProperty.call(l, o) ? f(l[o]) : d("#REF!", `Unknown column '${o}'`);
  }
  if (e.kind === "unary") {
    const n = g(p(e.operand, t, r));
    return typeof n == "number" ? f(e.operator === "-" ? -n : n) : n;
  }
  if (e.kind === "binary") {
    const n = p(e.left, t, r), o = p(e.right, t, r);
    if (!n.ok) return n;
    if (!o.ok) return o;
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(e.operator)) {
      const m = n.value === o.value;
      if (["=", "=="].includes(e.operator)) return f(m);
      if (["!=", "<>"].includes(e.operator)) return f(!m);
      const y = typeof n.value == "number" ? n.value : String(n.value), w = typeof o.value == "number" ? o.value : String(o.value);
      return f(
        e.operator === "<" ? y < w : e.operator === "<=" ? y <= w : e.operator === ">" ? y > w : y >= w
      );
    }
    const c = g(n), l = g(o);
    return typeof c != "number" ? c : typeof l != "number" ? l : (e.operator === "/" || e.operator === "%") && l === 0 ? d("#DIV/0!", "Division by zero") : f(
      e.operator === "+" ? c + l : e.operator === "-" ? c - l : e.operator === "*" ? c * l : e.operator === "/" ? c / l : e.operator === "%" ? (c % l + l) % l : Math.pow(c, l)
    );
  }
  const i = N.get(e.name);
  if (i) {
    const n = e.args.map((c) => p(c, t, r)), o = n.find((c) => !c.ok);
    return o && !o.ok ? o : i(n);
  }
  if (e.name === "IF") {
    if (e.args.length !== 3)
      return d("#VALUE!", "IF expects three arguments");
    const n = M(p(e.args[0], t, r));
    return typeof n == "boolean" ? p(n ? e.args[1] : e.args[2], t, r) : n;
  }
  if (e.name === "IFERROR") {
    if (e.args.length !== 2)
      return d("#VALUE!", "IFERROR expects two arguments");
    const n = p(e.args[0], t, r);
    return n.ok ? n : p(e.args[1], t, r);
  }
  const a = e.args.map((n) => p(n, t, r)), s = a.find((n) => !n.ok);
  if (s && !s.ok) return s;
  const h = a.map(
    (n) => n.value
  );
  switch (e.name) {
    case "AND":
      return f(h.every(Boolean));
    case "OR":
      return f(h.some(Boolean));
    case "NOT":
      return a.length === 1 ? f(!h[0]) : d("#VALUE!", "NOT expects one argument");
    case "ROUND": {
      if (a.length < 1 || a.length > 2)
        return d("#VALUE!", "ROUND expects one or two arguments");
      const n = g(a[0]), o = g(a[1] ?? f(0));
      if (typeof n != "number") return n;
      if (typeof o != "number") return o;
      const c = Math.pow(10, o);
      return f(Math.round(n * c) / c);
    }
    case "ABS": {
      if (a.length !== 1) return d("#VALUE!", "ABS expects one argument");
      const n = g(a[0]);
      return typeof n == "number" ? f(Math.abs(n)) : n;
    }
    case "MIN":
    case "MAX": {
      if (!a.length)
        return d("#VALUE!", `${e.name} expects at least one argument`);
      const n = a.map(g);
      return n.find((c) => typeof c != "number") ?? f(
        e.name === "MIN" ? Math.min(...n) : Math.max(...n)
      );
    }
    case "SUM":
    case "AVERAGE": {
      if (!a.length)
        return d("#VALUE!", `${e.name} expects at least one argument`);
      const n = a.map(g), o = n.find((l) => typeof l != "number");
      if (o) return o;
      const c = n.reduce((l, m) => l + m, 0);
      return f(e.name === "SUM" ? c : c / n.length);
    }
    case "COUNT":
      return a.length ? f(a.filter((n) => typeof g(n) == "number").length) : d("#VALUE!", "COUNT expects at least one argument");
    case "CONCAT":
      return f(h.map((n) => n ?? "").join(""));
    case "UPPER":
      return a.length === 1 ? f(String(h[0] ?? "").toUpperCase()) : d("#VALUE!", "UPPER expects one argument");
    case "LOWER":
      return a.length === 1 ? f(String(h[0] ?? "").toLowerCase()) : d("#VALUE!", "LOWER expects one argument");
    case "LEN":
      return a.length === 1 ? f(String(h[0] ?? "").length) : d("#VALUE!", "LEN expects one argument");
    default:
      return d("#NAME?", `Unknown function '${e.name}'`);
  }
}
function W(e, t) {
  const r = b(e);
  return r.ok && r.ast ? p(r.ast, t) : r;
}
function z(e, t, r) {
  const i = b(e.replace(/^=/, ""));
  return i.ok && i.ast ? p(i.ast, t, r) : i;
}
function P(e, t) {
  v(e, (r) => {
    r.kind === "reference" && t.add(r.name);
  });
}
function G(e, t) {
  const r = Object.fromEntries(
    Object.entries(e).map(([s, h]) => [s, f(h)])
  ), i = /* @__PURE__ */ new Map(), a = (s) => {
    if (r[s] && !t[s]) return r[s];
    if (i.get(s) === "visiting")
      return d("#CYCLE!", `Circular dependency involving '${s}'`);
    if (i.get(s) === "done") return r[s];
    const h = t[s];
    if (!h) return d("#REF!", `Unknown column '${s}'`);
    i.set(s, "visiting");
    const u = b(h.expression);
    if (!u.ok || !u.ast)
      return r[s] = u, i.set(s, "done"), u;
    const n = /* @__PURE__ */ new Set();
    P(u.ast, n);
    for (const l of n)
      if (t[l]) {
        const m = a(l);
        if (!m.ok)
          return r[s] = m, i.set(s, "done"), m;
      }
    const o = Object.fromEntries(
      Object.entries(r).map(([l, m]) => [l, m.ok ? m.value : null])
    ), c = p(u.ast, o);
    return r[s] = c, i.set(s, "done"), c;
  };
  return Object.keys(t).forEach(a), r;
}
const V = "/api";
class A extends Error {
  constructor(r, i) {
    super(`API error: ${r}`);
    k(this, "status");
    k(this, "data");
    this.status = r, this.data = i;
  }
}
class $ extends Error {
  constructor(t) {
    super(t), this.name = "NetworkError";
  }
}
function D(e) {
  var i;
  const r = `; ${document.cookie}`.split(`; ${e}=`);
  return r.length === 2 ? ((i = r.pop()) == null ? void 0 : i.split(";").shift()) ?? null : null;
}
const j = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
async function E(e, t = {}) {
  const { body: r, headers: i, ...a } = t, s = (a.method || "GET").toUpperCase(), h = {
    "Content-Type": "application/json",
    ...i
  };
  if (j.has(s)) {
    const n = D("csrftoken");
    n && (h["X-CSRFToken"] = n);
  }
  let u;
  try {
    u = await fetch(`${V}${e}`, {
      ...a,
      headers: h,
      body: r ? JSON.stringify(r) : void 0
    });
  } catch (n) {
    throw new $(
      n instanceof Error ? n.message : "Network request failed"
    );
  }
  if (u.status === 401 || u.status === 403)
    throw window.location.pathname.startsWith("/login") || (window.location.href = "/login"), new A(u.status, { detail: "Authentication required." });
  if (!u.ok) {
    const n = await u.json().catch(() => null);
    throw new A(u.status, n);
  }
  if (u.status !== 204)
    return u.json();
}
function H(e, t) {
  return E(e, { method: "GET", signal: t });
}
function X(e, t, r, i) {
  return E(e, {
    method: "POST",
    body: t,
    signal: r,
    headers: i
  });
}
function J(e, t, r, i) {
  return E(e, {
    method: "PUT",
    body: t,
    signal: r,
    headers: i
  });
}
function Y(e, t, r) {
  return E(e, { method: "PATCH", body: t, signal: r });
}
function Z(e, t) {
  return E(e, { method: "DELETE", signal: t });
}
function _(e) {
  return e instanceof A && e.status === 404;
}
function B(e, t) {
  return t === void 0 ? { type: "entity-reference", displayId: e } : { type: "entity-reference", displayId: e, schemaId: t };
}
function K(e, t) {
  return B(t, e);
}
export {
  A as ApiError,
  U as BlockEvent,
  $ as NetworkError,
  Z as del,
  B as entityReference,
  z as evaluateCellFormula,
  W as evaluateFormula,
  G as evaluateRow,
  T as functionCallsIn,
  H as get,
  _ as isNotFoundError,
  b as parseFormula,
  Y as patch,
  X as post,
  J as put,
  K as schemaReference,
  I as unimplementedFormulaFunctionsIn,
  x as usesBackendOnlyFunction
};
