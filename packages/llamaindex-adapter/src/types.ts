/**
 * LlamaIndex Adapter for Context Router
 * Type definitions shared across all modules
 */

import type { ContextRouter } from '@context-router/sdk';

// Re-export from Context Router SDK
export type { WorkflowSession } from '@context-router/sdk';

/**
 * Workflow state stored in Context Router
 */
export interface WorkflowState {
  workspaceId: string;
  workflowId: string;
  state: Record<string, unknown>;
  metadata?: {
    version: number;
    updatedAt: string;
    keys: string[];
  };
}

/**
 * Checkpoint data from Context Router
 */
export interface CheckpointData {
  id: string;
  workspaceId: string;
  workflowId: string;
  label?: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

/**
 * Configuration for embedding model
 */
export interface EmbeddingConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model?: string;
  dimensions?: number;
  apiKey?: string;
}

/**
 * Vector store backend configuration
 */
export interface VectorStoreConfig {
  type: 'pgvector' | 'chromadb' | 'qdrant' | 'in-memory';
  connectionString?: string;
  collectionName?: string;
  dimensions?: number;
}

/**
 * Storage options for document indexing
 */
export interface StorageOptions {
  vectorStore?: VectorStoreConfig;
  embedding?: EmbeddingConfig;
  includeMetadata?: boolean;
  includeProvenance?: boolean;
}

/**
 * Query options for retrieval
 */
export interface QueryOptions {
  topK?: number;
  filters?: Record<string, unknown>;
  similarityThreshold?: number;
}

/**
 * Index statistics
 */
export interface IndexStats {
  workflowCount: number;
  documentCount: number;
  indexSize: number;
}

/**
 * Entity extracted from workflow state
 */
export interface Entity {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  source: {
    workflowId: string;
    key: string;
  };
}

/**
 * Relationship between entities
 */
export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Query result from knowledge graph
 */
export interface QueryResult {
  nodes: Entity[];
  edges: Relationship[];
}

/**
 * ContextRouter instance type (flexible for SDK compatibility)
 */
export type ContextRouterInstance = ContextRouter | unknown;

/**
 * Document metadata for indexing
 */
export interface DocumentMetadata {
  workflowId: string;
  key: string;
  workspaceId: string;
  valueType?: string;
  updatedAt?: string;
  type?: string;
}

/**
 * Re-ranking configuration
 */
export interface RerankingConfig {
  enabled: boolean;
  model?: string;
  topN?: number;
  scoreThreshold?: number;
}
