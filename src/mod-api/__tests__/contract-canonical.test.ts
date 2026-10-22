import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalizeContractJson,
  canonicalJson,
  contractFingerprint,
  parseExactContractJson,
} from "../src/contracts";

interface CanonicalVector {
  name: string;
  source: string;
  canonical: string;
}

interface ContractVector {
  name: string;
  source: string;
  canonical?: string;
  fingerprint?: string;
}

interface ContractVectors {
  canonical: CanonicalVector[];
  invalid: Array<{ name: string; source: string }>;
  contracts: ContractVector[];
  equivalentContracts: Array<ContractVector & { equivalentTo: string }>;
}

const vectorsPath = resolve(
  import.meta.dirname,
  "../../helix_core/mod_system/contract_golden_vectors.json",
);

async function readVectors(): Promise<ContractVectors> {
  return JSON.parse(await readFile(vectorsPath, "utf8")) as ContractVectors;
}

describe("canonical contract JSON", () => {
  it("normalizes exact decimal tokens without converting them to JavaScript numbers", () => {
    const source = '{"z":1.0,"b":-0.0,"a":123456789012345678901234567890.1200e+3}';

    expect(canonicalJson(parseExactContractJson(source))).toBe(
      '{"a":12345678901234567890123456789012e1,"b":0,"z":1e0}',
    );
  });

  it("matches shared Python vectors for Unicode scalar order and array order", async () => {
    const { canonical } = await readVectors();
    for (const vector of canonical) {
      expect(canonicalJson(parseExactContractJson(vector.source)), vector.name).toBe(
        vector.canonical,
      );
    }
    const reversed = canonical.find(({ name }) => name === "array-order-reversed");
    const original = canonical.find(({ name }) => name === "array-order-original");
    expect(reversed).toBeDefined();
    expect(original).toBeDefined();
    expect(reversed?.canonical).not.toBe(original?.canonical);
  });

  it("rejects duplicate object keys and unpaired Unicode surrogates", async () => {
    const { invalid } = await readVectors();
    for (const vector of invalid) {
      expect(() => parseExactContractJson(vector.source), vector.name).toThrow();
    }
  });

  it("canonicalizes complete contract envelopes from shared vectors", async () => {
    const { contracts } = await readVectors();
    for (const vector of contracts) {
      if (vector.canonical) {
        expect(canonicalizeContractJson(vector.source), vector.name).toBe(vector.canonical);
      }
    }
  });

  it("fingerprints contracts with exact definitions, descriptions, and versions", async () => {
    const { contracts } = await readVectors();
    const fingerprints = await Promise.all(contracts.map((vector) => contractFingerprint(vector.source)));

    expect(new Set(fingerprints).size).toBe(contracts.length);
    for (const [index, vector] of contracts.entries()) {
      if (vector.fingerprint) expect(fingerprints[index], vector.name).toBe(vector.fingerprint);
    }
  });

  it("gives equivalent whitespace, object order, and number spellings the same fingerprint", async () => {
    const { contracts, equivalentContracts } = await readVectors();
    const baseline = contracts.find(
      ({ name }) => name === "exact-scientific-number-and-unicode-description",
    );
    const equivalent = equivalentContracts[0];
    if (!baseline?.canonical || !baseline.fingerprint || !equivalent.canonical || !equivalent.fingerprint) {
      throw new Error("Equivalent contract vectors are incomplete.");
    }

    expect(equivalent.canonical).toBe(baseline.canonical);
    expect(equivalent.fingerprint).toBe(baseline.fingerprint);
    expect(canonicalizeContractJson(equivalent.source)).toBe(baseline.canonical);
    await expect(contractFingerprint(equivalent.source)).resolves.toBe(baseline.fingerprint);
  });
});
