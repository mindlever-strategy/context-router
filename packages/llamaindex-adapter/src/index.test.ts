import { describe, expect, it } from 'vitest';
import { ContextRouterDocumentStore } from './index.js';

describe('ContextRouterDocumentStore', () => {
  it('creates a store with default chunk settings', () => {
    const store = new ContextRouterDocumentStore({
      serverUrl: 'http://localhost:3000',
    });
    expect(store).toBeInstanceOf(ContextRouterDocumentStore);
  });

  it('chunks documents and returns generated ids', async () => {
    const store = new ContextRouterDocumentStore({
      serverUrl: 'http://localhost:3000',
      defaultChunkSize: 3,
      defaultChunkOverlap: 1,
    });

    const result = await store.addDocuments([
      { text: 'one two three four five six', metadata: { source: 'test' } },
    ]);

    expect(result.ids.length).toBeGreaterThan(0);
    expect(result.ids.every((id) => id.startsWith('doc_'))).toBe(true);
  });

  it('returns empty search results in stub mode', async () => {
    const store = new ContextRouterDocumentStore({
      serverUrl: 'http://localhost:3000',
    });

    const results = await store.search('anything');
    expect(results).toEqual([]);
  });

  it('accepts delete without throwing', async () => {
    const store = new ContextRouterDocumentStore({
      serverUrl: 'http://localhost:3000',
    });

    await expect(store.delete('doc_1')).resolves.toBeUndefined();
  });
});
