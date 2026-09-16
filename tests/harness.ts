import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect } from 'vitest';

import { createServer } from '../src/index';

export interface Harness {
  client: Client;
  close: () => Promise<void>;
}

/** Connect an in-memory MCP client to a fresh Harpd server. */
export async function connect(): Promise<Harness> {
  const server = createServer();
  const client = new Client({ name: 'harpd-mcp-tests', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Call a tool and parse its JSON text payload. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ payload: any; isError: boolean }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = result.content?.find((part) => part.type === 'text')?.text ?? '';
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  return { payload, isError: Boolean(result.isError) };
}

/**
 * Assert a call was rejected by input validation, whether the SDK surfaced it
 * as an isError result or as a thrown protocol error.
 */
export async function expectRejected(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  try {
    const { isError, payload } = await call(client, name, args);
    expect(
      isError,
      `expected ${name} to reject ${JSON.stringify(args)} but it succeeded with ${JSON.stringify(payload).slice(0, 200)}`,
    ).toBe(true);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }
}

/** Every provenance envelope must carry these keys. */
export const REQUIRED_PROVENANCE_KEYS = [
  'source',
  'sourceUrl',
  'dataset',
  'datasetId',
  'updatedAt',
  'license',
  'attribution',
  'canonicalUrl',
  'citationUrl',
  'evidence',
] as const;

export interface ProvenanceFinding {
  path: string;
  provenance: Record<string, any>;
}

/** Recursively collect every `provenance` object in a payload. */
export function collectProvenance(value: unknown, path = '$'): ProvenanceFinding[] {
  const found: ProvenanceFinding[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => found.push(...collectProvenance(entry, `${path}[${index}]`)));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'provenance' && child && typeof child === 'object') {
        found.push({ path: `${path}.provenance`, provenance: child as Record<string, any> });
      }
      found.push(...collectProvenance(child, `${path}.${key}`));
    }
  }
  return found;
}

/** Collect every `results[]` entry in a payload (recursively). */
export function collectResultEntries(value: unknown): Array<Record<string, any>> {
  const entries: Array<Record<string, any>> = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => entries.push(...collectResultEntries(entry)));
    return entries;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'results' && Array.isArray(child)) {
        child.forEach((entry) => {
          if (entry && typeof entry === 'object') entries.push(entry as Record<string, any>);
        });
      }
      entries.push(...collectResultEntries(child));
    }
  }
  return entries;
}

/** Assert a provenance object is complete and well-formed. */
export function assertProvenance(provenance: Record<string, any>, path: string): void {
  for (const key of REQUIRED_PROVENANCE_KEYS) {
    expect(provenance, `${path} is missing "${key}"`).toHaveProperty(key);
  }
  expect(provenance.source, `${path}.source`).toBe('Harpd');
  expect(typeof provenance.dataset, `${path}.dataset`).toBe('string');
  expect(provenance.dataset, `${path}.dataset`).toMatch(/^data\/.+\.json$/);
  // Datasets publish timestamps at different granularities (research.json uses
  // a month key, evidence.json a date). Provenance must report the real value
  // rather than inventing precision.
  expect(provenance.updatedAt, `${path}.updatedAt`).toMatch(
    /^\d{4}-\d{2}(-\d{2}(T[\d:.]+Z?)?)?$/,
  );
  expect(provenance.license, `${path}.license`).toBeTruthy();
  expect(provenance.attribution, `${path}.attribution`).toContain('Harpd');

  expect(provenance.evidence, `${path}.evidence`).toBeTypeOf('object');
  expect(Array.isArray(provenance.evidence.claimIds), `${path}.evidence.claimIds`).toBe(true);
  expect(provenance.evidence.datasetUrl, `${path}.evidence.datasetUrl`).toMatch(/^https:\/\/harpd\.com\//);
  expect(provenance.evidence.citation, `${path}.evidence.citation`).toContain('CC BY 4.0');
  if (provenance.evidence.methodologyUrl !== null) {
    expect(provenance.evidence.methodologyUrl, `${path}.evidence.methodologyUrl`).toMatch(
      /^https:\/\/harpd\.com\//,
    );
  }

  // Source URL must be a real, parseable URL.
  expect(() => new URL(provenance.sourceUrl), `${path}.sourceUrl`).not.toThrow();
  expect(() => new URL(provenance.canonicalUrl), `${path}.canonicalUrl`).not.toThrow();
  expect(() => new URL(provenance.citationUrl), `${path}.citationUrl`).not.toThrow();
  expect(provenance.canonicalUrl).toMatch(/^https:\/\/harpd\.com\//);
}
