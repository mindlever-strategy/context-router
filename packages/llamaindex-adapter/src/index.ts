/**
 * LlamaIndex Adapter for Context Router
 *
 * Bridges Context Router's structured state with LlamaIndex's retrieval capabilities.
 *
 * This package provides:
 * - Document storage with chunking
 * - Semantic retrieval (requires llamaindex peer dependency)
 * - Chat memory (requires llamaindex peer dependency)
 * - Automatic state synchronization
 *
 * @example
 * ```typescript
 * import {
 *   ContextRouterDocumentStore,
 * } from '@context-router/llamaindex-adapter';
 *
 * // Install llamaindex separately for full functionality:
 * // npm install llamaindex
 * ```
 */

// Storage exports
export {
  ContextRouterDocumentStore,
  type ContextRouterDocumentStoreConfig,
  type DocumentSearchResult,
} from './storage/index.js';

// Re-export types for convenience
export type {
  ContextRouterChatMemoryConfig,
  ChatMessage,
  MemoryContext,
  RetrievalFilters,
  ContextRouterRetrieverConfig,
  RetrievalResult,
  QueryResponse,
  ContextRouterQueryEngineConfig,
  StateSyncServiceConfig,
  SyncTriggers,
  SyncOptions,
  SyncEvent,
  ContextRouterKnowledgeGraphConfig,
  ExtractionOptions,
  StorageOptions,
  GraphQueryResult,
  EntityPath,
  MCPToolDefinition,
} from './storage/index.js';
