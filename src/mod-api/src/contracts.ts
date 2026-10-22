/** Public declarations and exact JSON helpers for retained scientific contracts. */

export type ContractKind = "data" | "action";

export interface ContractReference {
  readonly kind: ContractKind;
  readonly id: string;
  readonly version: string;
}

export interface ContractTypeDescription {
  readonly description?: string;
}

/** Numbers in parsed contract JSON may be exact token objects. */
export type ContractNumber = number | ExactJsonNumber;

export type ContractType =
  | (ContractTypeDescription & {
      readonly type: "string";
      readonly minLength?: ContractNumber;
      readonly maxLength?: ContractNumber;
      readonly enum?: readonly string[];
    })
  | (ContractTypeDescription & {
      readonly type: "date" | "datetime";
      readonly minimum?: string;
      readonly maximum?: string;
      readonly enum?: readonly string[];
    })
  | (ContractTypeDescription & {
      readonly type: "number";
      readonly minimum?: ContractNumber;
      readonly maximum?: ContractNumber;
      readonly enum?: readonly ContractNumber[];
    })
  | (ContractTypeDescription & {
      readonly type: "boolean";
      readonly enum?: readonly boolean[];
    })
  | (ContractTypeDescription & {
      readonly type: "object";
      readonly fields: Readonly<Record<string, ContractType>>;
      readonly additionalValues?: ContractType;
    })
  | (ContractTypeDescription & {
      readonly type: "array";
      readonly items: ContractType;
      readonly minItems?: ContractNumber;
      readonly maxItems?: ContractNumber;
    })
  | (ContractTypeDescription & {
      readonly type: "optional";
      readonly valueType: ContractType;
    })
  | (ContractTypeDescription & {
      readonly type: "variant";
      readonly tag: string;
      readonly cases: Readonly<Record<string, ContractType>>;
    })
  | {
      readonly type: "quantity";
      readonly valueType: "number";
      readonly unit: string;
      readonly description: string;
    }
  | {
      readonly type: "recordReference" | "attachmentReference";
      readonly description?: string;
    }
  | {
      readonly type: "contract";
      readonly kind: ContractKind;
      readonly id: string;
      readonly version: string;
    };

export interface DataContractDefinition {
  readonly type: ContractType;
  readonly requiredValidators?: readonly string[];
}

export interface ActionContractDefinition {
  readonly inputs: Readonly<Record<string, ContractType>>;
  readonly parameters: Readonly<Record<string, ContractType>>;
  readonly outputs: Readonly<Record<string, ContractType>>;
  readonly targets: Readonly<Record<string, unknown>> | readonly unknown[];
  readonly effects: Readonly<Record<string, unknown>> | readonly unknown[];
  readonly requiredValidators?: readonly string[];
}

interface ContractEnvelopeBase {
  readonly formatVersion: 1 | ExactJsonNumber;
  readonly id: string;
  readonly version: string;
  readonly description: string;
}

export interface DataContractEnvelope extends ContractEnvelopeBase {
  readonly kind: "data";
  readonly definition: DataContractDefinition;
}

export interface ActionContractEnvelope extends ContractEnvelopeBase {
  readonly kind: "action";
  readonly definition: ActionContractDefinition;
}

export type ContractEnvelope = DataContractEnvelope | ActionContractEnvelope;

declare const exactNumberBrand: unique symbol;

/** A JSON number token retained exactly, without passing through `Number`. */
export interface ExactJsonNumber {
  readonly [exactNumberBrand]: true;
  /** Canonical number spelling, such as `123e-2` or `0`. */
  readonly canonical: string;
}

export type CanonicalJsonValue =
  | null
  | boolean
  | string
  | ExactJsonNumber
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

const EXACT_NUMBER_BRAND: unique symbol = Symbol("ExactJsonNumber");

interface BrandedExactJsonNumber extends ExactJsonNumber {
  readonly [EXACT_NUMBER_BRAND]: true;
}

function exactNumber(canonical: string): BrandedExactJsonNumber {
  return { canonical, [EXACT_NUMBER_BRAND]: true } as BrandedExactJsonNumber;
}

export function isExactJsonNumber(value: unknown): value is ExactJsonNumber {
  return typeof value === "object" && value !== null && EXACT_NUMBER_BRAND in value;
}

function normalizeNumber(token: string): string {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new SyntaxError("Invalid JSON number");

  const [, sign, integer, fraction = "", exponentToken = "0"] = match;
  let digits = integer + fraction;
  let exponent = BigInt(exponentToken) - BigInt(fraction.length);
  digits = digits.replace(/^0+/, "");
  if (digits.length === 0) return "0";
  const trailingZeroes = /0+$/.exec(digits)?.[0].length ?? 0;
  if (trailingZeroes > 0) {
    digits = digits.slice(0, -trailingZeroes);
    exponent += BigInt(trailingZeroes);
  }
  return `${sign}${digits}e${exponent.toString()}`;
}

class ExactJsonParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): CanonicalJsonValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new SyntaxError("Unexpected JSON content");
    return value;
  }

  private parseValue(): CanonicalJsonValue {
    const next = this.source[this.index];
    if (next === "{") return this.parseObject();
    if (next === "[") return this.parseArray();
    if (next === '"') return this.parseString();
    if (next === "t") return this.parseLiteral("true", true);
    if (next === "f") return this.parseLiteral("false", false);
    if (next === "n") return this.parseLiteral("null", null);
    return this.parseNumber();
  }

  private parseObject(): { [key: string]: CanonicalJsonValue } {
    this.index += 1;
    this.skipWhitespace();
    const result: { [key: string]: CanonicalJsonValue } = Object.create(null) as {
      [key: string]: CanonicalJsonValue;
    };
    const keys = new Set<string>();
    if (this.consume("}")) return result;

    while (true) {
      if (this.source[this.index] !== '"') throw new SyntaxError("Expected JSON object key");
      const key = this.parseString();
      if (keys.has(key)) throw new SyntaxError(`Duplicate JSON key ${JSON.stringify(key)}`);
      keys.add(key);
      this.skipWhitespace();
      if (!this.consume(":")) throw new SyntaxError("Expected colon after JSON object key");
      this.skipWhitespace();
      result[key] = this.parseValue();
      this.skipWhitespace();
      if (this.consume("}")) return result;
      if (!this.consume(",")) throw new SyntaxError("Expected comma in JSON object");
      this.skipWhitespace();
    }
  }

  private parseArray(): CanonicalJsonValue[] {
    this.index += 1;
    this.skipWhitespace();
    const result: CanonicalJsonValue[] = [];
    if (this.consume("]")) return result;

    while (true) {
      result.push(this.parseValue());
      this.skipWhitespace();
      if (this.consume("]")) return result;
      if (!this.consume(",")) throw new SyntaxError("Expected comma in JSON array");
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === '"') {
        this.index += 1;
        const value = JSON.parse(this.source.slice(start, this.index)) as string;
        validateUnicode(value);
        return value;
      }
      if (character === "\\") {
        this.index += 2;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) throw new SyntaxError("Unescaped control character in JSON string");
      this.index += 1;
    }
    throw new SyntaxError("Unterminated JSON string");
  }

  private parseNumber(): ExactJsonNumber {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.index),
    );
    if (!match) throw new SyntaxError("Expected JSON value");
    this.index += match[0].length;
    return exactNumber(normalizeNumber(match[0]));
  }

  private parseLiteral<T extends null | boolean>(token: string, value: T): T {
    if (this.source.slice(this.index, this.index + token.length) !== token) {
      throw new SyntaxError("Invalid JSON literal");
    }
    this.index += token.length;
    return value;
  }

  private consume(character: string): boolean {
    if (this.source[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private skipWhitespace(): void {
    while ([" ", "\t", "\n", "\r"].includes(this.source[this.index] ?? "")) this.index += 1;
  }
}

function validateUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const current = value.charCodeAt(index);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new SyntaxError("Unpaired Unicode surrogate");
      index += 1;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      throw new SyntaxError("Unpaired Unicode surrogate");
    }
  }
}

function compareUnicodeScalars(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** Parse strict JSON while keeping each number token exact and rejecting duplicate keys. */
export function parseExactContractJson(source: string): CanonicalJsonValue {
  return new ExactJsonParser(source).parse();
}

/** Encode parsed JSON using the Python contract encoder's version 1 rules. */
export function canonicalJson(value: CanonicalJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    validateUnicode(value);
    return JSON.stringify(value);
  }
  if (isExactJsonNumber(value)) return value.canonical;
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).sort(([left], [right]) => compareUnicodeScalars(left, right));
  return `{${entries.map(([key, item]) => `${canonicalJson(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function isRecord(value: CanonicalJsonValue): value is { readonly [key: string]: CanonicalJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isExactJsonNumber(value);
}

/** Canonicalize a contract document received as raw JSON text. */
export function canonicalizeContractJson(source: string): string {
  const value = parseExactContractJson(source);
  if (!isRecord(value)) throw new TypeError("Contract envelope must be an object");
  const required = ["formatVersion", "kind", "id", "version", "description", "definition"];
  if (Object.keys(value).length !== required.length || required.some((key) => !(key in value))) {
    throw new TypeError("Contract envelope has missing or unsupported keys");
  }
  if (!isExactJsonNumber(value.formatVersion) || value.formatVersion.canonical !== "1e0") {
    throw new TypeError("Unsupported contract formatVersion");
  }
  if (value.kind !== "data" && value.kind !== "action") {
    throw new TypeError("Contract kind must be data or action");
  }
  if (typeof value.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.id)) {
    throw new TypeError("Contract id must be a publisher-qualified lowercase identifier");
  }
  if (typeof value.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.test(value.version)) {
    throw new TypeError("Contract version must be an exact SemVer");
  }
  if (typeof value.description !== "string" || value.description.trim().length === 0) {
    throw new TypeError("Contract description is required");
  }
  if (!isRecord(value.definition)) throw new TypeError("Contract definition must be an object");
  return canonicalJson(value);
}

/** SHA-256 fingerprint for a retained contract, including its domain separator. */
export async function contractFingerprint(source: string): Promise<string> {
  const canonical = canonicalizeContractJson(source);
  const bytes = new TextEncoder().encode(`helix.contract.v1\0${canonical}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
