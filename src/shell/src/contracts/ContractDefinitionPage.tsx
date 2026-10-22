import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, getText, isNotFoundError } from "../api/client";
import {
  canonicalJson,
  canonicalizeContractJson,
  isExactJsonNumber,
  parseExactContractJson,
} from "../../../mod-api/src/contracts";
import type { CanonicalJsonValue, ContractKind } from "../../../mod-api/src/contracts";

interface RetainedContract {
  kind: ContractKind;
  id: string;
  version: string;
  description: string;
  definition: { readonly [key: string]: CanonicalJsonValue };
}

type PageState =
  | { status: "loading" }
  | { status: "loaded"; contract: RetainedContract }
  | { status: "not-found" }
  | { status: "error"; message: string };

function isRecord(
  value: CanonicalJsonValue,
): value is { readonly [key: string]: CanonicalJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isExactJsonNumber(value);
}

function readContract(source: string): RetainedContract {
  canonicalizeContractJson(source);
  const value = parseExactContractJson(source);
  if (!isRecord(value) || !isRecord(value.definition)) {
    throw new TypeError("The retained contract response has an invalid shape.");
  }
  if (
    (value.kind !== "data" && value.kind !== "action") ||
    typeof value.id !== "string" ||
    typeof value.version !== "string" ||
    typeof value.description !== "string"
  ) {
    throw new TypeError("The retained contract response has an invalid identity.");
  }
  return {
    kind: value.kind,
    id: value.id,
    version: value.version,
    description: value.description,
    definition: value.definition,
  };
}

function field(value: { readonly [key: string]: CanonicalJsonValue }, name: string) {
  return value[name];
}

function stringField(
  value: { readonly [key: string]: CanonicalJsonValue },
  name: string,
): string | undefined {
  const candidate = value[name];
  return typeof candidate === "string" ? candidate : undefined;
}

function DefinitionType({ value, path }: { value: CanonicalJsonValue; path: string }) {
  if (!isRecord(value) || typeof value.type !== "string") {
    return <JsonFallback value={value} label={path} />;
  }

  const type = value.type;
  const description = stringField(value, "description");
  if (type === "object") {
    const fields = field(value, "fields");
    const additionalValues = field(value, "additionalValues");
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type={type} description={description} />
        {isRecord(fields) && (
          <div className="mt-4 grid gap-3 border-l border-[var(--color-ink-hairline)] pl-4">
            {Object.entries(fields).map(([name, child]) => (
              <DefinitionType key={name} value={child} path={name} />
            ))}
          </div>
        )}
        {additionalValues !== undefined && (
          <div className="mt-4">
            <p className="font-label text-xs uppercase tracking-wide text-muted-foreground">Additional values</p>
            <DefinitionType value={additionalValues} path={`${path} additional values`} />
          </div>
        )}
      </section>
    );
  }
  if (type === "array") {
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type="array" description={description} />
        {field(value, "items") !== undefined && (
          <div className="mt-4 border-l border-[var(--color-ink-hairline)] pl-4">
            <DefinitionType value={field(value, "items")!} path={`${path} item`} />
          </div>
        )}
        <ConstraintList value={value} excluded={["type", "items", "description"]} />
      </section>
    );
  }
  if (type === "optional") {
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type="optional" description={description} />
        {field(value, "valueType") !== undefined && (
          <div className="mt-4 border-l border-[var(--color-ink-hairline)] pl-4">
            <DefinitionType value={field(value, "valueType")!} path={`${path} value`} />
          </div>
        )}
      </section>
    );
  }
  if (type === "variant") {
    const cases = field(value, "cases");
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type={`variant · ${stringField(value, "tag") ?? "tag"}`} description={description} />
        {isRecord(cases) && (
          <div className="mt-4 grid gap-3 border-l border-[var(--color-ink-hairline)] pl-4">
            {Object.entries(cases).map(([name, child]) => (
              <DefinitionType key={name} value={child} path={name} />
            ))}
          </div>
        )}
      </section>
    );
  }
  if (type === "quantity") {
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type={`quantity · ${stringField(value, "unit") ?? "unit unknown"}`} description={description} />
        <p className="mt-2 text-sm text-muted-foreground">Numeric value</p>
      </section>
    );
  }
  if (["string", "number", "boolean", "date", "datetime", "recordReference", "attachmentReference"].includes(type)) {
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type={type} description={description} />
        <ConstraintList value={value} excluded={["type", "description"]} />
      </section>
    );
  }
  if (type === "contract") {
    return (
      <section className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-5">
        <TypeHeading type="exact contract reference" description={description} />
        <p className="mt-2 font-label text-sm">
          {stringField(value, "kind")} · {stringField(value, "id")} · {stringField(value, "version")}
        </p>
      </section>
    );
  }
  return <JsonFallback value={value} label={`${path} · unrecognized definition type`} />;
}

function TypeHeading({ type, description }: { type: string; description?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-label text-sm font-semibold text-ink">{type}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function ConstraintList({
  value,
  excluded,
}: {
  value: { readonly [key: string]: CanonicalJsonValue };
  excluded: string[];
}) {
  const constraints = Object.entries(value).filter(([key]) => !excluded.includes(key));
  if (constraints.length === 0) return null;
  return (
    <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-[var(--color-ink-hairline)] pt-3 sm:grid-cols-[auto_1fr]">
      {constraints.map(([name, constraint]) => (
        <div key={name} className="contents">
          <dt className="font-label text-xs text-muted-foreground">{name}</dt>
          <dd className="break-all font-label text-xs text-ink">{canonicalJson(constraint)}</dd>
        </div>
      ))}
    </dl>
  );
}

function JsonFallback({ value, label }: { value: CanonicalJsonValue; label: string }) {
  return (
    <details className="rounded-lg border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-4">
      <summary className="cursor-pointer font-label text-xs text-muted-foreground">{label}</summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all font-label text-xs text-ink">
        {canonicalJson(value)}
      </pre>
    </details>
  );
}

function DefinitionSection({
  title,
  value,
}: {
  title: string;
  value: CanonicalJsonValue;
}) {
  if (title === "type" && value !== null) {
    return <DefinitionType value={value} path={title} />;
  }
  if (["inputs", "parameters", "outputs"].includes(title) && isRecord(value)) {
    return (
      <section aria-labelledby={`definition-${title}`}>
        <h2 id={`definition-${title}`} className="mb-3 font-label text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <div className="grid gap-3">
          {Object.entries(value).map(([name, child]) => (
            <DefinitionType key={name} value={child} path={name} />
          ))}
        </div>
      </section>
    );
  }
  return <JsonFallback value={value} label={title} />;
}

export default function ContractDefinitionPage() {
  const { kind = "", contractId = "", version = "" } = useParams<{
    kind: string;
    contractId: string;
    version: string;
  }>();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    if ((kind !== "data" && kind !== "action") || !contractId || !version) {
      setState({ status: "not-found" });
      return () => controller.abort();
    }

    const path = `/contracts/${encodeURIComponent(kind)}/${encodeURIComponent(contractId)}/${encodeURIComponent(version)}`;
    void getText(path, controller.signal)
      .then((source) => {
        const contract = readContract(source);
        if (contract.kind !== kind || contract.id !== contractId || contract.version !== version) {
          throw new TypeError("The retained contract response does not match the requested identity.");
        }
        if (!controller.signal.aborted) setState({ status: "loaded", contract });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isNotFoundError(error)) {
          setState({ status: "not-found" });
        } else {
          setState({
            status: "error",
            message: error instanceof ApiError ? "The retained definition could not be read." : "The retained definition is unavailable right now.",
          });
        }
      });
    return () => controller.abort();
  }, [kind, contractId, version]);

  if (state.status === "loading") {
    return <main className="mx-auto max-w-4xl px-6 py-12" role="status">Loading retained definition…</main>;
  }
  if (state.status === "not-found") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-label text-xl font-semibold text-ink">Retained definition unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">No retained contract matches this exact kind, identifier, and version.</p>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="font-label text-xl font-semibold text-ink">Could not inspect retained definition</h1>
        <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
      </main>
    );
  }

  const { contract } = state;
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="border-b border-[var(--color-ink-hairline)] pb-6">
        <p className="font-label text-xs uppercase tracking-[0.16em] text-muted-foreground">Retained {contract.kind} contract</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="break-all font-label text-2xl font-semibold text-ink">{contract.id}</h1>
          <span className="font-label text-sm text-muted-foreground">v{contract.version}</span>
        </div>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink">{contract.description}</p>
      </header>

      <section aria-labelledby="contract-definition-heading" className="flex flex-col gap-4">
        <div>
          <p className="font-label text-xs uppercase tracking-[0.16em] text-muted-foreground">Meaning</p>
          <h2 id="contract-definition-heading" className="mt-1 font-label text-lg font-semibold text-ink">Definition</h2>
        </div>
        {Object.entries(contract.definition).map(([name, value]) => (
          <DefinitionSection key={name} title={name} value={value} />
        ))}
      </section>
    </main>
  );
}
